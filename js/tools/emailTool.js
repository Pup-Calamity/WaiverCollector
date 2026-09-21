// js/tools/emailTool.js

window.addEventListener('DOMContentLoaded', () => {
    
    // Navigation
    const launchBtn = document.getElementById('launchEmailToolBtn');
    if (launchBtn) {
        launchBtn.addEventListener('click', async () => {
            if (!window.Workspace.appData || !window.Workspace.appData.waivers) {
                const originalText = launchBtn.innerHTML;
                launchBtn.innerHTML = `<h3>Syncing Data...</h3>`;
                await loadDataset(); 
                launchBtn.innerHTML = originalText; 
            }

            document.getElementById('emailMonth').value = new Date().getMonth() + 1;
            document.getElementById('emailYear').value = new Date().getFullYear();
            switchView('emailToolView');
        });
    }

    const backBtn = document.getElementById('backToHubFromEmailBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => switchView('processingWorkspace'));
    }

    // Run Batch Button
    const runBtn = document.getElementById('runEmailBatchBtn');
    if (runBtn) {
        runBtn.addEventListener('click', async () => {
            const reportType = document.getElementById('emailReportType').value;
            const targetMonth = document.getElementById('emailMonth').value;
            const targetYear = document.getElementById('emailYear').value;
            
            const logBox = document.getElementById('emailOutputLog');
            logBox.innerHTML = '';
            
            const logMsg = (msg, isError = false) => {
                const li = document.createElement('li');
                li.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
                li.style.color = isError ? '#ef4444' : 'var(--text-main)';
                li.style.marginBottom = '4px';
                logBox.appendChild(li);
                logBox.parentElement.scrollTop = logBox.parentElement.scrollHeight; 
            };

            runBtn.disabled = true;
            runBtn.textContent = "Processing...";

            try {
                // --- THE ROUTER ---
                if (reportType === "APPROVAL_REMINDERS") {
                    logMsg(`Starting AP03 Approval Reminders for ${targetMonth}/${targetYear}...`);
                    // Call the function with the "APPROVAL" flag
                    await batchProcessQueueReminders(targetMonth, targetYear, logMsg, "APPROVAL");
                    
                } else if (reportType === "REJECTED_REMINDERS") {
                    logMsg(`Starting Rejected Invoice Reminders for ${targetMonth}/${targetYear}...`);
                    // Call the same function, but trigger the "REJECTED" logic!
                    await batchProcessQueueReminders(targetMonth, targetYear, logMsg, "REJECTED");

                } else if (reportType === "MISSING_WAIVERS") {
                    logMsg(`Starting Missing Waiver Requests for ${targetMonth}/${targetYear}...`);
                    await batchProcessInvoicesEmail(targetMonth, targetYear, logMsg);
                    
                } else {
                    logMsg(`Report type ${reportType} is not set up yet.`, true);
                }
            } catch (err) {
                logMsg(`Fatal Error: ${err.message}`, true);
            }

            runBtn.disabled = false;
            runBtn.textContent = "🚀 Generate Batch";
        });
    }
});
