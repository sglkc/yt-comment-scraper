const form = document.getElementById('scraper-form');
const loadingIndicator = document.getElementById('loading-indicator');
const resultsContainer = document.getElementById('results-container');
const errorMessage = document.getElementById('error-message');
const commentsTable = document.getElementById('comments-table');
const exportButton = document.getElementById('export-csv');
const streamCsvBtn = document.getElementById('stream-csv');
const downloadCsvBtn = document.getElementById('download-csv');

// Store the results for CSV export
let scrapedData = [];

// Form validation function
function validateForm() {
    const formData = new FormData(form);
    let isValid = true;
    let errorText = '';

    // Check if query is provided
    const query = formData.get('query');
    if (!query || query.trim() === '') {
        errorText = 'Please enter a search query';
        isValid = false;
    }

    // Validate numeric parameters
    const maxVideos = parseInt(formData.get('maxVideos') || '20', 10);
    const maxVidComments = parseInt(formData.get('maxVidComments') || '100', 10);
    const maxComments = parseInt(formData.get('maxComments') || '500', 10);

    // Check limits
    if (maxVideos > 50) {
        errorText = 'Maximum videos should be 50 or less';
        isValid = false;
    }

    if (maxVidComments > 1000) {
        errorText = 'Maximum comments per video should be 1000 or less';
        isValid = false;
    }

    if (maxComments > 5000) {
        errorText = 'Maximum total comments should be 5000 or less';
        isValid = false;
    }

    // Show error if validation fails
    if (!isValid) {
        errorMessage.textContent = errorText;
        errorMessage.style.display = 'block';
    } else {
        errorMessage.style.display = 'none';
    }

    return isValid;
}

// Handle direct CSV download
downloadCsvBtn.addEventListener('click', (e) => {
    e.preventDefault();
    
    // Validate the form
    if (!validateForm()) {
        return;
    }
    
    // Get form values
    const formData = new FormData(form);
    const params = new URLSearchParams();

    for (const [key, value] of formData.entries()) {
        params.append(key, value);
    }

    // Show loading state
    downloadCsvBtn.disabled = true;
    downloadCsvBtn.textContent = 'Processing...';
    errorMessage.style.display = 'none';

    try {
        // Redirect to download endpoint
        window.location.href = `/.netlify/functions/download?${params.toString()}`;

        // Reset button after a delay
        setTimeout(() => {
            downloadCsvBtn.disabled = false;
            downloadCsvBtn.textContent = 'Download CSV Directly';
        }, 10_000);

    } catch (error) {
        console.error('Error:', error);
        errorMessage.textContent = `Error: ${error.message || 'Something went wrong'}`;
        errorMessage.style.display = 'block';
        downloadCsvBtn.disabled = false;
        downloadCsvBtn.textContent = 'Download CSV Directly';
    }
});

// Create elements for real-time statistics
const createRealTimeStats = () => {
    const statsContainer = document.createElement('div');
    statsContainer.className = 'real-time-stats';
    statsContainer.innerHTML = `
            <div class="stat-item">
                <strong>STATUS</strong>
                <span id="stream-status">Connecting...</span>
            </div>
            <div class="stat-item">
                <strong>ELAPSED TIME</strong>
                <span id="elapsed-time">0s</span>
            </div>
            <div class="stat-item">
                <strong>VIDEOS PROCESSED</strong>
                <span id="videos-processed">0</span>
            </div>
            <div class="stat-item">
                <strong>COMMENTS FOUND</strong>
                <span id="comments-found">0</span>
            </div>
            <div class="stat-item">
                <strong>CURRENT VIDEO</strong>
                <span id="current-video">-</span>
            </div>
        `;

    // Insert before loading indicator
    loadingIndicator.parentNode.insertBefore(statsContainer, loadingIndicator);
    return statsContainer;
};

// Handle updates to real-time stats
const updateRealTimeStats = (data) => {
    const statusEl = document.getElementById('stream-status');
    const timeEl = document.getElementById('elapsed-time');
    const videosEl = document.getElementById('videos-processed');
    const commentsEl = document.getElementById('comments-found');
    const videoEl = document.getElementById('current-video');

    if (data.type === 'progress') {
        statusEl.textContent = 'Scraping...';
        timeEl.textContent = `${data.timeElapsed.toFixed(1)}s`;
        videosEl.textContent = data.videosProcessed;
        commentsEl.textContent = data.commentsFound;
    } else if (data.type === 'video') {
        videoEl.textContent = data.video?.title || '-';
    } else if (data.type === 'complete') {
        statusEl.textContent = data.timedOut ? 'Timed Out' : 'Complete!';
        timeEl.textContent = `${data.timeElapsed.toFixed(1)}s`;
        videosEl.textContent = data.videosScraped;
        commentsEl.textContent = data.totalComments;
    } else if (data.type === 'error') {
        statusEl.textContent = 'Error';
    }
};

streamCsvBtn.addEventListener('click', async (e) => {
    e.preventDefault();

    // Reset data
    scrapedData = [];
    commentsTable.innerHTML = '';
    errorMessage.style.display = 'none';
    errorMessage.textContent = '';

    // Validate the form
    if (!validateForm()) {
        return;
    }

    // Get form values
    const formData = new FormData(form);
    const params = new URLSearchParams();

    for (const [key, value] of formData.entries()) {
        params.append(key, value);
    }

    // Create and show real-time stats container
    const statsContainer = createRealTimeStats();
    statsContainer.style.display = 'flex';
    loadingIndicator.style.display = 'block';
    resultsContainer.style.display = 'block';

    try {
        // Create URL for Netlify function
        const functionUrl = `/.netlify/functions/scraper?${params.toString()}`;

        // Create EventSource for server-sent events
        const eventSource = new EventSource(functionUrl);

        // Handle different event types
        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                // Update stats based on event type
                updateRealTimeStats(data);

                // Handle different message types
                switch (data.type) {
                    case 'comments':
                        // Add comments to data store and table
                        processComments(data.data);
                        break;

                    case 'complete':
                        // Handle completion
                        document.getElementById('result-query').textContent = params.get('query');
                        document.getElementById('result-videos').textContent = data.videosScraped;
                        document.getElementById('result-comments').textContent = data.totalComments;
                        loadingIndicator.style.display = 'none';

                        // Close the event source
                        eventSource.close();
                        break;

                    case 'error':
                        // Display error
                        showError(data.message);
                        eventSource.close();
                        break;
                }
            } catch (error) {
                console.error('Error parsing event data:', error);
            }
        };

        // Handle connection open
        eventSource.onopen = () => {
            document.getElementById('stream-status').textContent = 'Connected';
        };

        // Handle errors
        eventSource.onerror = () => {
            showError('Connection to server lost or timed out.');
            eventSource.close();
        };

    } catch (error) {
        showError(`Error: ${error.message || 'Something went wrong'}`);
    }
});

// Process comments received from stream
function processComments(comments) {
    if (!comments || comments.length === 0) return;

    // Add to data store for CSV export
    scrapedData = [...scrapedData, ...comments];

    // Add rows to table
    comments.forEach(item => {
        const row = document.createElement('tr');
        row.className = 'comment-row';

        row.innerHTML = `
                <td>${escapeHtml(item.author)}</td>
                <td>${escapeHtml(item.comment)}</td>
                <td>${escapeHtml(item.title)}</td>
                <td>${escapeHtml(item.channel)}</td>
            `;

        commentsTable.appendChild(row);
    });
}

// Show error message
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    loadingIndicator.style.display = 'none';
}

// Export data to CSV
exportButton.addEventListener('click', () => {
    if (scrapedData.length === 0) {
        alert('No data to export');
        return;
    }

    // Create CSV content
    const headers = ['label', 'author', 'comment', 'id', 'channel', 'title'];
    let csvContent = headers.join(',') + '\n';

    scrapedData.forEach(item => {
        const row = [
            item.label || '0',
            escapeCSV(item.author || ''),
            escapeCSV(item.comment || ''),
            item.id || '',
            escapeCSV(item.channel || ''),
            escapeCSV(item.title || ''),
        ];

        csvContent += row.join(',') + '\n';
    });

    // Create a download link
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    a.setAttribute('href', url);
    a.setAttribute('download', `youtube-comments-${Date.now()}.csv`);
    a.style.display = 'none';

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
});

// Helper function to escape HTML to prevent XSS
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Helper function to escape values for CSV
function escapeCSV(value) {
    if (!value) return '';
    // If value contains comma, quote, or newline, wrap in quotes and escape internal quotes
    if (/[",\n\r]/.test(value)) {
        return '"' + value.replace(/"/g, '""') + '"';
    }
    return value;
}