import { Innertube, YTNodes } from 'youtubei.js';

// Define upload date and sort by types as they're not exported directly from YT namespace
export type UploadDate = 'hour' | 'today' | 'week' | 'month' | 'year' | 'all';
export type SortBy = 'relevance' | 'rating' | 'upload_date' | 'view_count';

// Comment data interface
export interface CommentData {
  id: string;
  title: string;
  channel: string;
  author: string;
  comment: string;
  label: number;
}

// Video metadata interface
export interface VideoMetadata {
  id: string;
  title: string;
  channel: string;
}

// Track execution time to respect the time limits
export const createTimer = (maxExecutionTime: number = 9000) => {
  const start = Date.now();
  
  return {
    hasTimeLeft: () => {
      return (Date.now() - start) < maxExecutionTime;
    },
    getElapsedTime: () => {
      return Date.now() - start;
    }
  };
};

// Interface for the timer object
export interface Timer {
  hasTimeLeft: () => boolean;
  getElapsedTime: () => number;
}

/**
 * Creates an Innertube client with default settings
 */
export async function createYouTubeClient() {
  return await Innertube.create({ lang: 'id', location: 'ID' });
}

/**
 * Search for YouTube videos based on query and filters
 */
export async function searchYouTubeVideos(
  innertube: any,
  query: string,
  options: {
    uploadDate: UploadDate;
    sortBy: SortBy;
  }
) {
  return await innertube.search(query, {
    type: 'video',
    upload_date: options.uploadDate,
    sort_by: options.sortBy
  });
}

/**
 * Check if a YouTube video node is valid for processing
 */
export function isValidVideoNode(video: any): boolean {
  // Skip certain video types that don't have the required properties
  if (
    video instanceof YTNodes.ShortsLockupView ||
    video instanceof YTNodes.PlaylistPanelVideo ||
    video instanceof YTNodes.WatchCardCompactVideo ||
    video instanceof YTNodes.ReelItem
  ) {
    return false;
  }

  // Ensure video has required properties
  return !!(video.id && video.title && video.author);
}

/**
 * Extract metadata from a video node
 */
export function extractVideoMetadata(video: any): VideoMetadata {
  return {
    id: video.id,
    title: video.title.toString(),
    channel: video.author.name,
  };
}

/**
 * Base function to process comments from a video
 */
export async function processVideoComments(
  innertube: any,
  videoId: string,
  processor: (comments: any, metadata: VideoMetadata) => Promise<void>
): Promise<void> {
  const comments = await innertube.getComments(videoId, 'NEWEST_FIRST');
  await processor(comments, { id: videoId, title: '', channel: '' });
}

/**
 * Extract comment data from a comment node
 */
export function extractCommentData(
  comment: any,
  metadata: VideoMetadata
): CommentData | null {
  const author = comment?.author?.name?.slice(1);
  const text = comment?.content?.toString();

  if (!author || !text) return null;

  return {
    id: metadata.id,
    title: metadata.title,
    channel: metadata.channel,
    author,
    comment: text,
    label: 0
  };
}

/**
 * General scraping workflow that can be customized with handlers
 */
export async function scrapeYouTubeComments<T>(
  params: {
    query: string;
    maxVideos: number;
    maxVidComments: number;
    maxComments: number;
    uploadDate: UploadDate;
    sortBy: SortBy;
  },
  handlers: {
    onStart?: () => Promise<void>;
    onSearch?: (searchResult: any) => Promise<void>;
    onVideo?: (metadata: VideoMetadata, videoNumber: number) => Promise<void>;
    onComments?: (comments: CommentData[], metadata: VideoMetadata) => Promise<void>;
    onProgress?: (stats: { videosProcessed: number, commentsFound: number, timeElapsed: number }) => Promise<void>;
    onError?: (error: Error, context?: string) => Promise<void>;
    onComplete?: (stats: { videosScraped: number, totalComments: number, timeElapsed: number, timedOut: boolean }) => Promise<void>;
  }
): Promise<{ comments: CommentData[], videosScraped: number }> {
  const timer = createTimer();
  const allComments: CommentData[] = [];
  let videosProcessed = 0;
  let commentsRemaining = params.maxComments;

  try {
    if (handlers.onStart) {
      await handlers.onStart();
    }

    // Create YouTube client
    const innertube = await createYouTubeClient();

    // Search for videos
    let search = await searchYouTubeVideos(innertube, params.query, {
      uploadDate: params.uploadDate,
      sortBy: params.sortBy
    });

    if (handlers.onSearch) {
      await handlers.onSearch(search);
    }

    // Process search results
    while (search && videosProcessed < params.maxVideos && commentsRemaining > 0 && timer.hasTimeLeft()) {
      for (const video of search.videos) {
        if (commentsRemaining <= 0 || videosProcessed >= params.maxVideos || !timer.hasTimeLeft()) break;

        if (!isValidVideoNode(video)) continue;

        const metadata = extractVideoMetadata(video);

        if (handlers.onVideo) {
          await handlers.onVideo(metadata, videosProcessed + 1);
        }

        try {
          // Get comments for the video
          const comments = await innertube.getComments(video.id, 'NEWEST_FIRST');
          const videoComments: CommentData[] = [];
          const counter = { comments: 0 };

          // Process comments
          let batchComments: CommentData[] = [];
          
          for (const { comment } of comments.contents) {
            if (counter.comments >= params.maxVidComments || !timer.hasTimeLeft() || commentsRemaining <= 0) {
              break;
            }

            const commentData = extractCommentData(comment, metadata);
            if (commentData) {
              videoComments.push(commentData);
              batchComments.push(commentData);
              allComments.push(commentData);
              counter.comments++;
              commentsRemaining--;
              
              // Process comments in batches
              if (batchComments.length >= 5) {
                if (handlers.onComments) {
                  await handlers.onComments(batchComments, metadata);
                }
                batchComments = [];
              }

              if (commentsRemaining <= 0) break;
            }
          }
          
          // Process any remaining comments in the batch
          if (batchComments.length > 0 && handlers.onComments) {
            await handlers.onComments(batchComments, metadata);
          }

          // Get continuations if needed and time permits
          let currentComments = comments;
          while (
            counter.comments < params.maxVidComments && 
            commentsRemaining > 0 && 
            timer.hasTimeLeft() && 
            currentComments.has_continuation
          ) {
            try {
              const continuation = await currentComments.getContinuation();
              currentComments = continuation;
              
              batchComments = [];
              
              for (const { comment } of continuation.contents) {
                if (counter.comments >= params.maxVidComments || !timer.hasTimeLeft() || commentsRemaining <= 0) {
                  break;
                }

                const commentData = extractCommentData(comment, metadata);
                if (commentData) {
                  videoComments.push(commentData);
                  batchComments.push(commentData);
                  allComments.push(commentData);
                  counter.comments++;
                  commentsRemaining--;
                  
                  // Process comments in batches
                  if (batchComments.length >= 5) {
                    if (handlers.onComments) {
                      await handlers.onComments(batchComments, metadata);
                    }
                    batchComments = [];
                  }

                  if (commentsRemaining <= 0) break;
                }
              }
              
              // Process any remaining comments in the batch
              if (batchComments.length > 0 && handlers.onComments) {
                await handlers.onComments(batchComments, metadata);
              }
              
            } catch (error) {
              if (handlers.onError) {
                await handlers.onError(error instanceof Error ? error : new Error(String(error)), `continuation for video ${metadata.id}`);
              }
              break;
            }
          }

          videosProcessed++;

          if (handlers.onProgress) {
            await handlers.onProgress({
              videosProcessed,
              commentsFound: params.maxComments - commentsRemaining,
              timeElapsed: timer.getElapsedTime() / 1000
            });
          }

        } catch (error) {
          if (handlers.onError) {
            await handlers.onError(
              error instanceof Error ? error : new Error(String(error)), 
              `processing video ${metadata.id}`
            );
          }
          continue;
        }
      }

      // Check if we need to fetch more videos
      if (!search.has_continuation || commentsRemaining <= 0 || videosProcessed >= params.maxVideos || !timer.hasTimeLeft()) break;

      // Get next page of search results
      search = await search.getContinuation();
    }

    if (handlers.onComplete) {
      await handlers.onComplete({
        videosScraped: videosProcessed,
        totalComments: params.maxComments - commentsRemaining,
        timeElapsed: timer.getElapsedTime() / 1000,
        timedOut: !timer.hasTimeLeft()
      });
    }

    return {
      comments: allComments,
      videosScraped: videosProcessed
    };
  } catch (error) {
    if (handlers.onError) {
      await handlers.onError(error instanceof Error ? error : new Error(String(error)));
    }
    
    return {
      comments: allComments,
      videosScraped: videosProcessed
    };
  }
}

/**
 * Convert comments data to CSV format
 */
export function convertToCSV(data: CommentData[]): string {
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
export function escapeCSV(value: string): string {
  if (!value) return '';
  // If value contains comma, quote, or newline, wrap in quotes and escape internal quotes
  const needsQuotes = /[",\n\r]/.test(value);
  value = value.replace(/"/g, '""'); // Escape quotes by doubling them

  return needsQuotes ? `"${value}"` : value;
}