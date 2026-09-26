// js/tools/approvalQueue.js

let activeQueueItem = null;

window.addEventListener('DOMContentLoaded', () => {
    const launchBtn = document.getElementById('launchApprovalQueueBtn');
    if (launchBtn) {
        launchBtn.addEventListener('click', async () => {
            if (!window.Workspace || !window.Workspace.appData.waiverReviewQueue) {
                return alert("Please sync data first.");
            }
            
            const originalText = launchBtn.innerHTML;
            launchBtn.innerHTML = `<h3><span style="animation: pulse 1.5s infinite;">⏳</span> Sweeping Inbox...</h3>`;
            
            await sweepInboxToTriage();
            
            launchBtn.innerHTML = originalText;
            switchView('approvalQueueView');
            renderQueueList();

            document.getElementById('jobLookupBtn')?.addEventListener('click', () => openLookupModal('job'));
            document.getElementById('vendorLookupBtn')?.addEventListener('click', () => openLookupModal('vendor'));
            document.getElementById('closeLookupBtn')?.addEventListener('click', () => document.getElementById('lookupModal').close());
            document.getElementById('lookupSearchInput')?.addEventListener('input', performLookupSearch);
        });
    }

    const backBtn = document.getElementById('backToHubFromQueueBtn');
    if (backBtn) backBtn.addEventListener('click', () => switchView('processingWorkspace'));

    document.getElementById('aqApproveBtn')?.addEventListener('click', processApproval);
    document.getElementById('aqRejectBtn')?.addEventListener('click', processRejection);
});

async function getAttachmentsBaseFolder() {
    let currentDir = window.Workspace.dirHandle;
    const pathParts = ["Data", "MainData", "Email Attachments"];
    for (const folder of pathParts) {
        currentDir = await currentDir.getDirectoryHandle(folder, { create: true });
    }
    return currentDir;
}

// --- 1. Background Sweeper ---
async function sweepInboxToTriage() {
    const baseFolder = await getAttachmentsBaseFolder();
    const inboxFolder = await baseFolder.getDirectoryHandle('Waivers_1_Inbox', { create: true });
    const triageFolder = await baseFolder.getDirectoryHandle('Waivers_2_Triage', { create: true });
    
    const queueData = window.Workspace.appData.waiverReviewQueue || [];
    let updatesToExcel = [];
    let filesScanned = 0;

    let pdfjsLib = window['pdfjs-dist/build/pdf'];

    for await (const entry of inboxFolder.values()) {
        if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.pdf')) {
            const row = queueData.find(r => r["File Name"] === entry.name);
            if (!row) continue; 

            try {
                const file = await entry.getFile();
                const arrayBuffer = await file.arrayBuffer();

                let qrRawValue = null;

                if (pdfjsLib) {
                    const pdfDoc = await pdfjsLib.getDocument(arrayBuffer).promise;
                    const page = await pdfDoc.getPage(1);
                    const viewport = page.getViewport({ scale: 2.0 }); 
                    
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    canvas.width = viewport.width; 
                    canvas.height = viewport.height; 
                    await page.render({ canvasContext: ctx, viewport: viewport }).promise;

                    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const code = jsQR(imgData.data, imgData.width, imgData.height, {
                        inversionAttempts: "dontInvert",
                    });

                    if (code) {
                        qrRawValue = code.data;
                        console.log("🔍 [QR Debug] Raw string read from PDF:", qrRawValue);
                    } else {
                        console.log("⚠️ [QR Debug] jsQR could not find a code on page 1 of:", entry.name);
                    }
                }

                if (qrRawValue) {
                    const parts = qrRawValue.split(' ');
                    console.log("✂️ [QR Debug] Split parts array:", parts);
                    
                    // 1. Grab the 4 pieces from the QR Code
                    const scannedWaiverId = parts[0] || "";
                    row["Waiver ID"]      = scannedWaiverId;
                    row["Waiver Month"]   = parts[1] || "";
                    row["Waiver Year"]    = parts[2] || "";
                    row["Waiver Type"]    = parts[3] || "";
                    
                    // 2. Look up the matching record in the Master Waivers memory
                    const masterWaivers = window.Workspace.appData.waivers || [];
                    const masterRow = masterWaivers.find(w => String(w["Waiver ID"]).trim() === scannedWaiverId);
                    
                    // 3. Populate the queue UI directly from the true master data
                    if (masterRow) {
                        row["Job ID"]        = masterRow["Job ID"] || "";
                        row["Vendor ID"]     = masterRow["Vendor ID"] || "";
                        row["Pay App Month"] = masterRow["Month"] || "";
                        row["Pay App Year"]  = masterRow["Year"] || "";
                    } else {
                        console.warn(`⚠️ [QR Debug] Waiver ID ${scannedWaiverId} not found in Master Tracker!`);
                        row["Job ID"]        = "UNKNOWN";
                        row["Vendor ID"]     = "UNKNOWN";
                    }
                    
                    row["Status"] = "Pending Review";
                } else {
                    row["Status"] = "Pending Review (Manual)";
                }

                const newFileHandle = await triageFolder.getFileHandle(entry.name, { create: true });
                const writable = await newFileHandle.createWritable();
                await writable.write(arrayBuffer);
                await writable.close();
                await inboxFolder.removeEntry(entry.name);

                updatesToExcel.push(row);
                filesScanned++;

            } catch (e) {
                console.error(`Failed to scan ${entry.name}`, e);
            }
        }
    }

    if (updatesToExcel.length > 0) {
        console.log(`Swept ${filesScanned} files from Inbox to Triage.`);
        const queueFileHandle = await getFileByPath(window.Workspace.dirHandle, window.WORKSPACE_FILE_PATHS.waiverReviewQueue);
        await UpdateExcel(queueFileHandle, updatesToExcel, "Queue ID", "waiverReviewQueue");
    }
}

// --- 2. Render Left Panel ---
function renderQueueList() {
    const queueData = window.Workspace.appData.waiverReviewQueue || [];
    const listContainer = document.getElementById('aqList');
    
    const pendingItems = queueData.filter(row => 
        String(row["Status"] || "").trim().toLowerCase().includes("pending")
    );

    document.getElementById('aqCount').textContent = pendingItems.length;
    listContainer.innerHTML = "";

    if (pendingItems.length === 0) {
        listContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 20px;">Queue is empty! 🎉</div>`;
        clearSelection();
        return;
    }

    pendingItems.forEach(item => {
        const card = document.createElement('div');
        const isSelected = activeQueueItem && activeQueueItem["Queue ID"] === item["Queue ID"];
        
        card.style.cssText = `
            padding: 8px 12px; 
            background: ${isSelected ? 'var(--bg-color)' : 'var(--surface-color)'}; 
            border: 1px solid ${isSelected ? 'var(--brand-color)' : 'var(--border-color)'}; 
            border-radius: 6px; 
            cursor: pointer;
            transition: all 0.2s;
        `;
        
        card.innerHTML = `
            <div style="font-weight: bold; font-size: 0.9em; color: var(--text-main); margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item["File Name"] || "Unknown Document"}</div>
            <div style="font-size: 0.75em; color: var(--text-muted); margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Sender: ${item["Sender Email"] || "-"}</div>
            <div style="font-size: 0.8em; color: var(--text-muted); display: flex; gap: 4px;">
                <span style="background: #e2e8f0; color: #334155; padding: 1px 4px; border-radius: 3px; font-family: monospace;">J: ${item["Job ID"] || "-"}</span>
                <span style="background: #e2e8f0; color: #334155; padding: 1px 4px; border-radius: 3px; font-family: monospace;">V: ${item["Vendor ID"] || "-"}</span>
                <span style="background: #fef08a; color: #854d0e; padding: 1px 4px; border-radius: 3px; font-family: monospace;">${item["Waiver Type"] || "Type"}</span>
            </div>
        `;

        card.addEventListener('click', () => loadQueueItem(item));
        listContainer.appendChild(card);
    });
}

// --- 3. Load Right Panel ---
async function loadQueueItem(item) {
    activeQueueItem = item;
    
    document.getElementById('aqJobId').value = item["Job ID"] || "";
    document.getElementById('aqVendorId').value = item["Vendor ID"] || "";
    document.getElementById('aqType').value = item["Waiver Type"] || "";
    document.getElementById('aqPayAppMonth').value = item["Pay App Month"] || "";
    document.getElementById('aqPayAppYear').value = item["Pay App Year"] || "";
    document.getElementById('aqWaiverMonth').value = item["Waiver Month"] || "";
    
    // Set Scan Status Banner
    const statusBanner = document.getElementById('aqScanStatus');
    if (item["Status"] === "Pending Review (Manual)") {
        statusBanner.style.background = "#fee2e2";
        statusBanner.style.color = "#b91c1c";
        statusBanner.innerHTML = "⚠️ QR Code unreadable or missing. Please type data in manually.";
    } else {
        statusBanner.style.background = "#dcfce7";
        statusBanner.style.color = "#15803d";
        statusBanner.innerHTML = "✅ QR Scanned Successfully! Verify the boxes below match the PDF.";
    }

    // Translate the IDs to names and check for custom flags
    updateQueueContextDisplay();

    const frame = document.getElementById('aqPdfFrame');
    frame.src = "about:blank"; // Clear the frame while the new file loads

    try {
        const baseFolder = await getAttachmentsBaseFolder();
        const triageFolder = await baseFolder.getDirectoryHandle('Waivers_2_Triage');
        const fileHandle = await triageFolder.getFileHandle(item["File Name"]);
        const file = await fileHandle.getFile();
        
        const fileURL = URL.createObjectURL(file);
        frame.src = fileURL;
    } catch (error) {
        console.warn("Could not load preview.", error);
        frame.src = "about:blank"; 
    }

    document.getElementById('aqApproveBtn').disabled = false;
    document.getElementById('aqRejectBtn').disabled = false;
    
    renderQueueList();
}

function clearSelection() {
    activeQueueItem = null;
    document.getElementById('aqJobId').value = "";
    document.getElementById('aqVendorId').value = "";
    document.getElementById('aqType').value = "";
    document.getElementById('aqPayAppMonth').value = "";
    document.getElementById('aqPayAppYear').value = "";
    document.getElementById('aqWaiverMonth').value = "";
    
    // Clear Context Labels
    const statusBanner = document.getElementById('aqScanStatus');
    if (statusBanner) { statusBanner.style.background = "transparent"; statusBanner.innerHTML = ""; }
    
    const throughDisplay = document.getElementById('aqThroughPeriodDisplay');
    if (throughDisplay) throughDisplay.innerHTML = "";
    
    const badgeDiv = document.getElementById('aqContextBadge');
    if (badgeDiv) badgeDiv.innerHTML = "";
    
    const jobName = document.getElementById('aqJobNameDisplay');
    if (jobName) jobName.textContent = "-";
    
    const venName = document.getElementById('aqVendorNameDisplay');
    if (venName) venName.textContent = "-";
    
    document.getElementById('aqPdfFrame').src = "about:blank";
    document.getElementById('aqApproveBtn').disabled = true;
    document.getElementById('aqRejectBtn').disabled = true;
}

// --- 4. Process Approval ---
async function processApproval() {
    if (!activeQueueItem) return;

    const finalJob = document.getElementById('aqJobId').value.trim();
    const finalVendor = document.getElementById('aqVendorId').value.trim();
    const finalType = document.getElementById('aqType').value.trim();
    
    const finalPayAppMonth = document.getElementById('aqPayAppMonth').value.trim();
    const finalPayAppYear = document.getElementById('aqPayAppYear').value.trim();
    const finalWaiverMonth = document.getElementById('aqWaiverMonth').value.trim();
    const finalWaiverYear = document.getElementById('aqWaiverYear').value.trim();

    if (!finalJob || !finalVendor || !finalPayAppMonth || !finalPayAppYear || !finalType) {
        return alert("Please ensure Job, Vendor, Type, and Pay App dates are filled out.");
    }

    try {
        document.getElementById('aqApproveBtn').textContent = "Processing...";
        document.getElementById('aqApproveBtn').disabled = true;

        await routeFileLocally(activeQueueItem["File Name"], finalJob, finalVendor, finalWaiverMonth, finalWaiverYear, finalType);

        activeQueueItem["Status"] = "Approved";
        activeQueueItem["Job ID"] = finalJob; 
        activeQueueItem["Vendor ID"] = finalVendor;
        activeQueueItem["Waiver Type"] = finalType;
        activeQueueItem["Pay App Month"] = finalPayAppMonth;
        activeQueueItem["Pay App Year"] = finalPayAppYear;
        activeQueueItem["Waiver Month"] = finalWaiverMonth;
        activeQueueItem["Waiver Year"] = finalWaiverYear;
        
        const reviewQueueHandle = await getFileByPath(window.Workspace.dirHandle, window.WORKSPACE_FILE_PATHS.waiverReviewQueue);
        await UpdateExcel(reviewQueueHandle, [activeQueueItem], "Queue ID", "WaiverReviewQueue");

        clearSelection();
        renderQueueList();

    } catch (err) {
        alert("Error processing approval: " + err.message);
    } finally {
        document.getElementById('aqApproveBtn').textContent = "✅ Approve & File";
    }
}

// --- 5. Process Rejection ---
async function processRejection() {
    if (!activeQueueItem) return;

    const reason = prompt("Enter the reason for rejection (this will be emailed to the sender):");
    if (reason === null) return; 

    try {
        document.getElementById('aqRejectBtn').textContent = "Processing...";
        document.getElementById('aqRejectBtn').disabled = true;

        const emailsDir = await window.Workspace.dirHandle.getDirectoryHandle('Generated_Emails', { create: true });
        const sender = activeQueueItem["Sender Email"];
        const originalSubject = activeQueueItem["Email Subject"] || "Lien Waiver";
        const fileName = `Rejection_${activeQueueItem["Queue ID"]}`;
        
        const htmlBody = `
            <div style="font-family: Calibri, sans-serif; font-size: 11pt; color: #333;">
                <p>Hello,</p>
                <p>Thank you for submitting your lien waiver. Unfortunately, we cannot accept the attached document for the following reason:</p>
                <p style="color: #b91c1c; font-weight: bold; margin-left: 20px;">${reason || "Document is incomplete or incorrect."}</p>
                <p>Please correct the issue and resubmit.</p>
                <p>Thank you,</p>
                <p><strong>Accounts Payable</strong></p>
            </div>
        `;
        
        await generateEmailFile(emailsDir, fileName, sender, "", `RE: ${originalSubject}`, htmlBody);

        activeQueueItem["Status"] = "Rejected";
        const reviewQueueHandle = await getFileByPath(window.Workspace.dirHandle, window.WORKSPACE_FILE_PATHS.waiverReviewQueue);
        await UpdateExcel(reviewQueueHandle, [activeQueueItem], "Queue ID", "WaiverReviewQueue");

        try {
            const baseFolder = await getAttachmentsBaseFolder();
            const triageFolder = await baseFolder.getDirectoryHandle('Waivers_2_Triage');
            await triageFolder.removeEntry(activeQueueItem["File Name"]);
        } catch (e) {
            console.warn("Could not delete file from Triage Zone.", e);
        }

        alert(`Rejection logged. A draft email has been saved to Generated_Emails.`);
        clearSelection();
        renderQueueList();

    } catch (err) {
        alert("Error processing rejection: " + err.message);
    } finally {
        document.getElementById('aqRejectBtn').textContent = "❌ Reject";
    }
}

// --- 6. Route to Final Job Folder ---
async function routeFileLocally(fileName, targetJob, vendorId, waiverMonth, waiverYear, waiverType) {
    try {
        const baseFolder = await getAttachmentsBaseFolder();
        const triageFolder = await baseFolder.getDirectoryHandle('Waivers_2_Triage');
        
        const fileHandle = await triageFolder.getFileHandle(fileName);
        const file = await fileHandle.getFile();

        let vendorName = vendorId;
        try { vendorName = window.WaiverMath.getEmailInfo(targetJob, vendorId, "Vendor Name") || vendorId; } catch(e) {}
        const cleanVendorName = vendorName.replace(/[^a-zA-Z0-9 -]/g, "").trim();

        const jobInfo = window.Workspace.appData.jobInfo || [];
        const jobData = jobInfo.find(j => String(j["Job ID"]).trim().toLowerCase() === String(targetJob).toLowerCase()) || {};
        let burgName = String(jobData["BURG Name"] || "Unknown Burg").trim().replace(/[^a-zA-Z0-9 -]/g, "");

        const formattedWMonth = String(waiverMonth).padStart(2, '0');
        const wYear4 = String(waiverYear);
        const wYear2 = wYear4.slice(-2);

        const folderName = `${formattedWMonth}-${wYear4}`; 
        const newFileName = `${targetJob}-${formattedWMonth}${wYear2}_${cleanVendorName}_${waiverType}_rec.pdf`;

        const waiversBase = await window.Workspace.dirHandle.getDirectoryHandle("Waivers", { create: true });
        
        let burgFolder = null;
        for await (const entry of waiversBase.values()) {
            if (entry.kind === 'directory' && entry.name.toLowerCase().includes(burgName.toLowerCase())) {
                burgFolder = await waiversBase.getDirectoryHandle(entry.name);
                break;
            }
        }
        
        if (!burgFolder) {
            burgFolder = await waiversBase.getDirectoryHandle(burgName, { create: true });
        }

        const jobFolder = await burgFolder.getDirectoryHandle(targetJob, { create: true });
        const periodFolder = await jobFolder.getDirectoryHandle(folderName, { create: true });

        const newFileHandle = await periodFolder.getFileHandle(newFileName, { create: true });
        const writable = await newFileHandle.createWritable();
        await writable.write(await file.arrayBuffer());
        await writable.close();

        await triageFolder.removeEntry(fileName);
    } catch (error) {
        console.warn("Local file routing failed.", error);
        throw new Error("Could not move the PDF locally. Ensure Waivers_2_Triage is accessible. " + error.message);
    }
}

// --- Context UI Helper ---
function updateQueueContextDisplay() {
    const jobId = document.getElementById('aqJobId').value.trim();
    const vendorId = document.getElementById('aqVendorId').value.trim();
    
    let jobName = "Unknown Job";
    let vendorName = "Unknown Vendor";

    try {
        if (window.WaiverMath) {
            jobName = window.WaiverMath.getEmailInfo(jobId, vendorId, "Job Name") || "Unknown Job";
            vendorName = window.WaiverMath.getEmailInfo(jobId, vendorId, "Vendor Name") || "Unknown Vendor";
        }
    } catch(e) {}

    // 1. Update the plain English names under the boxes
    document.getElementById('aqJobNameDisplay').textContent = jobName;
    document.getElementById('aqVendorNameDisplay').textContent = vendorName;

    // 2. Fetch the Master Record to show the Through Date and Custom Flags
    const waiverId = activeQueueItem ? activeQueueItem["Waiver ID"] : "";
    const masterRow = (window.Workspace.appData.waivers || []).find(w => String(w["Waiver ID"]).trim() === waiverId);
    
    const throughDisplay = document.getElementById('aqThroughPeriodDisplay');
    const badgeDiv = document.getElementById('aqContextBadge');

    if (masterRow) {
        throughDisplay.innerHTML = `<strong>PDF Should Say Through:</strong> <span style="color: var(--text-main);">${masterRow["Through Period"] || "Unknown"}</span>`;
        
        const isCustom = waiverId.match(/-([2-9]|\d{2,})$/); 
        if (isCustom) {
            badgeDiv.innerHTML = `<span style="background: #fef08a; color: #854d0e; padding: 3px 6px; border-radius: 4px;">⚠️ Custom Waiver</span>`;
        } else {
            badgeDiv.innerHTML = `<span style="background: #e2e8f0; color: #334155; padding: 3px 6px; border-radius: 4px;">Standard Period</span>`;
        }
    } else {
        throughDisplay.innerHTML = "";
        badgeDiv.innerHTML = "";
    }
}

// --- 7. Search / Lookup Engine ---
let currentLookupMode = null;

function openLookupModal(mode) {
    currentLookupMode = mode;
    const modal = document.getElementById('lookupModal');
    const title = document.getElementById('lookupTitle');
    const input = document.getElementById('lookupSearchInput');
    
    title.innerHTML = mode === 'job' ? '🔍 Lookup Job' : '🔍 Lookup Vendor';
    input.value = '';
    
    performLookupSearch(); // Show initial unfiltered list
    modal.showModal();
    input.focus();
}

function performLookupSearch() {
    const searchTerm = document.getElementById('lookupSearchInput').value.toLowerCase().trim();
    const resultsContainer = document.getElementById('lookupResults');
    resultsContainer.innerHTML = '';

    let data = [];
    let idKey = '';
    let nameKey = '';

    if (currentLookupMode === 'job') {
        data = window.Workspace.appData.jobInfo || [];
        idKey = 'Job ID';
        nameKey = 'Job Name';
    } else {
        data = window.Workspace.appData.vendorInfo || [];
        idKey = 'Vendor ID';
        nameKey = 'Vendor Name';
    }

    let matchCount = 0;
    
    for (const row of data) {
        const idVal = String(row[idKey] || '').toLowerCase();
        const nameVal = String(row[nameKey] || '').toLowerCase();

        // Search logic: matches if input is empty, or if text exists in ID or Name
        if (!searchTerm || idVal.includes(searchTerm) || nameVal.includes(searchTerm)) {
            const div = document.createElement('div');
            div.style.cssText = `padding: 6px 10px; border-bottom: 1px solid var(--border-color); cursor: pointer; transition: background 0.2s;`;
            div.onmouseover = () => div.style.background = 'var(--surface-color)';
            div.onmouseout = () => div.style.background = 'transparent';
            
            // Compacted HTML layout
            div.innerHTML = `
                <div style="font-weight: bold; font-size: 0.9em; color: var(--text-main);">${row[idKey] || 'N/A'}</div>
                <div style="font-size: 0.75em; color: var(--text-muted);">${row[nameKey] || 'Unknown Name'}</div>
            `;
            
            // When clicked, auto-fill the target box and trigger the UI context update
            div.onclick = () => {
                if (currentLookupMode === 'job') {
                    document.getElementById('aqJobId').value = row[idKey];
                } else {
                    document.getElementById('aqVendorId').value = row[idKey];
                }
                
                // Immediately update the English names underneath the inputs!
                if (typeof updateQueueContextDisplay === 'function') updateQueueContextDisplay();
                
                document.getElementById('lookupModal').close();
            };

            resultsContainer.appendChild(div);
            matchCount++;
            
            // Cap at 50 results to keep the UI lightning fast
            if (matchCount >= 50) break;
        }
    }

    if (matchCount === 0) {
        resultsContainer.innerHTML = `<div style="padding: 10px; text-align: center; color: var(--text-muted); font-size: 0.85em;">No results found.</div>`;
    }
}