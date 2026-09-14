// dashboard.js

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

    const relevantWaivers = appData.noteDB.filter(row => String(row['JOB_ID']) === String(jobId));

    if (relevantWaivers.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No vendors found for this Job ID.</td></tr>';
        return;
    }

    relevantWaivers.forEach(waiver => {
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
