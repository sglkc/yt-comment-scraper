const form = document.getElementById('scraper-form');
const loadingIndicator = document.getElementById('loading-indicator');
const resultsContainer = document.getElementById('results-container');
const errorMessage = document.getElementById('error-message');
const commentsTable = document.getElementById('comments-table');
const commentsTableHeader = document.getElementById('comments-table-header');
const exportButton = document.getElementById('export-csv');
const streamCsvBtn = document.getElementById('stream-csv');
const downloadCsvBtn = document.getElementById('download-csv');
const columnOrderContainer = document.getElementById('column-order-container');

// Store the results for CSV export
let scrapedData = [];

// Store currently selected metadata fields and their order
let selectedFields = ['author', 'comment', 'id', 'channel', 'title'];
let columnOrder = [...selectedFields];

// Field labels for display
const fieldLabels = {
    'author': 'Author',
    'comment': 'Comment',
    'id': 'Video ID',
    'title': 'Video Title',
    'channel': 'Channel',
    'channel_id': 'Channel ID',
    'description': 'Description',
    'view_count': 'View Count',
    'duration': 'Duration',
    'upload_date': 'Upload Date',
    'is_live': 'Is Live',
    'is_upcoming': 'Is Upcoming',
    'keywords': 'Keywords',
    'published_time': 'Published Time',
    'like_count': 'Likes',
    'reply_count': 'Replies',
    'comment_id': 'Comment ID',
    'is_liked': 'Is Liked',
    'is_hearted': 'Is Hearted'
};

// Initialize the metadata fields and column order UI
function initMetadataUI() {
    // Set up metadata field checkboxes event listeners
    const checkboxes = document.querySelectorAll('input[name="metadata-field"]');
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', updateSelectedFields);
    });

    // Initial population of the column order container
    updateSelectedFields();

    // Set up drag and drop for column ordering
    setupDragAndDrop();
}

// Update the selected fields based on checkbox state
function updateSelectedFields() {
    const checkboxes = document.querySelectorAll('input[name="metadata-field"]:checked');
    selectedFields = Array.from(checkboxes).map(cb => cb.value);

    // Make sure we have at least one field selected
    if (selectedFields.length === 0) {
        selectedFields = ['author', 'comment'];
        checkboxes.forEach(cb => {
            if (selectedFields.includes(cb.value)) {
                cb.checked = true;
            }
        });
    }

    // Update column order to include only selected fields
    columnOrder = columnOrder.filter(field => selectedFields.includes(field));

    // Add any newly selected fields that aren't in the column order
    selectedFields.forEach(field => {
        if (!columnOrder.includes(field)) {
            columnOrder.push(field);
        }
    });

    // Update the column order UI
    updateColumnOrderUI();
}

// Update the column order UI
function updateColumnOrderUI() {
    // Clear the container
    columnOrderContainer.innerHTML = '';

    // Add column items
    columnOrder.forEach(field => {
        const item = document.createElement('div');
        item.className = 'column-item';
        item.draggable = true;
        item.dataset.field = field;
        item.textContent = fieldLabels[field] || field;

        // Add drag event listeners
        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragover', handleDragOver);
        item.addEventListener('drop', handleDrop);
        item.addEventListener('dragend', handleDragEnd);

        columnOrderContainer.appendChild(item);
    });
}

// Setup drag and drop functionality
function setupDragAndDrop() {
    columnOrderContainer.addEventListener('dragover', e => {
        e.preventDefault();
    });
}

// Variables to store drag state
let draggedItem = null;

// Drag and drop event handlers
function handleDragStart(e) {
    draggedItem = e.target;
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', e.target.dataset.field);
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function handleDrop(e) {
    e.preventDefault();

    if (draggedItem === e.target) return;

    // Get the source and target fields
    const sourceField = draggedItem.dataset.field;
    const targetField = e.target.dataset.field;

    // Find their positions in the order array
    const sourceIndex = columnOrder.indexOf(sourceField);
    const targetIndex = columnOrder.indexOf(targetField);

    // Remove the source field from its position
    columnOrder.splice(sourceIndex, 1);

    // Insert it at the target position
    columnOrder.splice(targetIndex, 0, sourceField);

    // Update the UI
    updateColumnOrderUI();
}

function handleDragEnd() {
    draggedItem.classList.remove('dragging');
    draggedItem = null;
}

// Form validation function
function validateForm() {
    // Ensure at least one metadata field is selected
    if (selectedFields.length === 0) {
        showMessage('Please select at least one metadata field to extract.', true);
        return false;
    }

    return true;
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

    // Add metadata fields and column order parameters
    params.append('selectedFields', selectedFields.join(','));
    params.append('columnOrder', columnOrder.join(','));

    // Show loading state
    downloadCsvBtn.disabled = true;
    downloadCsvBtn.textContent = 'Processing...';
    errorMessage.style.display = 'none';

    try {
        // Create download iframe
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        document.body.appendChild(iframe);

        // Set iframe src to download endpoint with params - FIX: Use correct Netlify Functions path
        iframe.src = `/.netlify/functions/download?${params.toString()}`;

        // Reset button state after a delay
        setTimeout(() => {
            downloadCsvBtn.disabled = false;
            downloadCsvBtn.innerHTML = '<p>Download CSV Directly</p><small style="font-weight: normal;">For slower devices</small>';
            document.body.removeChild(iframe);
        }, 3000);
    } catch (error) {
        downloadCsvBtn.disabled = false;
        downloadCsvBtn.innerHTML = '<p>Download CSV Directly</p><small style="font-weight: normal;">For slower devices</small>';
        showMessage(`Error: ${error.message || 'Something went wrong'}`, true);
    }
});

// Handle streaming CSV
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

    // Add metadata fields and column order parameters
    params.append('selectedFields', selectedFields.join(','));
    params.append('columnOrder', columnOrder.join(','));

    // Show loading state AND results container for real-time viewing
    loadingIndicator.style.display = 'grid';
    resultsContainer.style.display = 'block';

    // Initialize the table header right away
    updateTableHeader();

    // Display real-time stats container
    const realTimeStats = document.getElementById('real-time-stats');
    realTimeStats.style.display = 'flex';

    // Reset real-time stat values
    document.getElementById('current-video').textContent = '-';
    document.getElementById('videos-processed').textContent = '0';
    document.getElementById('comments-found').textContent = '0';
    document.getElementById('time-elapsed').textContent = '0s';

    // Start a timer for time elapsed
    const startTime = Date.now();
    const elapsedTimeInterval = setInterval(() => {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        document.getElementById('time-elapsed').textContent = elapsed + 's';
    }, 1000);

    streamCsvBtn.disabled = true;
    downloadCsvBtn.disabled = true;

    try {
        // Set up SSE connection
        const url = `/.netlify/functions/scraper?${params.toString()}`;
        console.log('Connecting to EventSource URL:', url);
        const eventSource = new EventSource(url);
        document.getElementById('result-query').textContent = formData.get('query');

        showMessage('Connected - Waiting for data', false);

        // Handle incoming events
        eventSource.onmessage = (event) => {
            try {
                console.log('Raw EventSource message:', event.data);
                const data = JSON.parse(event.data);
                console.log('Parsed EventSource data:', data);

                switch (data.type) {
                    case 'info':
                        // Display query info
                        document.getElementById('result-query').textContent = data.query;
                        showMessage('Connected - Received info', false);
                        break;

                    case 'video':
                        // Update current video being processed
                        const videoTitle = data.video?.title || 'Unknown';
                        const videoChannel = data.video?.channel || 'Unknown';
                        document.getElementById('current-video').textContent = `${videoTitle} (${videoChannel})`;
                        showMessage(`Processing video ${data.videoNumber}: ${videoTitle}`, false);
                        break;

                    case 'comments':
                        // Process received comments
                        if (data.data && Array.isArray(data.data)) {
                            showMessage(`Processing ${data.data.length} new comments`, false);
                            processComments(data.data);
                        } else {
                            console.error('Invalid comments data structure:', data);
                            showMessage('Error - Invalid comments data', true);
                        }
                        break;

                    case 'progress':
                        // Update progress indicators
                        document.getElementById('videos-processed').textContent = data.videosProcessed;
                        document.getElementById('comments-found').textContent = data.commentsFound;
                        document.getElementById('result-videos').textContent = data.videosProcessed;
                        document.getElementById('result-comments').textContent = data.commentsFound;
                        showMessage(`Progress: ${data.videosProcessed} videos, ${data.commentsFound} comments`, false);
                        break;

                    case 'complete':
                        // Show completion status but keep results visible
                        clearInterval(elapsedTimeInterval);
                        streamCsvBtn.disabled = false;
                        downloadCsvBtn.disabled = false;
                        loadingIndicator.style.display = 'none';
                        document.getElementById('result-videos').textContent = data.videosScraped;
                        document.getElementById('result-comments').textContent = data.totalComments;
                        document.getElementById('time-elapsed').textContent = Math.round(data.timeElapsed) + 's';
                        showMessage(`Scraping complete! Found ${data.totalComments} comments from ${data.videosScraped} videos.`, false);

                        // Close the event source
                        eventSource.close();
                        break;

                    case 'error':
                        // Display error
                        clearInterval(elapsedTimeInterval);
                        showMessage(data.message, true);
                        eventSource.close();
                        break;

                    default:
                        console.log('Unknown event type:', data.type);
                        showMessage(`Received unknown event: ${data.type}`, true);
                }
            } catch (error) {
                console.error('Error parsing event data:', error, event.data);
                showMessage(`Error parsing data: ${error.message}`, true);
            }
        };

        // Handle connection open
        eventSource.onopen = () => {
            console.log('EventSource connection opened');
            showMessage('Connected - Waiting for data', false);
        };

        // Handle errors
        eventSource.onerror = (err) => {
            const seconds = Number(document.getElementById('time-elapsed').textContent.match(/\d+/)?.[0] || '0')

            if (seconds >= 10) {
              showMessage('Time limit has been reached.', true);
            } else {
              showMessage('Connection to server lost or timed out.', true);
            }

            console.error('EventSource error:', err);
            clearInterval(elapsedTimeInterval);
            eventSource.close();
        };

    } catch (error) {
        console.error('Error setting up EventSource:', error);
        clearInterval(elapsedTimeInterval);
        showMessage(`Error: ${error.message || 'Something went wrong'}`, true);
    }
});

// Process comments received from stream
function processComments(comments) {
    if (!comments || comments.length === 0) return;

    // Add to data store for CSV export
    scrapedData = [...scrapedData, ...comments];

    // Initialize the table header if not already done
    if (commentsTableHeader.innerHTML === '') {
        updateTableHeader();
    }

    // Add rows to table
    comments.forEach(item => {
        const row = document.createElement('tr');
        row.className = 'comment-row';

        let cellsHtml = '';
        columnOrder.forEach(field => {
            if (selectedFields.includes(field)) {
                cellsHtml += `<td>${escapeHtml(item[field] !== undefined ? item[field] : '')}</td>`;
            }
        });

        row.innerHTML = cellsHtml;
        commentsTable.appendChild(row);
    });
}

// Update table header based on selected columns
function updateTableHeader() {
    const headerRow = document.createElement('tr');

    columnOrder.forEach(field => {
        if (selectedFields.includes(field)) {
            const th = document.createElement('th');
            th.textContent = fieldLabels[field] || field;
            headerRow.appendChild(th);
        }
    });

    commentsTableHeader.innerHTML = '';
    commentsTableHeader.appendChild(headerRow);
}

// Show status/error message
function showMessage(message, isError = false) {
    const messageEl = document.getElementById('error-message');
    messageEl.textContent = message;

    // Set appropriate styling based on message type
    messageEl.className = isError ? 'alert alert-danger' : 'alert alert-success';
    messageEl.style.display = 'block';

    // For errors, make sure the loading indicator is hidden
    if (isError) {
        loadingIndicator.style.display = 'none';
        streamCsvBtn.disabled = false;
        downloadCsvBtn.disabled = false;
    }
}

// Legacy function for backwards compatibility
function showError(message) {
    showMessage(message, true);
}

// Export data to CSV
exportButton.addEventListener('click', () => {
    if (scrapedData.length === 0) {
        alert('No data to export');
        return;
    }

    // Create CSV content
    let csvContent = columnOrder.filter(field => selectedFields.includes(field)).join(',') + '\n';

    scrapedData.forEach(item => {
        const row = columnOrder
            .filter(field => selectedFields.includes(field))
            .map(field => {
                const value = item[field];
                return escapeCSV(value !== undefined ? String(value) : '');
            });

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
    if (typeof unsafe !== 'string') unsafe = String(unsafe)
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

// Initialize the UI when the page loads
document.addEventListener('DOMContentLoaded', initMetadataUI);
