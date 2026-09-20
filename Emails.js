// --- Email Tool UI Logic ---
window.addEventListener('DOMContentLoaded', () => {
    
    // Navigation
    const launchBtn = document.getElementById('launchEmailToolBtn');
    if (launchBtn) {
        launchBtn.addEventListener('click', () => {
            // Auto-set the current month just to be helpful
            document.getElementById('emailMonth').value = new Date().getMonth() + 1;
            document.getElementById('emailYear').value = new Date().getFullYear();
            
            switchView('emailToolView');
        });
    }

    const backBtn = document.getElementById('backToHubFromEmailBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            switchView('processingWorkspace');
        });
    }

    // Run Batch Button
    const runBtn = document.getElementById('runEmailBatchBtn');
    if (runBtn) {
        runBtn.addEventListener('click', async () => {
            const reportType = document.getElementById('emailReportType').value;
            const targetMonth = document.getElementById('emailMonth').value;
            const targetYear = document.getElementById('emailYear').value;
            
            // Clear the log window
            const logBox = document.getElementById('emailOutputLog');
            logBox.innerHTML = '';
            
            const logMsg = (msg, isError = false) => {
                const li = document.createElement('li');
                li.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
                li.style.color = isError ? '#ef4444' : 'var(--text-main)';
                li.style.marginBottom = '4px';
                logBox.appendChild(li);
                // Auto-scroll to bottom
                logBox.parentElement.scrollTop = logBox.parentElement.scrollHeight; 
            };

            // Lock the button
            runBtn.disabled = true;
            runBtn.textContent = "Processing...";

            try {
                if (reportType === "INV_PROCESSING") {
                    logMsg(`Starting Invoices In Processing batch for ${targetMonth}/${targetYear}...`);
                    // We will adapt our previous function to return a count and use the logMsg
                    await batchProcessInvoicesEmail(targetMonth, targetYear, logMsg);
                } else {
                    logMsg(`Report type ${reportType} is not set up yet.`, true);
                }
            } catch (err) {
                logMsg(`Fatal Error: ${err.message}`, true);
            }

            // Unlock the button
            runBtn.disabled = false;
            runBtn.textContent = "🚀 Generate Batch";
        });
    }
});

// Updated signature to accept the UI logger
async function batchProcessInvoicesEmail(targetMonth, targetYear, logMsg) {
    const waivers = window.Workspace.appData.waivers;
    const invoices = window.Workspace.appData.invInProcessing;

    if (!waivers || !invoices) {
        logMsg("Missing data in memory hub! Please ensure all files are loaded.", true);
        return;
    }

    const emailFolderHandle = await window.Workspace.dirHandle.getDirectoryHandle("Generated_Emails", { create: true });
    const targetWaivers = waivers.filter(w => w["Month"] == targetMonth && w["Year"] == targetYear);
    let count = 0;

    for (const waiver of targetWaivers) {
        const jobId = String(waiver["Job ID"]).trim();
        const vendorId = String(waiver["Vendor ID"]).trim();

        const matchingInvoices = invoices.filter(inv => 
            String(inv["jobid"]).trim().toLowerCase() === jobId.toLowerCase() &&
            String(inv["vendorid"]).trim().toLowerCase() === vendorId.toLowerCase()
        );

        if (matchingInvoices.length > 0) {
            // ... (keep the same HTML body builder logic from earlier) ...
            const htmlBody = `...`; // (Omitted for brevity, use the one from before)

            const fileName = `WaiverRequest_${jobId}_${vendorId}`;
            
            // Try to generate the file
            const success = await generateEmailFile(emailFolderHandle, fileName, "vendor@example.com", "manager@company.com", `Action Required: Lien Waiver for ${jobId}`, htmlBody);
            
            if (success) {
                logMsg(`Generated: ${fileName}.eml`);
                count++;
            } else {
                logMsg(`Failed: ${fileName}.eml`, true);
            }
        }
    }

    logMsg(`✅ Batch Complete! Successfully saved ${count} email drafts to the 'Generated_Emails' folder.`);
}

// Helper to convert a file into a Base64 string for the email attachment
async function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            // Extracts just the base64 string, removing the "data:application/pdf;base64," prefix
            const base64String = reader.result.split(',')[1];
            resolve(base64String);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// --- Upgraded Multipart EML Generator ---
// added 'attachmentHandles' as an optional array of FileSystemFileHandle objects
async function generateEmailFile(saveFolderHandle, fileName, to, cc, subject, htmlBody, attachmentHandles = []) {
    try {
        // A unique string to separate the body from the attachments
        const boundary = "----=_NextPart_EMAIL_BOUNDARY_" + Date.now();
        
        // 1. Build the MIME Header
        let emlContent = 
`To: ${to}
CC: ${cc}
Subject: ${subject}
X-Unsent: 1
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="${boundary}"

--${boundary}
Content-Type: text/html; charset="utf-8"

${htmlBody}
`;

        // 2. Process and inject attachments
        if (attachmentHandles && attachmentHandles.length > 0) {
            for (const handle of attachmentHandles) {
                // Get the actual file data from the handle
                const file = await handle.getFile();
                const base64Data = await fileToBase64(file);
                
                // Format the attachment MIME block
                // Breaking the base64 string into 76-character lines is standard email formatting
                const formattedBase64 = base64Data.match(/.{1,76}/g).join('\r\n');

                emlContent += 
`
--${boundary}
Content-Type: application/octet-stream; name="${file.name}"
Content-Transfer-Encoding: base64
Content-Disposition: attachment; filename="${file.name}"

${formattedBase64}
`;
            }
        }

        // 3. Close the MIME boundary
        emlContent += `\n--${boundary}--\n`;

        // 4. Clean filename and save to disk
        const safeFileName = fileName.replace(/[<>:"/\\|?*]+/g, '_') + ".eml";
        const fileHandle = await saveFolderHandle.getFileHandle(safeFileName, { create: true });
        const writable = await fileHandle.createWritable();
        
        await writable.write(emlContent);
        await writable.close();
        
        console.log(`✅ Saved draft with ${attachmentHandles.length} attachments: ${safeFileName}`);
        return true;

    } catch (error) {
        console.error(`❌ Failed to save email ${fileName}:`, error);
        return false;
    }
}
