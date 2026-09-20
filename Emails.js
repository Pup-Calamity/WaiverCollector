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
// --- Report: Approval Reminders ---
async function batchProcessApprovalReminders(targetMonth, targetYear, logMsg) {
    const waivers = window.Workspace.appData.waivers;
    const invInProcessing = window.Workspace.appData.invInProcessing;
    const jobInfo = window.Workspace.appData.jobInfo;
    const openAR = window.Workspace.appData.openAR;

    if (!waivers || !invInProcessing || !jobInfo || !openAR) {
        logMsg("❌ Missing required data! Please hit 'Sync Data'.", true);
        return;
    }

    const emailFolderHandle = await window.Workspace.dirHandle.getDirectoryHandle("Generated_Emails", { create: true });
    
    // 1. Date Matching: Force both to integers to safely match "9" vs "09"
    const targetWaivers = waivers.filter(w => 
        parseInt(w["Month"]) === parseInt(targetMonth) && 
        parseInt(w["Year"]) === parseInt(targetYear)
    );
    
    logMsg(`🔍 Found ${targetWaivers.length} waivers for ${targetMonth}/${targetYear}. Scanning for stuck invoices...`);
    if (targetWaivers.length === 0) return;

    let emailCount = 0;

    for (const waiver of targetWaivers) {
        const jobId = String(waiver["Job ID"] || '').trim();
        const vendorId = String(waiver["Vendor ID"] || '').trim();

        // 2. Find invoices strictly in an "Approval" queue
        const matchingInvoices = invInProcessing.filter(inv => {
            const invJob = String(inv["jobid"] || '').trim().toLowerCase();
            const invVendor = String(inv["vendorid"] || '').trim().toLowerCase();
            const invQueue = String(inv["Queue"] || '').trim().toLowerCase();
            
            return (invJob === jobId.toLowerCase() && 
                    invVendor === vendorId.toLowerCase() && 
                    invQueue.includes("approval")); // Catching all "Approval" variations
        });

        if (matchingInvoices.length > 0) {
            // 3. Look up Job and Contact Info
            const jobData = jobInfo.find(j => String(j["Job ID"]).trim() === jobId) || {};
            const pcName = jobData["Project Manager"] || 'Unknown PC';
            const omName = jobData["Project Controller"] || 'Unknown OM';
            const jobName = jobData["Job Name"] || '';

            // Check memory, prompt if missing, save to Excel
            const pcEmail = await getEmployeeEmail(pcName, logMsg);
            const omEmail = await getEmployeeEmail(omName, logMsg);
            const ccEmails = [pcEmail, omEmail].filter(Boolean).join("; ");

            // 4. Calculate AR Open Amount & Aging
            const jobAR = openAR.filter(ar => String(ar["Job Number"]).trim() === jobId);
            
            let amountOpen = 0;
            let invAge = 0;
            
            jobAR.forEach(ar => {
                amountOpen += parseFloat(ar["Invoice $ Due"]) || 0; 
                const currentAge = parseInt(ar["Aging"]) || 0;
                if (currentAge > invAge) invAge = currentAge;
            });

            const formattedAmountOpen = amountOpen.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

            // 5. Build the HTML Table
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

            // 6. Construct the Email Body
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

            const fileName = `ApprovalReminder_${jobId}_${vendorId}`;
            const toEmail = ccEmails || "missing-contact@company.com"; 
            const subject = `NOTIFICATION: Potential Payment Delay for ${jobId} - ${jobName}`;

            const success = await generateEmailFile(emailFolderHandle, fileName, toEmail, "", subject, htmlBody);
            
            if (success) {
                logMsg(`✉️ Generated Reminder: ${fileName}.eml`);
                emailCount++;
            }
        }
    }

    logMsg(`✅ Batch Complete! Generated ${emailCount} Approval Reminders.`);
}


// --- Global Email Lookup Utility ---
async function getEmployeeEmail(empName, logMsg = console.log) {
    if (!empName || empName.includes('Unknown')) return "";
    
    // Grab the global memory block
    const empInfo = window.Workspace.appData.empInfo;
    if (!empInfo) return ""; 

    // 1. Check if they exist in memory
    const emp = empInfo.find(e => String(e["Employee Name"]).trim().toLowerCase() === String(empName).trim().toLowerCase());
    
    if (emp && emp["Employee Email"]) {
        return emp["Employee Email"];
    }

    // 2. If missing, pause the app and ask the user
    const newEmail = prompt(`Missing email for Project Contact: ${empName}\n\nPlease enter their email address to save it to the database:`);
    
    if (newEmail && newEmail.trim() !== "") {
        const cleanEmail = newEmail.trim();
        
        // 3. Build the new record using your exact headers
        const newEmpRecord = {
            "Emp ID": "TBD", 
            "Employee Name": empName,
            "Employee Email": cleanEmail,
            "Employee Office": "",
            "Employee Cell": ""
        };

        // 4. Update live memory so it doesn't ask again this session
        empInfo.push(newEmpRecord);
        
        // 5. Save permanently to Excel
        try {
            // NOTE: Make sure window.WORKSPACE_FILE_PATHS.empInfo matches your setup!
            const fileHandle = await getFileByPath(window.Workspace.dirHandle, window.WORKSPACE_FILE_PATHS.empInfo);
            
            // Assuming your sheet is named "empInfo" or "Employees"
            await UpdateExcel(fileHandle, [newEmpRecord], "Employee Name", "empInfo"); 
            
            logMsg(`➕ Saved new email for ${empName} to database.`);
        } catch (err) {
            console.warn("Failed to write new employee to Excel:", err);
            logMsg(`⚠️ Added ${empName} to memory, but failed to save to Excel.`, true);
        }

        return cleanEmail;
    }

    // 6. If they hit cancel, just return blank
    return "";
}
