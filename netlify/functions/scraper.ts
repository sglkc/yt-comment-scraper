import { HandlerEvent, HandlerContext } from "@netlify/functions";
import { Innertube, YTNodes } from 'youtubei.js';

// Define upload date and sort by types as they're not exported directly from YT namespace
type UploadDate = 'hour' | 'today' | 'week' | 'month' | 'year' | 'all';
type SortBy = 'relevance' | 'rating' | 'upload_date' | 'view_count';

// Create a stream response helper
const streamResponse = () => {
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const write = async (data: any) => {
    // Add a prefix to help identify this as a data chunk
    await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
  };

  const close = () => writer.close();

  return { stream: stream.readable, write, close };
};

// Track execution time to respect the 30-second limit
const startTime = () => {
  const start = Date.now();
  // Allow 29.5 seconds max (giving 0.5s buffer)
  const MAX_EXECUTION_TIME = 29500;
  
  return {
    hasTimeLeft: () => {
      return (Date.now() - start) < MAX_EXECUTION_TIME;
    },
    getElapsedTime: () => {
      return Date.now() - start;
    }
  };
};

/**
 * Scrapes comments from a video and sends them via stream
 */
async function scrapeComments(
  comments: any,
  metadata: { id: string, channel: string, title: string },
  maxVidComments: number,
  maxComments: number, 
  counter: { comments: number },
  streamWriter: { write: (data: any) => Promise<void> },
  timer: { hasTimeLeft: () => boolean, getElapsedTime: () => number }
): Promise<number> {
  try {
    // Process comments in batches for better streaming experience
    let batch: any[] = [];
    const BATCH_SIZE = 5;
    
    for (const { comment } of comments.contents) {
      if (counter.comments >= maxVidComments || !timer.hasTimeLeft()) {
        counter.comments = 0;
        if (batch.length > 0) {
          await streamWriter.write({ type: 'comments', data: batch });
        }
        return maxComments;
      }

      const author = comment?.author?.name.slice(1);
      const text = comment?.content?.toString();

      if (!author || !text) continue;
      
      const commentData = { ...metadata, author, comment: text, label: 0 };
      batch.push(commentData);
      counter.comments++;
      
      // Send batch when it reaches the batch size
      if (batch.length >= BATCH_SIZE) {
        await streamWriter.write({ type: 'comments', data: batch });
        maxComments -= batch.length;
        batch = [];
        
        if (maxComments <= 0) {
          return 0;
        }
      }
    }

    // Send any remaining comments
    if (batch.length > 0) {
      await streamWriter.write({ type: 'comments', data: batch });
      maxComments -= batch.length;
    }

    if (!comments.has_continuation || !timer.hasTimeLeft() || maxComments <= 0) {
      return maxComments;
    }

    const continuation = await comments.getContinuation();
    return await scrapeComments(continuation, metadata, maxVidComments, maxComments, counter, streamWriter, timer);
  } catch (error) {
    console.error('Error scraping comments:', error instanceof Error ? error.message : String(error));
    return maxComments;
  }
}

/**
 * API Scraper function handler that uses streaming responses
 */
export async function handler(event: HandlerEvent, context: HandlerContext) {
  // Parse query parameters with defaults
  const query = event.queryStringParameters?.query || 'deddy corbuzier';
  const maxVideos = parseInt(event.queryStringParameters?.maxVideos || '20', 10);
  const maxVidComments = parseInt(event.queryStringParameters?.maxVidComments || '100', 10);
  const maxComments = parseInt(event.queryStringParameters?.maxComments || '500', 10);
  const uploadDate = event.queryStringParameters?.uploadDate as UploadDate || 'week';
  const sortBy = event.queryStringParameters?.sortBy as SortBy || 'view_count';
  
  // Check for valid parameters
  if (maxVideos > 50 || maxVidComments > 500 || maxComments > 1000) {
    return {
      statusCode: 400,
      body: JSON.stringify({ 
        error: 'Parameter limits exceeded',
        message: 'For API usage: maxVideos ≤ 50, maxVidComments ≤ 500, maxComments ≤ 1000'
      })
    };
  }

  // Setup streaming response
  const { stream, write, close } = streamResponse();
  const timer = startTime();
  
  // Setup execution context
  const counters = { comments: 0, videos: 0 };
  let commentsRemaining = maxComments;

  // Return streaming response immediately
  const response = {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
    body: stream,
  };

  // Process in the background and stream results
  (async () => {
    try {
      // Initial metadata
      await write({ 
        type: 'info', 
        query, 
        maxVideos, 
        maxComments: commentsRemaining
      });

      // Create Innertube client
      const innertube = await Innertube.create({ lang: 'id', location: 'ID' });
      
      // Search for videos
      let search = await innertube.search(query, {
        type: 'video',
        upload_date: uploadDate,
        sort_by: sortBy
      });
      
      // Stream search metadata to the client
      await write({ 
        type: 'search', 
        totalVideos: search.videos.length 
      });

      // Process search results
      let videosProcessed = 0;
      
      while (search && videosProcessed < maxVideos && commentsRemaining > 0 && timer.hasTimeLeft()) {
        for (const video of search.videos) {
          if (commentsRemaining <= 0 || videosProcessed >= maxVideos || !timer.hasTimeLeft()) break;
          
          // Skip certain video types that don't have the required properties
          if (
            video instanceof YTNodes.ShortsLockupView ||
            video instanceof YTNodes.PlaylistPanelVideo ||
            video instanceof YTNodes.WatchCardCompactVideo ||
            video instanceof YTNodes.ReelItem
          ) continue;
          
          // Ensure video has required properties
          if (!video.id || !video.title || !video.author) continue;

          const metadata = {
            id: video.id,
            title: video.title.toString(),
            channel: video.author.name,
          };

          // Stream video metadata
          await write({ 
            type: 'video', 
            video: metadata,
            videoNumber: videosProcessed + 1
          });

          try {
            // Get comments for the video
            const comments = await innertube.getComments(video.id, 'NEWEST_FIRST');
            counters.comments = 0;
            
            // Scrape comments from the video
            commentsRemaining = await scrapeComments(
              comments, 
              metadata, 
              maxVidComments, 
              commentsRemaining, 
              counters, 
              { write }, 
              timer
            );
            
            videosProcessed++;
            
            // Stream progress update
            await write({ 
              type: 'progress', 
              videosProcessed, 
              commentsFound: maxComments - commentsRemaining,
              timeElapsed: timer.getElapsedTime() / 1000
            });
            
          } catch (error) {
            // Stream error info
            await write({ 
              type: 'error', 
              message: `Error processing video ${video.id}: ${error instanceof Error ? error.message : String(error)}`
            });
            continue;
          }
        }

        // Check if we need to fetch more videos
        if (!search.has_continuation || commentsRemaining <= 0 || videosProcessed >= maxVideos || !timer.hasTimeLeft()) break;
        
        // Get next page of search results
        search = await search.getContinuation();
      }

      // Send completion message with summary
      await write({ 
        type: 'complete', 
        videosScraped: videosProcessed,
        totalComments: maxComments - commentsRemaining,
        timeElapsed: timer.getElapsedTime() / 1000,
        timedOut: !timer.hasTimeLeft()
      });
      
    } catch (error) {
      // Send error message
      await write({ 
        type: 'error', 
        message: error instanceof Error ? error.message : String(error) 
      });
    } finally {
      // Close the stream
      close();
    }
  })();

  return response;
}