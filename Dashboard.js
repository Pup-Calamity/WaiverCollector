// dashboard.js
let currentJobWaivers = []; // Tracks the waivers currently visible in the table
// --- 1. Native Database Setup (No external CDNs) ---
const dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open('WaiverIO_DB', 2);
    req.onupgradeneeded = e => e.target.result.createObjectStore('keyval');
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = () => reject(req.error);
});
async function get(key) {
    const db = await dbPromise;
    return new Promise(resolve => {
        const req = db.transaction('keyval').objectStore('keyval').get(key);
        req.onsuccess = () => resolve(req.result);
    });
}
async function set(key, val) {
    const db = await dbPromise;
    return new Promise(resolve => {
        const tx = db.transaction('keyval', 'readwrite');
        tx.objectStore('keyval').put(val, key);
        tx.oncomplete = () => resolve();
    });
}

// --- 2. Global State ---
let dirHandle;
let appData = {
    noteDB: [],
    onbase: [],
    unpaid: [],
    emailInfo: []
};

// --- 3. UI Elements ---
const connectBtn = document.getElementById('connectBtn');
const jobInput = document.getElementById('jobInput');
const tableBody = document.getElementById('waiverTableBody');
const notesPanel = document.getElementById('notesPanel');
const vendorNotesBox = document.getElementById('vendorNotes');
const jobNotesBox = document.getElementById('jobNotes');
const gcNotesBox = document.getElementById('gcNotes');

// --- 4. File System Connection & Data Extraction ---
async function loadDataFromExcel() {
    try {
        const fileHandle = await dirHandle.getFileHandle('Invoices.xlsx'); // Adjust file name if your master data is named differently
        const file = await fileHandle.getFile();
        const arrayBuffer = await file.arrayBuffer();
        
        // Load workbook using SheetJS (Requires XLSX loaded in HTML head)
        const workbook = window.XLSX.read(arrayBuffer, { type: 'array' });
        
        // Extract to JSON using your exact header names
        appData.noteDB = window.XLSX.utils.sheet_to_json(workbook.Sheets['NoteDB'] || {}, { defval: "" });
        appData.onbase = window.XLSX.utils.sheet_to_json(workbook.Sheets['In Onbase'] || {}, { defval: "" });
        appData.unpaid = window.XLSX.utils.sheet_to_json(workbook.Sheets['Unpaid Invoices'] || {}, { defval: "" });
        appData.emailInfo = window.XLSX.utils.sheet_to_json(workbook.Sheets['Email Information'] || {}, { defval: "" });
        
        // Cache data locally for instant reloads
        await set('cachedWaiverData', appData);
        connectBtn.textContent = "✅ Connected & Loaded";
        connectBtn.style.backgroundColor = "#28a745";
        
    } catch (error) {
        alert("Failed to load Excel data: " + error.message);
    }
}

connectBtn.addEventListener('click', async () => {
    try {
        dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        await set('masterARFolder', dirHandle);
        connectBtn.textContent = "Loading Data...";
        await loadDataFromExcel();
    } catch (err) {
        console.error(err);
    }
});

// --- 5. Dynamic Table Population ---
function renderTable(jobId) {
    tableBody.innerHTML = '';
    if (!jobId) return;

    // Filter Note DB by Job ID and update the global state
    currentJobWaivers = appData.noteDB.filter(row => String(row['JOB_ID']) === String(jobId));

    if (currentJobWaivers.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No vendors found for this Job ID.</td></tr>';
        return;
    }

    currentJobWaivers.forEach(waiver => {
        const tr = document.createElement('tr');
        
        let statusHtml = '';
        if (waiver['Date Received']) {
            statusHtml = '<span class="pill received">Received</span>';
        } else if (waiver['Date Sent']) {
            statusHtml = '<span class="pill sent">Sent</span>';
        } else {
            statusHtml = '<span class="pill action">Action Needed</span>';
        }

        const formatMoney = (amt) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(amt) || 0);

        tr.innerHTML = `
            <td><strong>${waiver['VEN_NAM'] || 'Unknown Vendor'}</strong><br><small>${waiver['VEN_ID']}</small></td>
            <td>${waiver['WAIVER_'] || 'Not Set'}</td>
            <td>${statusHtml}</td>
            <td style="color: #0056b3;">${formatMoney(waiver['In Onbase'])}</td>
            <td style="color: #dc3545;">${formatMoney(waiver['Unpaid'])}</td>
            <td><strong>${waiver['Days to A'] || '0'}</strong></td>
        `;

        tr.addEventListener('click', () => openNotesPanel(waiver));
        tableBody.appendChild(tr);
    });
}

// Debounced search trigger
let searchTimeout;
jobInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const jobId = e.target.value.trim();
    
    searchTimeout = setTimeout(() => {
        if (jobId.length >= 4) { 
            renderTable(jobId);
        } else {
            tableBody.innerHTML = '';
        }
    }, 500); 
});

// Trigger search when typing
jobInput.addEventListener('input', (e) => {
    const jobId = e.target.value.trim();
    if (jobId.length >= 4) { // Only search if they've typed at least 4 numbers
        renderTable(jobId);
    } else {
        tableBody.innerHTML = '';
    }
});

// --- 6. Slide-Out Notes Panel ---
function openNotesPanel(waiverData) {
    // Populate panel headers
    document.querySelector('.notes-panel h3').textContent = `Context: ${waiverData['VEN_NAM']}`;
    
    // Extract notes based on your column structures
    vendorNotesBox.value = waiverData['Notes'] || ''; // Vendor Notes
    jobNotesBox.value = waiverData['Simple Note'] || ''; // Simple Note / Job Note
    gcNotesBox.value = waiverData['CUS_NAM'] || ''; // GC Info

    // Slide it open
    notesPanel.classList.add('open');
}

// Auto-Load on startup
window.addEventListener('DOMContentLoaded', async () => {
    const cachedData = await get('cachedWaiverData');
    if (cachedData) {
        appData = cachedData;
        connectBtn.textContent = "✅ Loaded from Cache";
        connectBtn.style.backgroundColor = "#28a745";
    }
});

// --- 7. Pre-Flight Validation Engine ---
const runBatchBtn = document.getElementById('runBatchBtn');
const preflightModal = document.getElementById('preflightModal');
const preflightTableBody = document.getElementById('preflightTableBody');
const preflightErrors = document.getElementById('preflightErrors');
const confirmGenerateBtn = document.getElementById('confirmGenerateBtn');

runBatchBtn.addEventListener('click', () => {
    if (currentJobWaivers.length === 0) {
        alert("No waivers to process. Please select a job first.");
        return;
    }

    preflightTableBody.innerHTML = '';
    let hasHardErrors = false;
    let errorMessages = [];

    currentJobWaivers.forEach((waiver, index) => {
        const tr = document.createElement('tr');
        const jobId = String(waiver['JOB_ID']);
        const vendorId = String(waiver['VEN_ID']);
        
        // 1. Validate Email Setup (Checks 'Email Information' array)
        const emailSetup = appData.emailInfo.find(e => String(e['Job ID']) === jobId && String(e['Vendor ID']) === vendorId);
        const hasEmail = !!emailSetup;
        
        // 2. Validate Template
        const hasTemplate = !!waiver['WAIVER_'] && waiver['WAIVER_'] !== "Not Set";
        
        // 3. Calculate Base Amount
        const onbaseAmt = Number(waiver['In Onbase']) || 0;
        const unpaidAmt = Number(waiver['Unpaid']) || 0;
        const totalAmt = onbaseAmt + unpaidAmt;
        const hasAmount = totalAmt > 0;

        // Determine Status
        let statusIcon = '✅';
        let issues = [];
        
        if (!hasEmail) issues.push("Missing Email Setup");
        if (!hasTemplate) issues.push("Missing Template");
        if (!hasAmount) issues.push("$0.00 Balance");

        if (issues.length > 0) {
            statusIcon = '❌';
            if (!hasEmail || !hasTemplate) {
                hasHardErrors = true;
                errorMessages.push(`<strong>${waiver['VEN_NAM']}:</strong> ${issues.join(', ')}`);
            }
        }

        tr.innerHTML = `
            <td style="text-align: center;">${statusIcon}</td>
            <td><strong>${waiver['VEN_NAM'] || 'Unknown'}</strong></td>
            <td style="${!hasEmail ? 'color: red; font-weight: bold;' : ''}">${hasEmail ? 'Valid' : 'Missing'}</td>
            <td style="${!hasTemplate ? 'color: red; font-weight: bold;' : ''}">${hasTemplate ? 'Valid' : 'Missing'}</td>
            <td>
                $ <input type="number" step="0.01" value="${totalAmt.toFixed(2)}" 
                       data-vendor="${vendorId}" class="manual-amt-override" 
                       style="padding: 4px; width: 100px; ${!hasAmount ? 'border: 2px solid red;' : 'border: 1px solid #ccc;'}">
            </td>
        `;
        preflightTableBody.appendChild(tr);
    });

    // Handle Error Banner
    if (hasHardErrors) {
        preflightErrors.style.display = 'block';
        preflightErrors.innerHTML = `<strong>⚠️ Hard Stops Found:</strong><br>${errorMessages.join('<br>')}<br><br><small>You cannot generate this batch until email mappings and templates are resolved in the source data. Zero-dollar balances can be overridden below.</small>`;
        confirmGenerateBtn.disabled = true;
        confirmGenerateBtn.style.background = '#ccc';
    } else {
        preflightErrors.style.display = 'none';
        confirmGenerateBtn.disabled = false;
        confirmGenerateBtn.style.background = '#28a745';
    }

    preflightModal.showModal();
});

// Execute Batch
confirmGenerateBtn.addEventListener('click', async () => {
    const overrides = document.querySelectorAll('.manual-amt-override');
    const finalBatchData = [];
    
    overrides.forEach((input) => {
        const vendorId = input.getAttribute('data-vendor');
        const overriddenAmt = parseFloat(input.value);
        finalBatchData.push({ vendorId: vendorId, finalAmount: overriddenAmt });
    });

    // Transform UI to show processing state
    confirmGenerateBtn.disabled = true;
    confirmGenerateBtn.textContent = "Processing Batch...";
    preflightTableBody.style.opacity = "0.5";

    try {
        const templatesDir = await dirHandle.getDirectoryHandle('Templates');

        for (const item of finalBatchData) {
            // Locate the full data row for this vendor
            const waiverData = currentJobWaivers.find(w => String(w['VEN_ID']) === item.vendorId);
            
            // Clean up the template name from the Excel data
            let templateName = waiverData['WAIVER_'];
            if (templateName.includes(';')) templateName = templateName.split(';')[0]; // Grabs the first template if multiple exist
            templateName = templateName.trim() + ".pdf";

            // 1. Fetch the raw PDF and its corresponding JSON mapping config
            const pdfHandle = await templatesDir.getFileHandle(templateName);
            const pdfFile = await pdfHandle.getFile();
            const pdfBytes = await pdfFile.arrayBuffer();

            const configHandle = await templatesDir.getFileHandle(templateName.replace('.pdf', '_Config.json'));
            const configFile = await configHandle.getFile();
            const configJson = JSON.parse(await configFile.text());

            // 2. Initialize pdf-lib
            const pdfDoc = await window.PDFLib.PDFDocument.load(pdfBytes);
            const firstPage = pdfDoc.getPages()[0];

            // 3. Draw Cover-Ups (White Rectangles) to hide old template text
            if (configJson.coverUps) {
                configJson.coverUps.forEach(box => {
                    firstPage.drawRectangle({
                        x: box.x,
                        y: box.y,
                        width: box.width,
                        height: box.height,
                        color: window.PDFLib.rgb(1, 1, 1)
                    });
                });
            }

            // 4. Build a clean dictionary of data to stamp
            const stampData = {
                "amount": item.finalAmount.toFixed(2),
                "vendorName": waiverData['VEN_NAM'],
                "vendorId": waiverData['VEN_ID'],
                "projectName": waiverData['JOB_NAM'],
                "jobId": waiverData['JOB_ID']
            };

            // 5. Stamp the mapped variables onto the PDF
            if (configJson.fields) {
                for (const [variableName, coords] of Object.entries(configJson.fields)) {
                    if (stampData[variableName] !== undefined) {
                        firstPage.drawText(String(stampData[variableName]), {
                            x: coords.x,
                            y: coords.y,
                            size: coords.size || 12,
                            color: window.PDFLib.rgb(0, 0, 0)
                        });
                    }
                }
            }

            // 6. Save the newly stamped PDF back to the local file system
            const savedPdf = await pdfDoc.save();
            
            // Create a subfolder for the Job ID if it doesn't exist yet
            const jobFolder = await dirHandle.getDirectoryHandle(waiverData['JOB_ID'], { create: true });
            
            // Format the final file name (e.g., "21587 - Anderson Concrete - req.pdf")
            const safeVendorName = waiverData['VEN_NAM'].replace(/[\\/:\*\?"<>\|]/g, '');
            const finalFileName = `${waiverData['JOB_ID']} - ${safeVendorName} - req.pdf`;
            
            const finalFileHandle = await jobFolder.getFileHandle(finalFileName, { create: true });
            const writable = await finalFileHandle.createWritable();
            await writable.write(savedPdf);
            await writable.close();
        }

        alert(`Successfully generated and saved ${finalBatchData.length} waivers!`);
        preflightModal.close();

    } catch (error) {
        alert("Batch processing failed: " + error.message);
        console.error(error);
    } finally {
        // Reset UI
        confirmGenerateBtn.disabled = false;
        confirmGenerateBtn.textContent = "Confirm & Generate Batch";
        preflightTableBody.style.opacity = "1";
    }
});
