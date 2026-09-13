// app.js
import { extractVendorData } from './dataParser.js';
import { stampWaiverWithConfig } from './pdfEngine.js';
import { generateEmlBlob } from './emailEngine.js';

// --- Native Database Setup (No external libraries) ---
const dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open('WaiverIO_DB', 1);
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
// ----------------------------------------------------

let dirHandle;
const output = document.getElementById('output');

async function verifyPermission(fileHandle) {
    if ((await fileHandle.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
    if ((await fileHandle.requestPermission({ mode: 'readwrite' })) === 'granted') return true;
    return false;
}

// UI Toggles
async function setupDirectory(handle) {
    dirHandle = handle;
    
    // Hide the connection card, show the workspace
    document.getElementById('connectionCard').style.display = 'none';
    document.getElementById('processingWorkspace').style.display = 'block';
    
    // Update the Nav bar status
    const navStatus = document.getElementById('navStatus');
    if (navStatus) navStatus.textContent = `✅ Connected: ${dirHandle.name}`;
}

window.addEventListener('DOMContentLoaded', async () => {
    const storedHandle = await get('masterARFolder');
    if (storedHandle && (await storedHandle.queryPermission({ mode: 'readwrite' })) === 'granted') {
        await setupDirectory(storedHandle);
    }
});

document.getElementById('connectFolderBtn').addEventListener('click', async () => {
    try {
        const storedHandle = await get('masterARFolder');
        if (storedHandle && await verifyPermission(storedHandle)) {
            await setupDirectory(storedHandle);
            return;
        }
        const newHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        await set('masterARFolder', newHandle);
        await setupDirectory(newHandle);
    } catch (error) {
        alert(`Connection failed: ${error.message}`);
    }
});

// 2. Waiver Processing Logic
document.getElementById('processWaiverBtn').addEventListener('click', async () => {
    const job = document.getElementById('jobInput').value;
    const vendor = document.getElementById('vendorInput').value;
    
    if (!job || !vendor) return alert("Enter Job and Vendor.");
    
    try {
        output.textContent = "Processing started...\n";

        // A. Extract Data
        const excelFileHandle = await dirHandle.getFileHandle('Invoices.xlsx');
        const excelFile = await excelFileHandle.getFile();
        const vendorData = await extractVendorData(await excelFile.arrayBuffer(), job, vendor);
        output.textContent += `Data extracted for ${vendorData.vendorName}.\n`;

        // B. Load Template & Config
        const templatesDir = await dirHandle.getDirectoryHandle('Templates');
        const pdfFileHandle = await templatesDir.getFileHandle('WaiverTemplate.pdf');
        const configHandle = await templatesDir.getFileHandle('Template_Config.json');
        
        const configJson = JSON.parse(await (await configHandle.getFile()).text());
        const blankPdfBytes = await (await pdfFileHandle.getFile()).arrayBuffer();
        
        // C. Stamp the PDF
        const stampedPdfBytes = await stampWaiverWithConfig(blankPdfBytes, vendorData, configJson);

        // D. Save the PDF
        const pdfName = `${vendor.replace(/[^a-z0-9]/gi, '_')}_Waiver.pdf`;
        const newPdfHandle = await dirHandle.getFileHandle(pdfName, { create: true });
        const pdfWritable = await newPdfHandle.createWritable();
        await pdfWritable.write(stampedPdfBytes);
        await pdfWritable.close();

        // E. Generate & Save the .eml Draft
        const emailConfig = {
            to: "vendor@example.com",
            cc: "altmanb@lithko.com",
            subject: `Waiver Request - ${vendorData.projectName}`,
            bodyHTML: `<span style="font-size: 16px; font-family: sans-serif;">Please process the attached waiver.</span>`
        };
        
        const emlBlob = generateEmlBlob(emailConfig, stampedPdfBytes, pdfName);
        const emlName = `${vendor.replace(/[^a-z0-9]/gi, '_')}_Draft.eml`;
        const emlHandle = await dirHandle.getFileHandle(emlName, { create: true });
        const emlWritable = await emlHandle.createWritable();
        await emlWritable.write(emlBlob);
        await emlWritable.close();

        output.textContent += `Success! Saved ${pdfName} and ${emlName}.`;
    } catch (error) {
        output.textContent += `Error: ${error.message}`;
    }
});
