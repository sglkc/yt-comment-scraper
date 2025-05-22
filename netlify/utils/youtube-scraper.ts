import { Innertube, YTNodes } from 'youtubei.js';

// Define upload date and sort by types as they're not exported directly from YT namespace
export type UploadDate = 'hour' | 'today' | 'week' | 'month' | 'year' | 'all';
export type SortBy = 'relevance' | 'rating' | 'upload_date' | 'view_count';

// Available metadata fields for videos
export type VideoField =
  'id' | 'title' | 'channel' | 'channel_id' | 'description' | 'view_count' |
  'duration' | 'upload_date' | 'is_live' | 'is_upcoming' | 'keywords';

// Available metadata fields for comments
export type CommentField =
  'id' | 'author' | 'comment' | 'published_time' | 'like_count' |
  'is_liked' | 'is_hearted' | 'reply_count' | 'comment_id';

// All available metadata fields
export type MetadataField = VideoField | CommentField | 'label';

// Comment data interface
export interface CommentData {
  id: string;
  title: string;
  channel: string;
  author: string;
  comment: string;
  label: number;
  // Optional fields from API
  channel_id?: string;
  description?: string;
  view_count?: number;
  duration?: number;
  upload_date?: string;
  is_live?: boolean;
  is_upcoming?: boolean;
  keywords?: string;
  published_time?: string;
  like_count?: string;
  is_liked?: boolean;
  is_hearted?: boolean;
  reply_count?: string;
  comment_id?: string;
}

// Video metadata interface
export interface VideoMetadata {
  id: string;
  title: string;
  channel: string;
  // Optional fields from API
  channel_id?: string;
  description?: string;
  view_count?: number;
  duration?: number;
  upload_date?: string;
  is_live?: boolean;
  is_upcoming?: boolean;
  keywords?: string;
}

// Metadata extraction configuration
export interface MetadataConfig {
  selectedFields: MetadataField[];
  columnOrder: MetadataField[];
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
  return await Innertube.create({
    lang: 'id',
    location: 'ID',
    retrieve_player: false,
    generate_session_locally: true,
  });
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
  // Extract basic fields that are always available
  const metadata: VideoMetadata = {
    id: video.id,
    title: video.title.toString(),
    channel: video.author.name,
  };

  // Extract additional fields if they exist
  if (video.author?.id) {
    metadata.channel_id = video.author.id;
  }

  if (video.description_snippet) {
    metadata.description = video.description_snippet.toString();
  } else if (video.description) {
    metadata.description = video.description.toString();
  }

  if (video.view_count !== undefined) {
    metadata.view_count = typeof video.view_count === 'number' ?
      video.view_count :
      parseInt(video.view_count?.toString().replace(/[^0-9]/g, '') || '0');
  }

  if (video.duration !== undefined) {
    metadata.duration = typeof video.duration === 'number' ?
      video.duration :
      parseInt(video.duration?.toString() || '0');
  }

  if (video.published) {
    metadata.upload_date = video.published.toString();
  }

  if (video.is_live !== undefined) {
    metadata.is_live = !!video.is_live;
  }

  if (video.is_upcoming !== undefined) {
    metadata.is_upcoming = !!video.is_upcoming;
  }

  if (video.keywords) {
    if (Array.isArray(video.keywords)) {
      metadata.keywords = video.keywords.join(', ');
    } else {
      metadata.keywords = video.keywords.toString();
    }
  }

  return metadata;
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

  // Create comment data with basic fields
  const commentData: CommentData = {
    id: metadata.id,
    title: metadata.title,
    channel: metadata.channel,
    author,
    comment: text,
    label: 0
  };

  // Copy additional video metadata
  if (metadata.channel_id) commentData.channel_id = metadata.channel_id;
  if (metadata.description) commentData.description = metadata.description;
  if (metadata.view_count !== undefined) commentData.view_count = metadata.view_count;
  if (metadata.duration !== undefined) commentData.duration = metadata.duration;
  if (metadata.upload_date) commentData.upload_date = metadata.upload_date;
  if (metadata.is_live !== undefined) commentData.is_live = metadata.is_live;
  if (metadata.is_upcoming !== undefined) commentData.is_upcoming = metadata.is_upcoming;
  if (metadata.keywords) commentData.keywords = metadata.keywords;

  // Extract additional comment-specific metadata
  if (comment.comment_id) commentData.comment_id = comment.comment_id;
  if (comment.published_time) commentData.published_time = comment.published_time;
  if (comment.like_count) commentData.like_count = comment.like_count;
  if (comment.is_liked !== undefined) commentData.is_liked = !!comment.is_liked;
  if (comment.is_hearted !== undefined) commentData.is_hearted = !!comment.is_hearted;
  if (comment.reply_count) commentData.reply_count = comment.reply_count;

  return commentData;
}

/**
 * Process comments with a simpler approach using continuation count
 */
async function processCommentsRecursively(
  comments: any,
  metadata: VideoMetadata,
  maxVidComments: number,
  maxComments: number,
  counter: { comments: number, continuationCount: number },
  handlers: {
    onComments?: (comments: CommentData[], metadata: VideoMetadata) => Promise<void>
  },
  timer: Timer,
  allComments: CommentData[] = [],
  batchComments: CommentData[] = []
): Promise<{ commentsRemaining: number, hasMoreComments: boolean, continuationCount: number }> {
  try {
    // Use a consistent batch size
    const BATCH_SIZE = 5;

    // Get all comment contents
    const commentContents = comments.contents || [];

    // Process the current batch of comments
    for (let i = 0; i < commentContents.length; i++) {
      const { comment } = commentContents[i];

      if (counter.comments >= maxVidComments || !timer.hasTimeLeft() || maxComments <= 0) {
        // Send any remaining batched comments
        if (batchComments.length > 0 && handlers.onComments) {
          await handlers.onComments([...batchComments], metadata);
          batchComments = [];
        }

        // Return remaining comment count and continuation count
        return {
          commentsRemaining: maxComments,
          hasMoreComments: i < commentContents.length - 1 || comments.has_continuation,
          continuationCount: counter.continuationCount
        };
      }

      const commentData = extractCommentData(comment, metadata);
      if (commentData) {
        allComments.push(commentData);
        batchComments.push(commentData);
        counter.comments++;
        maxComments--;

        // Process and send batch immediately when it reaches batch size
        if (batchComments.length >= BATCH_SIZE && handlers.onComments) {
          await handlers.onComments([...batchComments], metadata);
          batchComments = [];
        }

        if (maxComments <= 0) {
          // Send any remaining comments
          if (batchComments.length > 0 && handlers.onComments) {
            await handlers.onComments([...batchComments], metadata);
          }
          return {
            commentsRemaining: 0,
            hasMoreComments: i < commentContents.length - 1 || comments.has_continuation,
            continuationCount: counter.continuationCount
          };
        }
      }
    }

    // Send any remaining batched comments
    if (batchComments.length > 0 && handlers.onComments) {
      await handlers.onComments([...batchComments], metadata);
      batchComments = [];
    }

    // If no more comments or no time left, return current state
    if (!comments.has_continuation || !timer.hasTimeLeft() || maxComments <= 0) {
      return {
        commentsRemaining: maxComments,
        hasMoreComments: comments.has_continuation,
        continuationCount: counter.continuationCount
      };
    }

    // Increment the continuation count before fetching the next page
    counter.continuationCount++;

    // Recursively get and process the next page of comments
    const continuation = await comments.getContinuation();

    return processCommentsRecursively(
      continuation,
      metadata,
      maxVidComments,
      maxComments,
      counter,
      handlers,
      timer,
      allComments
    );
  } catch (error) {
    // If there's an error, return the current state
    return {
      commentsRemaining: maxComments,
      hasMoreComments: false,
      continuationCount: counter.continuationCount
    };
  }
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
    timer?: number;
    startVideoIndex?: number; // The video index to start from for continuation
    lastCommentIndex?: number; // The number of comment pages loaded in previous session
    continuationToken?: string; // Token to continue searching videos
    lastVideoId?: string | null; // ID of the last video processed
  },
  handlers: {
    onStart?: () => Promise<void>;
    onSearch?: (searchResult: any) => Promise<void>;
    onVideo?: (metadata: VideoMetadata, videoNumber: number) => Promise<void>;
    onComments?: (comments: CommentData[], metadata: VideoMetadata) => Promise<void>;
    onProgress?: (stats: { videosProcessed: number, commentsFound: number, timeElapsed: number }) => Promise<void>;
    onError?: (error: Error, context?: string) => Promise<void>;
    onComplete?: (stats: {
      videosScraped: number,
      totalComments: number,
      timeElapsed: number,
      timedOut: boolean,
      lastVideoIndex: number,
      lastCommentIndex: number, // Number of comment pages loaded
      continuationToken?: string,
      lastVideoId?: string | null
    }) => Promise<void>;
  }
): Promise<{ comments: CommentData[], videosScraped: number }> {
  const timer = createTimer(params.timer);
  const allComments: CommentData[] = [];
  let videosProcessed = params.startVideoIndex || 0;
  let commentsRemaining = params.maxComments;
  let currentVideoId = params.lastVideoId || null;
  let continuationCount = params.lastCommentIndex || 0;

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

    // Skip to specific video index if provided
    if (params.startVideoIndex && params.startVideoIndex > 0) {
      if (params.continuationToken) {
        search = await search.getContinuation(params.continuationToken);
      } else {
        // Skip to the approximate position by continuing search
        let videoCount = search.videos.length;
        const targetIndex = Math.floor(params.startVideoIndex / videoCount);

        for (let i = 0; i < targetIndex && search.has_continuation; i++) {
          search = await search.getContinuation();
        }
      }
    }

    if (handlers.onSearch) {
      await handlers.onSearch(search);
    }

    // Process unfinished video first if we have one
    if (currentVideoId && continuationCount > 0) {
      try {
        // Create minimal metadata for the video
        const videos = await innertube.search(currentVideoId, { sort_by: 'relevance' })
        const metadata = extractVideoMetadata(videos.videos.at(0));

        if (handlers.onVideo) {
          await handlers.onVideo(metadata, videosProcessed + 1);
        }

        // Fetch comments for the video
        let comments = await innertube.getComments(currentVideoId, 'NEWEST_FIRST');

        // Advance to the last comment page we were processing
        for (let i = 0; i < continuationCount && comments.has_continuation; i++) {
          comments = await comments.getContinuation();
        }

        // Setup counter with the existing continuation count
        const counter = { comments: 0, continuationCount };

        // Process comments from where we left off
        const result = await processCommentsRecursively(
          comments,
          metadata,
          params.maxVidComments,
          commentsRemaining,
          counter,
          handlers,
          timer,
          allComments
        );

        // Update state based on result
        commentsRemaining = result.commentsRemaining;
        continuationCount = result.continuationCount;

        // Only move to next video if we've exhausted this one's comments
        if (!result.hasMoreComments) {
          videosProcessed++;
          currentVideoId = null;
          continuationCount = 0;
        } else if (!timer.hasTimeLeft() || commentsRemaining <= 0) {
          // We're stopping with this video not fully processed
          if (handlers.onComplete) {
            await handlers.onComplete({
              videosScraped: videosProcessed,
              totalComments: params.maxComments - commentsRemaining,
              timeElapsed: timer.getElapsedTime() / 1000,
              timedOut: !timer.hasTimeLeft(),
              lastVideoIndex: videosProcessed,
              lastCommentIndex: continuationCount,
              continuationToken: search?.has_continuation ? search.continuation : undefined,
              lastVideoId: currentVideoId
            });
          }

          return {
            comments: allComments,
            videosScraped: videosProcessed
          };
        }

        if (handlers.onProgress) {
          await handlers.onProgress({
            videosProcessed,
            commentsFound: params.maxComments - commentsRemaining,
            timeElapsed: timer.getElapsedTime() / 1000
          });
        }
      } catch (error) {
        // If continuing comments fails, reset and proceed with next video
        if (handlers.onError) {
          await handlers.onError(
            error instanceof Error ? error : new Error(String(error)),
            `continuation for video ${currentVideoId}`
          );
        }
        videosProcessed++;
        currentVideoId = null;
        continuationCount = 0;
      }
    }

    // Skip videos we've already processed by finding our start position
    let skipCount = 0;
    let foundStartIdx = false;
    let startIdx = 0;

    // Only need to find a starting position if we haven't processed any videos yet
    if (videosProcessed === 0 && params.startVideoIndex && params.startVideoIndex > 0) {
      // Process search results - loop through to find our position
      while (search && !foundStartIdx) {
        for (let i = 0; i < search.videos.length; i++) {
          if (skipCount >= params.startVideoIndex) {
            startIdx = i;
            foundStartIdx = true;
            break;
          }
          skipCount++;
        }

        // If we haven't found our start position and there are more pages
        if (!foundStartIdx && search.has_continuation) {
          search = await search.getContinuation();
        } else {
          break;
        }
      }
    }

    // Process search results from our position
    while (search && videosProcessed < params.maxVideos && commentsRemaining > 0 && timer.hasTimeLeft()) {
      // Process videos in this search batch
      for (let i = startIdx; i < search.videos.length; i++) {
        const video = search.videos[i];
        if (commentsRemaining <= 0 || videosProcessed >= params.maxVideos || !timer.hasTimeLeft()) break;

        if (!isValidVideoNode(video)) continue;

        const metadata = extractVideoMetadata(video);
        currentVideoId = video.id;

        if (handlers.onVideo) {
          await handlers.onVideo(metadata, videosProcessed + 1);
        }

        try {
          // Get comments for the video
          const comments = await innertube.getComments(video.id, 'NEWEST_FIRST');
          const counter = { comments: 0, continuationCount: 0 };

          // Process comments recursively
          const result = await processCommentsRecursively(
            comments,
            metadata,
            params.maxVidComments,
            commentsRemaining,
            counter,
            handlers,
            timer,
            allComments
          );

          // Update state based on result
          commentsRemaining = result.commentsRemaining;
          continuationCount = result.continuationCount;

          // If we have no more comments or are out of time, move to next video
          if (!result.hasMoreComments) {
            videosProcessed++;
            currentVideoId = null;
            continuationCount = 0;
          } else if (!timer.hasTimeLeft() || commentsRemaining <= 0) {
            // We're stopping with this video not fully processed
            break;
          }
        } catch (error) {
          if (handlers.onError) {
            await handlers.onError(
              error instanceof Error ? error : new Error(String(error)),
              `processing video ${metadata.id}`
            );
          }
          videosProcessed++;
          currentVideoId = null;
          continuationCount = 0;
          continue;
        }

        if (handlers.onProgress) {
          await handlers.onProgress({
            videosProcessed,
            commentsFound: params.maxComments - commentsRemaining,
            timeElapsed: timer.getElapsedTime() / 1000
          });
        }

        // If we're out of time or have enough comments, stop processing
        if (!timer.hasTimeLeft() || commentsRemaining <= 0) {
          break;
        }
      }

      // Check if we need to fetch more videos
      if (!search.has_continuation || commentsRemaining <= 0 || !timer.hasTimeLeft()) break;

      // Get next page of search results
      search = await search.getContinuation();
      startIdx = 0; // Reset start index for new search page
    }

    if (handlers.onComplete) {
      await handlers.onComplete({
        videosScraped: videosProcessed,
        totalComments: params.maxComments - commentsRemaining,
        timeElapsed: timer.getElapsedTime() / 1000,
        timedOut: !timer.hasTimeLeft(),
        lastVideoIndex: videosProcessed,
        lastCommentIndex: continuationCount,
        continuationToken: search?.has_continuation ? search.continuation : undefined,
        lastVideoId: currentVideoId
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
 * Convert comments data to CSV format with customizable fields and order
 */
export function convertToCSV(data: CommentData[], metadataConfig?: MetadataConfig): string {
  // Define headers based on config or use defaults
  const headers = metadataConfig?.columnOrder || ['label', 'author', 'comment', 'id', 'channel', 'title'];

  // Create CSV header row
  let csv = headers.join(',') + '\n';

  // Add data rows
  data.forEach(item => {
    const row = headers.map(field => {
      let value = item[field as keyof CommentData];

      // Handle undefined or non-string values
      if (value === undefined || value === null) {
        return '';
      } else if (typeof value !== 'string') {
        value = String(value);
      }

      return escapeCSV(value);
    });

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
