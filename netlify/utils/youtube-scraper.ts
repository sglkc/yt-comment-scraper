import { Innertube, YTNodes } from 'youtubei.js';

// Define upload date and sort by types as they're not exported directly from YT namespace
export type UploadDate = 'hour' | 'today' | 'week' | 'month' | 'year' | 'all';
export type SortBy = 'relevance' | 'rating' | 'upload_date' | 'view_count';

// Comment continuation data structure
export interface CommentContinuationData {
  endpoint: {
    metadata: {
      api_url: string;
    };
    payload: any;
  };
}

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
    continuationToken?: string; // Token to continue searching videos
    commentContinuationData?: CommentContinuationData | null; // Comment continuation data for efficient comment retrieval
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
      continuationToken?: string,
      commentContinuationData?: CommentContinuationData | null,
      lastVideoId?: string | null
    }) => Promise<void>;
  }
): Promise<{ comments: CommentData[], videosScraped: number }> {
  const timer = createTimer(params.timer);
  const allComments: CommentData[] = [];
  let videosProcessed = params.startVideoIndex || 0;
  let commentsRemaining = params.maxComments;
  let currentVideoId = params.lastVideoId;
  let commentContinuationData = params.commentContinuationData;

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
        // Use the continuation token to fetch the exact search results page
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

    // If we have comment continuation data, first try to continue with that
    if (commentContinuationData && currentVideoId) {
      try {
        // Find the metadata for the current video
        let metadata: VideoMetadata | null = null;
        for (const video of search.videos) {
          if (video.id === currentVideoId && isValidVideoNode(video)) {
            metadata = extractVideoMetadata(video);
            break;
          }
        }

        // If we couldn't find the video in current results, create minimal metadata
        if (!metadata) {
          metadata = {
            id: currentVideoId,
            title: 'Continuing Comments',
            channel: 'Unknown'
          };
        }

        // Fetch comments using continuation data
        const comments = await fetchCommentsContinuation(innertube, commentContinuationData);
        const videoComments: CommentData[] = [];
        const counter = { comments: 0 };

        // Process comments
        let batchComments: CommentData[] = [];

        for (const { comment } of comments.contents || []) {
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

        // Continue fetching more comments from this video if available
        let currentComments = comments;
        let continuationFetchCount = 0;
        const MAX_CONTINUATIONS = 10;

        while (
          currentComments.has_continuation &&
          timer.hasTimeLeft() &&
          commentsRemaining > 0 &&
          counter.comments < params.maxVidComments &&
          continuationFetchCount < MAX_CONTINUATIONS
        ) {
          try {
            // Get the next page of comments
            const continuation = await currentComments.getContinuation();
            currentComments = continuation;
            continuationFetchCount++;

            // Process these comments
            batchComments = [];

            for (const { comment } of continuation.contents || []) {
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

                // Process comments in larger batches to reduce overhead
                if (batchComments.length >= 20) {
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

            // If we're out of time, break the loop
            if (!timer.hasTimeLeft() || commentsRemaining <= 0) {
              break;
            }
          } catch (error) {
            if (handlers.onError) {
              await handlers.onError(
                error instanceof Error ? error : new Error(String(error)),
                `processing continuation for video ${metadata.id}`
              );
            }
            break;
          }
        }

        // Update commentContinuationData for the next page
        if (currentComments.has_continuation && timer.hasTimeLeft() && commentsRemaining > 0) {
          commentContinuationData = extractCommentContinuationData(currentComments);
        } else {
          commentContinuationData = null;
          // Only move to the next video if we've finished with this one
          videosProcessed++;
        }

        if (handlers.onProgress) {
          await handlers.onProgress({
            videosProcessed,
            commentsFound: params.maxComments - commentsRemaining,
            timeElapsed: timer.getElapsedTime() / 1000
          });
        }
      } catch (error) {
        // If continuing comments fails, reset continuation data and proceed with next video
        if (handlers.onError) {
          await handlers.onError(
            error instanceof Error ? error : new Error(String(error)),
            `continuation for video ${currentVideoId}`
          );
        }
        commentContinuationData = null;
        currentVideoId = null;
      }
    }

    // Process search results
    while (search && videosProcessed < params.maxVideos && commentsRemaining > 0 && timer.hasTimeLeft()) {
      for (const video of search.videos) {
        if (commentsRemaining <= 0 || videosProcessed >= params.maxVideos || !timer.hasTimeLeft()) break;

        if (!isValidVideoNode(video)) continue;

        // Skip videos we've already processed
        if (currentVideoId === video.id) continue;

        const metadata = extractVideoMetadata(video);
        currentVideoId = video.id;

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

              // Process comments in larger batches to reduce overhead
              if (batchComments.length >= 20) {
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

          // Continue fetching more comments from this video if available
          let currentComments = comments;
          let continuationFetchCount = 0;
          const MAX_CONTINUATIONS = 10;

          while (
            currentComments.has_continuation &&
            timer.hasTimeLeft() &&
            commentsRemaining > 0 &&
            counter.comments < params.maxVidComments &&
            continuationFetchCount < MAX_CONTINUATIONS
          ) {
            try {
              // Get the next page of comments
              const continuation = await currentComments.getContinuation();
              currentComments = continuation;
              continuationFetchCount++;

              // Process these comments
              batchComments = [];

              for (const { comment } of continuation.contents || []) {
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

                  // Process comments in larger batches to reduce overhead
                  if (batchComments.length >= 20) {
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

              // If we're out of time, break the loop
              if (!timer.hasTimeLeft() || commentsRemaining <= 0) {
                break;
              }
            } catch (error) {
              if (handlers.onError) {
                await handlers.onError(
                  error instanceof Error ? error : new Error(String(error)),
                  `processing continuation for video ${metadata.id}`
                );
              }
              break;
            }
          }

          // Update commentContinuationData for the next page
          if (currentComments.has_continuation && timer.hasTimeLeft() && commentsRemaining > 0) {
            commentContinuationData = extractCommentContinuationData(currentComments);
          } else {
            commentContinuationData = null;
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
        timedOut: !timer.hasTimeLeft(),
        lastVideoIndex: videosProcessed,
        continuationToken: search?.has_continuation ? search.continuation : undefined,
        commentContinuationData: commentContinuationData || undefined,
        lastVideoId: currentVideoId || undefined
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

/**
 * Extract the continuation data from a comments response
 */
export function extractCommentContinuationData(comments: any): CommentContinuationData | null {
  if (!comments || !comments.has_continuation) return null;

  // First try to get the ContinuationItem directly
  const continuationItem = comments.memo?.getType(YTNodes.ContinuationItem)?.at(0);
  if (continuationItem) {
    return {
      endpoint: {
        metadata: {
          api_url: continuationItem.endpoint.metadata.api_url
        },
        payload: continuationItem.endpoint.payload
      }
    };
  }

  // If not found, try to get from on_response_received_endpoints
  if (comments.page?.on_response_received_endpoints?.at(1)?.contents) {
    const continuationItem = comments.page.on_response_received_endpoints
      .at(1).contents.firstOfType(YTNodes.ContinuationItem);

    if (continuationItem) {
      return {
        endpoint: {
          metadata: {
            api_url: continuationItem.endpoint.metadata.api_url
          },
          payload: continuationItem.endpoint.payload
        }
      };
    }
  }

  return null;
}

/**
 * Fetch comments directly using continuation data instead of repeatedly calling getContinuation
 */
export async function fetchCommentsContinuation(
  innertube: any,
  continuationData: CommentContinuationData
): Promise<any> {
  if (!continuationData?.endpoint?.metadata?.api_url || !continuationData?.endpoint?.payload) {
    throw new Error('Invalid continuation data');
  }

  try {
    const response = await innertube.actions.execute(
      continuationData.endpoint.metadata.api_url,
      {
        ...continuationData.endpoint.payload,
        parse: true
      }
    );

    // Extract the contents based on the response structure
    let contents;
    if (response.on_response_received_endpoints) {
      contents = response.on_response_received_endpoints.first()?.contents;
    } else if (response.on_response_received_actions_memo) {
      const comments = response.on_response_received_actions_memo.getType(YTNodes.Comment);
      if (comments && comments.length > 0) {
        contents = { contents: comments.map((c: any) => ({ comment: c })) };
      }
    }

    // If we couldn't extract contents properly, try to make the result compatible with regular comments object
    if (!contents) {
      contents = { contents: [] };
    }

    // Add continuation properties to make it compatible with the regular comments object
    contents.has_continuation = !!extractCommentContinuationData(response);
    contents.getContinuation = async () => {
      const nextContinuation = extractCommentContinuationData(response);
      if (!nextContinuation) throw new Error('No continuation available');
      return await fetchCommentsContinuation(innertube, nextContinuation);
    };

    return contents;
  } catch (error) {
    throw new Error(`Failed to fetch comments continuation: ${error instanceof Error ? error.message : String(error)}`);
  }
}
