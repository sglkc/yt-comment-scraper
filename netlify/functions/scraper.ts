import { Handler } from "@netlify/functions";
import { Innertube, YTNodes } from 'youtubei.js';

// Define upload date and sort by types as they're not exported directly from YT namespace
type UploadDate = 'hour' | 'today' | 'week' | 'month' | 'year' | 'all';
type SortBy = 'relevance' | 'rating' | 'upload_date' | 'view_count';

/**
 * Scraping komentar dari video youtube untuk API
 * @param comments - YouTube comments object
 * @param metadata - Video metadata
 * @param maxVidComments - Maximum comments per video
 * @param maxComments - Maximum total comments
 * @param dataset - Dataset array to fill
 * @param counters - Counters object
 */
async function scrapeComments(
  comments: any, // Use any for now as we don't have direct access to the Comments type
  metadata: { id: string, channel: string, title: string },
  maxVidComments: number,
  maxComments: number,
  dataset: any[],
  counters: { comments: number }
) {
  try {
    for (const { comment } of comments.contents) {
      if (counters.comments >= maxVidComments || dataset.length >= maxComments) {
        counters.comments = 0;
        return;
      }

      const author = comment?.author?.name.slice(1);
      const text = comment?.content?.toString();

      if (!author || !text) continue;

      dataset.push({ ...metadata, author, comment: text, label: 0 });
      counters.comments++;
    }

    if (!comments.has_continuation) return;

    const continuation = await comments.getContinuation();
    await scrapeComments(continuation, metadata, maxVidComments, maxComments, dataset, counters);
  } catch (error) {
    console.error('Error scraping comments:', error instanceof Error ? error.message : String(error));
  }
}

/**
 * API Scraper function handler
 */
export const handler: Handler = async (event) => {
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

  try {
    // Initialize dataset and counters
    const dataset: any[] = [];
    const counters = { comments: 0, videos: 0 };

    // Create Innertube client
    const innertube = await Innertube.create({ lang: 'id', location: 'ID' });
    
    // Search for videos
    let search = await innertube.search(query, {
      type: 'video',
      upload_date: uploadDate,
      sort_by: sortBy
    });

    // Process search results
    let videosProcessed = 0;
    
    while (search && videosProcessed < maxVideos && dataset.length < maxComments) {
      for (const video of search.videos) {
        if (dataset.length >= maxComments || videosProcessed >= maxVideos) break;
        
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

        try {
          // Get comments for the video
          const comments = await innertube.getComments(video.id, 'NEWEST_FIRST');
          counters.comments = 0;
          
          // Scrape comments from the video
          await scrapeComments(comments, metadata, maxVidComments, maxComments, dataset, counters);
          videosProcessed++;
        } catch (error) {
          console.error(`Error processing video ${video.id}:`, error instanceof Error ? error.message : String(error));
          continue;
        }
      }

      // Check if we need to fetch more videos
      if (!search.has_continuation || dataset.length >= maxComments || videosProcessed >= maxVideos) break;
      
      // Get next page of search results
      search = await search.getContinuation();
    }

    // Return the results
    return {
      statusCode: 200,
      body: JSON.stringify({
        query,
        videosScraped: videosProcessed,
        totalComments: dataset.length,
        data: dataset
      })
    };
  } catch (error) {
    console.error('Error in scraper function:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'An error occurred while scraping', 
        message: error instanceof Error ? error.message : String(error) 
      })
    };
  }
};