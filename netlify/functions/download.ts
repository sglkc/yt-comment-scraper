import { Context } from "@netlify/functions";
import { Innertube, YTNodes } from 'youtubei.js';

// Define upload date and sort by types as they're not exported directly from YT namespace
type UploadDate = 'hour' | 'today' | 'week' | 'month' | 'year' | 'all';
type SortBy = 'relevance' | 'rating' | 'upload_date' | 'view_count';

// Comment data interface
interface CommentData {
  id: string;
  title: string;
  channel: string;
  author: string;
  comment: string;
  label: number;
}

// Track execution time to respect the 30-second limit for buffered responses
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
 * Scrapes comments from a video and collects them in a dataset
 */
async function scrapeComments(
  comments: any,
  metadata: { id: string, channel: string, title: string },
  maxVidComments: number,
  maxComments: number,
  counter: { comments: number },
  dataset: CommentData[],
  timer: { hasTimeLeft: () => boolean, getElapsedTime: () => number }
): Promise<number> {
  try {
    for (const { comment } of comments.contents) {
      if (counter.comments >= maxVidComments || !timer.hasTimeLeft() || dataset.length >= maxComments) {
        counter.comments = 0;
        return maxComments - dataset.length;
      }

      const author = comment?.author?.name.slice(1);
      const text = comment?.content?.toString();

      if (!author || !text) continue;

      const commentData: CommentData = {
        id: metadata.id,
        title: metadata.title,
        channel: metadata.channel,
        author,
        comment: text,
        label: 0
      };

      dataset.push(commentData);
      counter.comments++;

      if (dataset.length >= maxComments) {
        return 0;
      }
    }

    if (!comments.has_continuation || !timer.hasTimeLeft() || dataset.length >= maxComments) {
      return maxComments - dataset.length;
    }

    const continuation = await comments.getContinuation();
    return await scrapeComments(continuation, metadata, maxVidComments, maxComments, counter, dataset, timer);
  } catch (error) {
    console.error('Error scraping comments:', error instanceof Error ? error.message : String(error));
    return maxComments - dataset.length;
  }
}

/**
 * Convert comments data to CSV format
 */
function convertToCSV(data: CommentData[]): string {
  // Define headers in the requested order
  const headers = ['label', 'author', 'comment', 'id', 'channel', 'title'];

  // Create CSV header row
  let csv = headers.join(',') + '\n';

  // Add data rows
  data.forEach(item => {
    const row = [
      item.label.toString(),
      escapeCSV(item.author),
      escapeCSV(item.comment),
      escapeCSV(item.id),
      escapeCSV(item.channel),
      escapeCSV(item.title)
    ];

    csv += row.join(',') + '\n';
  });

  return csv;
}

/**
 * Escape a value for CSV format
 */
function escapeCSV(value: string): string {
  if (!value) return '';
  // If value contains comma, quote, or newline, wrap in quotes and escape internal quotes
  const needsQuotes = /[",\n\r]/.test(value);
  value = value.replace(/"/g, '""'); // Escape quotes by doubling them

  return needsQuotes ? `"${value}"` : value;
}

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

  const timer = startTime();

  try {
    // Initialize dataset and counters
    const dataset: CommentData[] = [];
    const counters = { comments: 0, videos: 0 };
    let commentsRemaining = maxComments;

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
            dataset,
            timer
          );

          videosProcessed++;

        } catch (error) {
          console.error(`Error processing video ${video.id}:`, error instanceof Error ? error.message : String(error));
          continue;
        }
      }

      // Check if we need to fetch more videos
      if (!search.has_continuation || commentsRemaining <= 0 || videosProcessed >= maxVideos || !timer.hasTimeLeft()) break;

      // Get next page of search results
      search = await search.getContinuation();
    }

    // No comments found
    if (dataset.length === 0) {
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
    const csvContent = convertToCSV(dataset);

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
