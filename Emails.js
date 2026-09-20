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
                if (reportType === "APPROVAL_REMINDERS") {
                    logMsg(`Starting AP03 Approval Reminders for ${targetMonth}/${targetYear}...`);
                    await batchProcessApprovalReminders(targetMonth, targetYear, logMsg);
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

// --- Report: AP03 Approval Reminders ---
async function batchProcessApprovalReminders(targetMonth, targetYear, logMsg) {
    // 1. Load the necessary data tables from memory
    const waivers = window.Workspace.appData.waivers;
    const invInProcessing = window.Workspace.appData.invInProcessing;
    const jobInfo = window.Workspace.appData.jobInfo;
    const openAR = window.Workspace.appData.openAR;
    const empInfo = window.Workspace.appData.empInfo;

    if (!waivers || !invInProcessing || !jobInfo || !openAR || !empInfo) {
        logMsg("Missing required data! Ensure Waivers, InvInProcessing, JobInfo, OpenAR, and EmpInfo are loaded.", true);
        return;
    }

    const emailFolderHandle = await window.Workspace.dirHandle.getDirectoryHandle("Generated_Emails", { create: true });
    
    // Get waivers for the selected period
    const targetWaivers = waivers.filter(w => w["Month"] == targetMonth && w["Year"] == targetYear);
    let count = 0;

    // Helper function to look up employee emails
    const getEmail = (empName) => {
        if (!empName) return "";
        const emp = empInfo.find(e => String(e["Employee Name"]).trim().toLowerCase() === String(empName).trim().toLowerCase());
        return emp ? emp["Employee Email"] : "";
    };

    for (const waiver of targetWaivers) {
        const jobId = String(waiver["Job ID"] || '').trim();
        const vendorId = String(waiver["Vendor ID"] || '').trim();

        // 2. Find invoices for this combo that are STRICTLY in the AP03 queue
        const matchingInvoices = invInProcessing.filter(inv => 
            String(inv["jobid"]).trim().toLowerCase() === jobId.toLowerCase() &&
            String(inv["vendorid"]).trim().toLowerCase() === vendorId.toLowerCase() &&
            String(inv["Queue"]).trim().toLowerCase().includes("ap03") // Matches "AP03 - Approval"
        );

        if (matchingInvoices.length > 0) {
            
            // 3. Look up Job and Contact Info
            const jobData = jobInfo.find(j => String(j["Job ID"]).trim() === jobId) || {};
            const pcName = jobData["Project Manager"] || 'Unknown PC';
            const omName = jobData["Project Controller"] || 'Unknown OM';
            const burgName = jobData["BURG Name"] || 'Unknown BURG';
            const jobName = jobData["Job Name"] || '';

            const pcEmail = getEmail(pcName);
            const omEmail = getEmail(omName);
            const ccEmails = [pcEmail, omEmail].filter(Boolean).join("; ");

            // 4. Calculate AR Open Amount & Aging
            const jobAR = openAR.filter(ar => String(ar["Job Number"]).trim() === jobId);
            
            let amountOpen = 0;
            let invAge = 0;
            
            jobAR.forEach(ar => {
                // Parse float, defaulting to 0 if NaN
                amountOpen += parseFloat(ar["Invoice $ Due"]) || 0; 
                
                const currentAge = parseInt(ar["Aging"]) || 0;
                if (currentAge > invAge) invAge = currentAge;
            });

            const formattedAmountOpen = amountOpen.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

            // 5. Build the HTML Table for the stuck invoices
            let invoiceRowsHtml = "";
            matchingInvoices.forEach(inv => {
                const formattedAmount = Number(inv["Amount"]).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
                invoiceRowsHtml += `
                    <tr>
                        <td style="padding: 8px; border: 1px solid #ccc;">${pcName} / ${omName}</td>
                        <td style="padding: 8px; border: 1px solid #ccc;">${jobId}</td>
                        <td style="padding: 8px; border: 1px solid #ccc;">${inv["invoicenumb"] || ''}</td>
                        <td style="padding: 8px; border: 1px solid #ccc;">${inv["vendorid"] || ''}</td>
                        <td style="padding: 8px; border: 1px solid #ccc;">${inv["vendorname"] || ''}</td>
                        <td style="padding: 8px; border: 1px solid #ccc;">${inv["invoicedate (Day-Month-Year)"] || ''}</td>
                        <td style="padding: 8px; border: 1px solid #ccc;">${formattedAmount}</td>
                        <td style="padding: 8px; border: 1px solid #ccc;">${inv["Aging"] || '0'}</td>
                    </tr>`;
            });

            // 6. Construct the final Email Body
            const htmlBody = `
                <div style="font-family: Calibri, sans-serif; font-size: 11pt; color: #333;">
                    <p><span style="background-color: #dcfce7; padding: 3px;"><strong>NOTE:</strong> This notification DOES NOT indicate whether your project has been funded, or that the vendor is refusing to sign a waiver. This is to be used as a tool to draw awareness to potential issues that may hold up our payment.</span></p>
                    
                    <p>Hello,</p>
                    <p>The following ${targetMonth}/${targetYear} invoices may prevent the collection of waivers needed to receive payment of <strong>${formattedAmountOpen}</strong> for the Pay App, which is currently <strong>${invAge} days old</strong>.</p>
                    
                    <p style="color: #b91c1c;"><strong>If this is more than 30 days old, it is very important to resolve the issues as quickly as possible.</strong></p>
                    
                    <ul style="margin-bottom: 20px;">
                        <li>If you do not believe the issue can be resolved soon, but you feel you can have the vendor sign a waiver without the invoices being resolved, please respond to this email letting us know and we can CC you on the email when the waiver is sent.</li>
                        <li>Also note that invoices need to be approved by end of day the day before the payment day of your burg. If you are approving invoices on this list, please <strong>Reply ALL</strong> to this email to ensure they can get selected.</li>
                    </ul>

                    <table style="border-collapse: collapse; width: 100%; margin: 15px 0; font-size: 10pt;">
                        <thead>
                            <tr style="background-color: #f3f4f6; text-align: left;">
                                <th style="padding: 8px; border: 1px solid #ccc;">PC/OM</th>
                                <th style="padding: 8px; border: 1px solid #ccc;">Job ID</th>
                                <th style="padding: 8px; border: 1px solid #ccc;">Invoice Number</th>
                                <th style="padding: 8px; border: 1px solid #ccc;">Vendor ID</th>
                                <th style="padding: 8px; border: 1px solid #ccc;">Vendor Name</th>
                                <th style="padding: 8px; border: 1px solid #ccc;">Invoice Date</th>
                                <th style="padding: 8px; border: 1px solid #ccc;">Amount</th>
                                <th style="padding: 8px; border: 1px solid #ccc;">Days in Queue</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${invoiceRowsHtml}
                        </tbody>
                    </table>
                    
                    <p>Thank you,</p>
                    <p>Accounts Payable Team</p>
                </div>
            `;

            // Define the email parameters
            const fileName = `ApprovalReminder_${jobId}_${vendorId}`;
            const toEmail = ccEmails || "missing-contact@company.com"; 
            const subject = `NOTIFICATION: Potential Payment Delay for ${jobId} - ${jobName}`;

            // Generate the file
            const success = await generateEmailFile(emailFolderHandle, fileName, toEmail, "", subject, htmlBody);
            
            if (success) {
                logMsg(`Generated Reminder: ${fileName}.eml`);
                count++;
            }
        }
    }

    logMsg(`✅ Batch Complete! Generated ${count} AP03 Reminders.`);
}
