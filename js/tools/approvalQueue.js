// js/tools/approvalQueue.js

let activeQueueItem = null;

window.addEventListener('DOMContentLoaded', () => {
    const launchBtn = document.getElementById('launchApprovalQueueBtn');
    if (launchBtn) {
        launchBtn.addEventListener('click', async () => {
            if (!window.Workspace || !window.Workspace.appData.waiverReviewQueue) {
                return alert("Please sync data first.");
            }
            
            // Change button text while scanning
            const originalText = launchBtn.innerHTML;
            launchBtn.innerHTML = `<h3><span style="animation: pulse 1.5s infinite;">⏳</span> Sweeping Inbox...</h3>`;
            
            // Run the scan and move files from Inbox to Triage
            await sweepInboxToTriage();
            
            // Restore button and open view
            launchBtn.innerHTML = originalText;
            switchView('approvalQueueView');
            renderQueueList();
        });
    }

    const backBtn = document.getElementById('backToHubFromQueueBtn');
    if (backBtn) backBtn.addEventListener('click', () => switchView('processingWorkspace'));

    document.getElementById('aqApproveBtn')?.addEventListener('click', processApproval);
    document.getElementById('aqRejectBtn')?.addEventListener('click', processRejection);
});

// --- Helper: Safely navigate to \Data\MainData\Email Attachments\ ---
async function getAttachmentsBaseFolder() {
    let currentDir = window.Workspace.dirHandle;
    const pathParts = ["Data", "MainData", "Email Attachments"];
    
    for (const folder of pathParts) {
        currentDir = await currentDir.getDirectoryHandle(folder, { create: true });
    }
    return currentDir;
}

// --- 1. The Background Sweeper ---
async function sweepInboxToTriage() {
    const baseFolder = await getAttachmentsBaseFolder();
    const inboxFolder = await baseFolder.getDirectoryHandle('Waivers_1_Inbox', { create: true });
    const triageFolder = await baseFolder.getDirectoryHandle('Waivers_2_Triage', { create: true });
    
    const queueData = window.Workspace.appData.waiverReviewQueue || [];
    let updatesToExcel = [];
    let filesScanned = 0;

    let pdfjsLib;
    let detector;
    
    if ('BarcodeDetector' in window) {
        pdfjsLib = window['pdfjs-dist/build/pdf'];
        detector = new BarcodeDetector({ formats: ['qr_code'] });
    }

    for await (const entry of inboxFolder.values()) {
        if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.pdf')) {
            // Find the "Unscanned" row Power Automate created
            const row = queueData.find(r => r["File Name"] === entry.name);
            if (!row) continue; // Skip if PA hasn't finished writing the Excel row yet

            try {
                const file = await entry.getFile();
                const arrayBuffer = await file.arrayBuffer();

                // Scan QR if browser supports it
                if (detector && pdfjsLib) {
                    const pdfDoc = await pdfjsLib.getDocument(arrayBuffer).promise;
                    const page = await pdfDoc.getPage(1);
                    const viewport = page.getViewport({ scale: 2.0 }); 
                    
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    canvas.width = viewport.width; 
                    canvas.height = viewport.height; 
                    await page.render({ canvasContext: ctx, viewport: viewport }).promise;

                    const barcodes = await detector.detect(canvas);
                    
                    if (barcodes.length > 0) {
                        const parts = barcodes[0].rawValue.split(' ');
                        // Example: ["21587", "0000036046", "012027", "|122026", "UNCOND"]
                        
                        row["Job ID"] = parts[0];
                        row["Vendor ID"] = parts[1].replace(/^0+/, '');
                        
                        // Extract Pay App Date (MMYYYY)
                        row["Pay App Month"] = parts[2].substring(0, 2);
                        row["Pay App Year"] = parts[2].substring(2, 6); 

                        // Extract Waiver Date (Strip the pipe symbol first)
                        const wDate = parts[3].replace('|', ''); // e.g. "122026"
                        row["Waiver Month"] = wDate.substring(0, 2);
                        row["Waiver Year"] = wDate.substring(2, 6); 

                        // Extract Type
                        row["Waiver Type"] = parts[4] || "";
                        
                        row["Status"] = "Pending Review";
                    } else {
                        row["Status"] = "Pending Review (Manual)";
                    }

                // Move file to Triage
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
        await UpdateExcel(queueFileHandle, updatesToExcel, "Queue ID", "WaiverReviewQueue");
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
            padding: 15px; 
            background: ${isSelected ? 'var(--bg-color)' : 'var(--surface-color)'}; 
            border: 2px solid ${isSelected ? 'var(--brand-color)' : 'var(--border-color)'}; 
            border-radius: 8px; 
            cursor: pointer;
            transition: all 0.2s;
        `;
        
        card.innerHTML = `
            <div style="font-weight: bold; color: var(--text-main); margin-bottom: 5px;">${item["File Name"] || "Unknown Document"}</div>
            <div style="font-size: 0.85em; color: var(--text-muted); margin-bottom: 3px;">Sender: ${item["Sender Email"] || "-"}</div>
            <div style="font-size: 0.85em; color: var(--text-muted);">
                <span style="background: #e2e8f0; color: #334155; padding: 2px 6px; border-radius: 4px; font-family: monospace;">J: ${item["Extracted Job ID"] || "null"}</span>
                <span style="background: #e2e8f0; color: #334155; padding: 2px 6px; border-radius: 4px; font-family: monospace;">V: ${item["Extracted Vendor ID"] || "null"}</span>
            </div>
        `;

        card.addEventListener('click', () => loadQueueItem(item));
        listContainer.appendChild(card);
    });
}

// --- 3. Load Right Panel ---
function loadQueueItem(item) {
    activeQueueItem = item;
    
    // Instantly load the fields mapped by the Sweeper
    document.getElementById('aqJobId').value = item["Extracted Job ID"] || "";
    document.getElementById('aqVendorId').value = item["Extracted Vendor ID"] || "";
    document.getElementById('aqMonth').value = item["WaiverMonth"] || "";
    document.getElementById('aqYear').value = item["WaiverYear"] || "";

    const frame = document.getElementById('aqPdfFrame');
    frame.src = item["File Link"] || "about:blank";

    document.getElementById('aqApproveBtn').disabled = false;
    document.getElementById('aqRejectBtn').disabled = false;
    
    renderQueueList();
}

function clearSelection() {
    activeQueueItem = null;
    document.getElementById('aqJobId').value = "";
    document.getElementById('aqVendorId').value = "";
    document.getElementById('aqMonth').value = "";
    document.getElementById('aqYear').value = "";
    document.getElementById('aqPdfFrame').src = "about:blank";
    document.getElementById('aqApproveBtn').disabled = true;
    document.getElementById('aqRejectBtn').disabled = true;
}

// --- 4. Process Approval ---
async function processApproval() {
    if (!activeQueueItem) return;

    const finalJob = document.getElementById('aqJobId').value.trim();
    const finalVendor = document.getElementById('aqVendorId').value.trim();
    const finalMonth = document.getElementById('aqMonth').value.trim();
    const finalYear = document.getElementById('aqYear').value.trim();

    if (!finalJob || !finalVendor || !finalMonth || !finalYear) {
        return alert("Please ensure all ID and Date fields are filled out.");
    }

    try {
        document.getElementById('aqApproveBtn').textContent = "Processing...";
        document.getElementById('aqApproveBtn').disabled = true;

        const waivers = window.Workspace.appData.waivers;
        const matchingWaiver = waivers.find(w => 
            String(w["Job ID"]).trim() === finalJob &&
            String(w["Vendor ID"]).trim() === finalVendor &&
            parseInt(w["Month"]) === parseInt(finalMonth) &&
            String(w["Year"]).trim() === finalYear
        );

        let masterRecordsToUpdate = [];
        if (matchingWaiver) {
            matchingWaiver["Status"] = "Received";
            matchingWaiver["Received Date"] = new Date().toLocaleDateString();
            matchingWaiver["Notes"] = `Approved via Queue from ${activeQueueItem["Sender Email"]}.\n${matchingWaiver["Notes"] || ""}`;
            masterRecordsToUpdate.push(matchingWaiver);
        } else {
            alert(`Warning: Could not find a pending record in Master Waiver for Job ${finalJob}, Vendor ${finalVendor}. File will still be routed.`);
        }

        await routeFileLocally(activeQueueItem["File Name"], finalJob, finalVendor, finalWaiverMonth, finalWaiverYear, finalType);

        activeQueueItem["Status"] = "Approved";
        activeQueueItem["Extracted Job ID"] = finalJob; 
        activeQueueItem["Extracted Vendor ID"] = finalVendor;
        
        const reviewQueueHandle = await getFileByPath(window.Workspace.dirHandle, window.WORKSPACE_FILE_PATHS.waiverReviewQueue);
        await UpdateExcel(reviewQueueHandle, [activeQueueItem], "Queue ID", "WaiverReviewQueue");
        
        if (masterRecordsToUpdate.length > 0) {
            const masterFileHandle = await getFileByPath(window.Workspace.dirHandle, window.WORKSPACE_FILE_PATHS.waivers);
            await UpdateExcel(masterFileHandle, masterRecordsToUpdate, "Waiver ID", "Waivers");
        }

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

        // 1. Look up Vendor Name and sanitize for OS saving
        let vendorName = vendorId;
        try { vendorName = window.WaiverMath.getEmailInfo(targetJob, vendorId, "Vendor Name") || vendorId; } catch(e) {}
        const cleanVendorName = vendorName.replace(/[^a-zA-Z0-9 -]/g, "").trim();

        // 2. Look up BURG Name from Master Job Info
        const jobInfo = window.Workspace.appData.jobInfo || [];
        const jobData = jobInfo.find(j => String(j["Job ID"]).trim().toLowerCase() === String(targetJob).toLowerCase()) || {};
        let burgName = String(jobData["BURG Name"] || "Unknown Burg").trim().replace(/[^a-zA-Z0-9 -]/g, "");

        // 3. Format Strings
        const formattedWMonth = String(waiverMonth).padStart(2, '0');
        const wYear4 = String(waiverYear);
        const wYear2 = wYear4.slice(-2);

        const folderName = `${formattedWMonth}-${wYear4}`; 
        const newFileName = `${targetJob}-${formattedWMonth}${wYear2}_${cleanVendorName}_${waiverType}_rec.pdf`;

        // 4. Drill down: Waivers -> BURG -> JobID -> MM-YYYY
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

        // 5. Save and delete from Triage
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