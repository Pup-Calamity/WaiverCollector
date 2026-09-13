// app.js
import { get, set } from 'https://cdn.jsdelivr.net/npm/idb-keyval@6/+esm';
import { extractVendorData } from './dataParser.js';
import { stampWaiverWithConfig } from './pdfEngine.js';
import { generateEmlBlob } from './emailEngine.js';

let dirHandle;
const output = document.getElementById('output');

// Helper to check if browser remembers the folder and has permission
async function verifyPermission(fileHandle) {
    if ((await fileHandle.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
    if ((await fileHandle.requestPermission({ mode: 'readwrite' })) === 'granted') return true;
    return false;
}

// Helper to initialize the UI once connected
async function setupDirectory(handle) {
    dirHandle = handle;
    output.textContent = `Connected: ${dirHandle.name}`;
    document.getElementById('processWaiverBtn').disabled = false;
}

// 1. Auto-connect attempt on page load
window.addEventListener('DOMContentLoaded', async () => {
    const storedHandle = await get('masterARFolder');
    // If the browser already has permission without asking (rare, but possible), auto-connect silently
    if (storedHandle && (await storedHandle.queryPermission({ mode: 'readwrite' })) === 'granted') {
        await setupDirectory(storedHandle);
    }
});

// 2. Button click connection (Re-verifies or prompts for a new folder)
document.getElementById('connectFolderBtn').addEventListener('click', async () => {
    try {
        const storedHandle = await get('masterARFolder');
        
        // If we have a saved folder, just ask for permission to unlock it!
        if (storedHandle && await verifyPermission(storedHandle)) {
            await setupDirectory(storedHandle);
            return;
        }

        // Fallback: If no saved folder or they clicked deny, open the file picker
        const newHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        await set('masterARFolder', newHandle); // Save it for next time
        await setupDirectory(newHandle);
    } catch (error) {
        output.textContent = `Connection failed: ${error.message}`;
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
