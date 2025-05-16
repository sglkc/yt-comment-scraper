# YouTube Comment Scraper

A tool to easily scrape comments from YouTube videos based on search query parameters. [Try now!](https://scraper.seya.zip)

## Features

- Search for videos using keywords
- Stream comment scraping results in real-time
- Export comments to CSV
- Filter videos by upload date
- Sort videos by relevance, view count, or upload date
- Configurable limits for videos and comments

## Local Development

### Prerequisites

- Node.js 16+ installed
- npm or pnpm package manager
- Netlify CLI (for local serverless function development)

### Setup

1. Clone the repository
   ```
   git clone https://github.com/sglkc/yt-comment-scraper.git
   cd yt-comment-scraper
   ```

2. Install dependencies
   ```
   npm install
   # or
   pnpm install
   ```

3. Install Netlify CLI (if not already installed)
   ```
   npm install netlify-cli -g
   # or
   pnpm add -g netlify-cli
   ```

4. Start the development server
   ```
   netlify dev
   # or
   npx netlify dev
   ```

5. Netlify should automatically open the URL in your browser

## API Usage

The YouTube Comment Scraper provides two API endpoints for different use cases:

1. **Real-time streaming endpoint** - Streams comments as they're scraped (10-second limit)
2. **Direct CSV download endpoint** - Collects all comments before responding (30-second limit)

### Streaming Endpoint

```
GET /api/scraper
```

The streaming endpoint returns Server-Sent Events (SSE) in real-time as comments are scraped, with updates on progress.

### Download Endpoint

```
GET /api/download
```

The download endpoint collects all comments before responding with a complete CSV file for download. This endpoint has a longer execution time limit (30 seconds vs 10 seconds for streaming) and can retrieve more comments in a single request.

### Query Parameters

Both endpoints accept the same parameters:

| Parameter      | Type     | Description                                | Default         |
|----------------|----------|--------------------------------------------|-----------------|
| query          | string   | Search query for YouTube videos            | "news"          |
| maxVideos      | number   | Maximum number of videos to process        | 20              |
| maxVidComments | number   | Maximum comments to retrieve per video     | 100             |
| maxComments    | number   | Total maximum comments to retrieve         | 500             |
| uploadDate     | string   | Filter videos by upload date               | "week"          |
| sortBy         | string   | Sort videos by specific criteria           | "view_count"    |

#### Upload Date Options
- `hour` - Last hour
- `today` - Today
- `week` - This week
- `month` - This month
- `year` - This year
- `all` - All time

#### Sort By Options
- `relevance` - Sort by relevance
- `upload_date` - Sort by upload date
- `view_count` - Sort by view count

### Example Requests

**Streaming API (real-time updates):**
```
GET /api/scraper?query=indonesia+news&maxVideos=30&maxVidComments=200&maxComments=800
```

**CSV Download API (direct download):**
```
GET /api/download?query=indonesia+news&maxVideos=30&maxVidComments=200&maxComments=800
```

### Streaming Response Events

The streaming API returns events in the following format:

```javascript
// Initial information event
{ 
  "type": "info", 
  "query": "your search query", 
  "maxVideos": 20, 
  "maxComments": 500 
}

// Search metadata event
{ 
  "type": "search", 
  "totalVideos": 42 
}

// Video metadata event
{ 
  "type": "video", 
  "video": { "id": "videoId", "title": "Video Title", "channel": "Channel Name" },
  "videoNumber": 1
}

// Comments data event (batched)
{ 
  "type": "comments", 
  "data": [
    { "id": "videoId", "title": "Video Title", "channel": "Channel Name", "author": "Comment Author", "comment": "Comment text", "label": 0 },
    // Additional comments...
  ] 
}

// Progress update event
{ 
  "type": "progress", 
  "videosProcessed": 5, 
  "commentsFound": 250,
  "timeElapsed": 5.2
}

// Error event
{ 
  "type": "error", 
  "message": "Error message"
}

// Completion event
{ 
  "type": "complete", 
  "videosScraped": 20,
  "totalComments": 500,
  "timeElapsed": 9.8,
  "timedOut": false
}
```

### Download Response

The download endpoint returns a CSV file with the following columns:

```
label,author,comment,id,channel,title
```

Each row contains:
- `label`: A numeric value (default: 0) that can be used for classification
- `author`: The comment author's username
- `comment`: The full text of the comment
- `id`: YouTube video ID
- `channel`: YouTube channel name
- `title`: Video title

The filename follows this pattern: `youtube-comments-[query]-[timestamp].csv`

## Time Limits

The YouTube Comment Scraper operates under different execution constraints:

1. **Streaming API** (`/api/scraper`): 
   - 10-second execution limit
   - Real-time comment delivery
   - Better for UI feedback and monitoring progress

2. **Download API** (`/api/download`): 
   - 30-second execution limit
   - Buffered response (waits until all scraping completes)
   - Returns more comments in a single request
   - Direct CSV file download

These time limits affect how many videos and comments can be processed in a single request.

## Deployment

The project is configured for Netlify deployment:

1. Fork the repository
2. Connect to your Netlify account
3. Deploy with the following settings:
   - Build command: `npm run build` or `pnpm build`
   - Publish directory: `dist`

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
