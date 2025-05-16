import { Context } from "@netlify/functions";
import { Innertube, YTNodes } from 'youtubei.js';

// Define upload date and sort by types as they're not exported directly from YT namespace
type UploadDate = 'hour' | 'today' | 'week' | 'month' | 'year' | 'all';
type SortBy = 'relevance' | 'rating' | 'upload_date' | 'view_count';

// Track execution time to respect the 10-second limit
const startTime = () => {
  const start = Date.now();
  // Allow 9 seconds max (giving 1s buffer)
  const MAX_EXECUTION_TIME = 9000;
  
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
 * Scrapes comments from a video and streams them to the client
 */
async function scrapeComments(
  comments: any,
  metadata: { id: string, channel: string, title: string },
  maxVidComments: number,
  maxComments: number, 
  counter: { comments: number },
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
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
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'comments', data: batch })}\n\n`));
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
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'comments', data: batch })}\n\n`));
        maxComments -= batch.length;
        batch = [];
        
        if (maxComments <= 0) {
          return 0;
        }
      }
    }

    // Send any remaining comments
    if (batch.length > 0) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'comments', data: batch })}\n\n`));
      maxComments -= batch.length;
    }

    if (!comments.has_continuation || !timer.hasTimeLeft() || maxComments <= 0) {
      return maxComments;
    }

    const continuation = await comments.getContinuation();
    return await scrapeComments(continuation, metadata, maxVidComments, maxComments, counter, controller, encoder, timer);
  } catch (error) {
    console.error('Error scraping comments:', error instanceof Error ? error.message : String(error));
    return maxComments;
  }
}

/**
 * API Scraper function handler that uses streaming responses with Netlify Functions 2.0
 */
export default async function handler(req: Request, context: Context) {
  // Get URL parameters
  const url = new URL(req.url);
  const query = url.searchParams.get('query') || 'berita terkini';
  const maxVideos = parseInt(url.searchParams.get('maxVideos') || '20', 10);
  const maxVidComments = parseInt(url.searchParams.get('maxVidComments') || '100', 10);
  const maxComments = parseInt(url.searchParams.get('maxComments') || '500', 10);
  const uploadDate = url.searchParams.get('uploadDate') as UploadDate || 'week';
  const sortBy = url.searchParams.get('sortBy') as SortBy || 'view_count';
  
  // Check for valid parameters
  // if (maxVideos > 50 || maxVidComments > 500 || maxComments > 1000) {
  //   return new Response(
  //     JSON.stringify({ 
  //       error: 'Parameter limits exceeded',
  //       message: 'For API usage: maxVideos ≤ 50, maxVidComments ≤ 500, maxComments ≤ 1000'
  //     }),
  //     {
  //       status: 400,
  //       headers: { 'Content-Type': 'application/json' }
  //     }
  //   );
  // }

  const encoder = new TextEncoder();
  const timer = startTime();
  
  // Setup execution context
  const counters = { comments: 0, videos: 0 };
  let commentsRemaining = maxComments;

  // Create a streaming response using the modern Netlify Functions 2.0 API
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Initial metadata
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          type: 'info', 
          query, 
          maxVideos, 
          maxComments: commentsRemaining 
        })}\n\n`));

        // Create Innertube client
        const innertube = await Innertube.create({ lang: 'id', location: 'ID' });
        
        // Search for videos
        let search = await innertube.search(query, {
          type: 'video',
          upload_date: uploadDate,
          sort_by: sortBy
        });
        
        // Stream search metadata to the client
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          type: 'search', 
          totalVideos: search.videos.length 
        })}\n\n`));

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
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
              type: 'video', 
              video: metadata,
              videoNumber: videosProcessed + 1
            })}\n\n`));

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
                controller,
                encoder,
                timer
              );
              
              videosProcessed++;
              
              // Stream progress update
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                type: 'progress', 
                videosProcessed, 
                commentsFound: maxComments - commentsRemaining,
                timeElapsed: timer.getElapsedTime() / 1000
              })}\n\n`));
              
            } catch (error) {
              // Stream error info
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                type: 'error', 
                message: `Error processing video ${video.id}: ${error instanceof Error ? error.message : String(error)}`
              })}\n\n`));
              continue;
            }
          }

          // Check if we need to fetch more videos
          if (!search.has_continuation || commentsRemaining <= 0 || videosProcessed >= maxVideos || !timer.hasTimeLeft()) break;
          
          // Get next page of search results
          search = await search.getContinuation();
        }

        // Send completion message with summary
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          type: 'complete', 
          videosScraped: videosProcessed,
          totalComments: maxComments - commentsRemaining,
          timeElapsed: timer.getElapsedTime() / 1000,
          timedOut: !timer.hasTimeLeft()
        })}\n\n`));
        
      } catch (error) {
        // Send error message
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          type: 'error', 
          message: error instanceof Error ? error.message : String(error) 
        })}\n\n`));
      } finally {
        // Close the stream
        controller.close();
      }
    }
  });

  // Return a streaming response using Netlify Functions 2.0 API
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  });
}