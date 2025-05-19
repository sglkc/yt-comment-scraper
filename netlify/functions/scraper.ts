import { Context } from "@netlify/functions";
import {
  scrapeYouTubeComments,
  CommentData,
  VideoMetadata,
  SortBy,
  UploadDate,
  MetadataField,
  MetadataConfig
} from "../utils/youtube-scraper.js";

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

  // Get metadata configuration
  const selectedFields = url.searchParams.get('selectedFields') ? 
    url.searchParams.get('selectedFields')!.split(',') as MetadataField[] : 
    ['label', 'author', 'comment', 'id', 'channel', 'title'];
  
  const columnOrder = url.searchParams.get('columnOrder') ? 
    url.searchParams.get('columnOrder')!.split(',') as MetadataField[] : 
    selectedFields;
    
  const metadataConfig: MetadataConfig = {
    selectedFields,
    columnOrder
  };

  const encoder = new TextEncoder();

  // Create a streaming response using the modern Netlify Functions 2.0 API
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Use the shared scraper utility with streaming-specific handlers
        await scrapeYouTubeComments(
          {
            query,
            maxVideos,
            maxVidComments,
            maxComments,
            uploadDate,
            sortBy
          },
          {
            onStart: async () => {
              // Initial metadata
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'info',
                query,
                maxVideos,
                maxComments
              })}\n\n`));
            },
            
            onSearch: async (search) => {
              // Stream search metadata to the client
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'search',
                totalVideos: search.videos.length
              })}\n\n`));
            },
            
            onVideo: async (metadata, videoNumber) => {
              // Stream video metadata
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'video',
                video: metadata,
                videoNumber
              })}\n\n`));
            },
            
            onComments: async (comments, metadata) => {
              // Filter comments to only include selected fields
              if (metadataConfig.selectedFields.length < Object.keys(comments[0] || {}).length) {
                comments = comments.map(comment => {
                  const filteredComment: any = {};
                  metadataConfig.selectedFields.forEach(field => {
                    if (comment[field as keyof CommentData] !== undefined) {
                      filteredComment[field] = comment[field as keyof CommentData];
                    }
                  });
                  return filteredComment as CommentData;
                });
              }
              
              // Stream comments in batches
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'comments',
                data: comments
              })}\n\n`));
            },
            
            onProgress: async (stats) => {
              // Stream progress update
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'progress',
                videosProcessed: stats.videosProcessed,
                commentsFound: stats.commentsFound,
                timeElapsed: stats.timeElapsed
              })}\n\n`));
            },
            
            onError: async (error, context) => {
              // Stream error info
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'error',
                message: `Error ${context ? 'in ' + context : ''}: ${error.message}`
              })}\n\n`));
            },
            
            onComplete: async (stats) => {
              // Send completion message with summary
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'complete',
                videosScraped: stats.videosScraped,
                totalComments: stats.totalComments,
                timeElapsed: stats.timeElapsed,
                timedOut: stats.timedOut
              })}\n\n`));
            }
          }
        );
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