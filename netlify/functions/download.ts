import { Context } from "@netlify/functions";
import {
  scrapeYouTubeComments,
  convertToCSV,
  SortBy, 
  UploadDate,
  MetadataField,
  MetadataConfig
} from '../utils/youtube-scraper';

/**
 * API Download function handler that returns a complete CSV file
 * using Netlify Functions 2.0
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

  try {
    // Set a 30-second timeout for this function (3x longer than the streaming endpoint)
    context.waitUntil(new Promise(resolve => setTimeout(resolve, 30000)));

    // Use the same scraper utility but buffer all results
    const allComments: any[] = [];
    const result = await scrapeYouTubeComments(
      {
        query,
        maxVideos,
        maxVidComments, 
        maxComments,
        uploadDate,
        sortBy
      },
      {
        onComments: async (comments) => {
          // Filter comments to only include selected fields
          if (metadataConfig.selectedFields.length < Object.keys(comments[0] || {}).length) {
            comments = comments.map(comment => {
              const filteredComment: any = {};
              metadataConfig.selectedFields.forEach(field => {
                if (field in comment) {
                  filteredComment[field] = comment[field as keyof typeof comment];
                }
              });
              return filteredComment;
            });
          }
          
          allComments.push(...comments);
        },
        onError: async (error) => {
          console.error('Error during scraping:', error);
        }
      }
    );

    // Generate CSV from all collected comments
    const csv = convertToCSV(allComments, metadataConfig);
    
    // Sanitize filename - replace spaces and special characters
    const sanitizedQuery = query.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    
    // Return the CSV file
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="youtube-comments-${sanitizedQuery}-${Date.now()}.csv"`,
        'Cache-Control': 'no-cache'
      }
    });
    
  } catch (error) {
    // Handle errors
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : String(error) 
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    });
  }
}
