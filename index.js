document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('scraper-form');
    const loadingIndicator = document.getElementById('loading-indicator');
    const resultsContainer = document.getElementById('results-container');
    const errorMessage = document.getElementById('error-message');
    const commentsTable = document.getElementById('comments-table');
    const exportButton = document.getElementById('export-csv');
    
    // Store the results for CSV export
    let scrapedData = [];
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Show loading, hide results and errors
        loadingIndicator.style.display = 'block';
        resultsContainer.style.display = 'none';
        errorMessage.style.display = 'none';
        errorMessage.textContent = '';
        
        // Get form values
        const formData = new FormData(form);
        const params = new URLSearchParams();
        
        // Add each form field to the URL params
        for (const [key, value] of formData.entries()) {
            params.append(key, value);
        }
        
        try {
            // Call the Netlify function with query parameters
            // The URL uses /.netlify/functions/scraper in production
            const response = await fetch(`/.netlify/functions/scraper?${params.toString()}`);
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to fetch data');
            }
            
            const data = await response.json();
            scrapedData = data.data || [];
            
            // Update UI with results
            displayResults(data);
            
        } catch (error) {
            console.error('Error:', error);
            errorMessage.textContent = `Error: ${error.message || 'Something went wrong'}`;
            errorMessage.style.display = 'block';
        } finally {
            loadingIndicator.style.display = 'none';
        }
    });
    
    // Display the scraped results in the UI
    function displayResults(data) {
        // Update result statistics
        document.getElementById('result-query').textContent = data.query;
        document.getElementById('result-videos').textContent = data.videosScraped;
        document.getElementById('result-comments').textContent = data.totalComments;
        
        // Clear existing table rows
        commentsTable.innerHTML = '';
        
        // Add each comment to the table
        if (data.data && data.data.length > 0) {
            data.data.forEach(item => {
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
            
            // Show results
            resultsContainer.style.display = 'block';
        } else {
            errorMessage.textContent = 'No comments found';
            errorMessage.style.display = 'block';
        }
    }
    
    // Export data to CSV
    exportButton.addEventListener('click', () => {
        if (scrapedData.length === 0) {
            alert('No data to export');
            return;
        }
        
        // Create CSV content
        const headers = ['id', 'title', 'channel', 'author', 'comment', 'label'];
        let csvContent = headers.join(',') + '\n';
        
        scrapedData.forEach(item => {
            const row = [
                item.id || '',
                escapeCSV(item.title || ''),
                escapeCSV(item.channel || ''),
                escapeCSV(item.author || ''),
                escapeCSV(item.comment || ''),
                item.label || '0'
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
        if(/[",\n\r]/.test(value)) {
            return '"' + value.replace(/"/g, '""') + '"';
        }
        return value;
    }
});