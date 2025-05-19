import { Context } from "@netlify/functions";
import {
  scrapeYouTubeComments,
  convertToCSV,
  CommentData,
  SortBy,
  UploadDate
} from "../utils/youtube-scraper.js";

/**
 * Download function handler that provides CSV download with buffered response
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

  try {
    // Initialize dataset for collecting all comments
    const dataset: CommentData[] = [];

    // Use the shared scraper utility with specific handlers for download case
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
        // We don't need any streaming handlers for download
        // Just collect all comments in memory
        onError: async (error, context) => {
          console.error(`Error ${context ? 'in ' + context : ''}:`, error.message);
        }
      }
    );

    // No comments found
    if (result.comments.length === 0) {
      return new Response(
        JSON.stringify({
          error: 'No data found',
          message: 'No comments could be found for the given search parameters.'
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Convert dataset to CSV
    const csvContent = convertToCSV(result.comments);

    // Create a clean filename from the query
    const sanitizedQuery = query.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `youtube-comments-${sanitizedQuery}-${timestamp}.csv`;

    // Return the CSV as a downloadable file
    return new Response(csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache'
      }
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'An error occurred while scraping',
        message: error instanceof Error ? error.message : String(error)
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
