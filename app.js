import { configurePdfJs, handleCanvasClick } from './templateEditor.js';
import { extractVendorData } from './dataParser.js';
import { stampWaiverWithConfig } from './pdfEngine.js';
import { generateEmlBlob } from './emailEngine.js';

let dirHandle;
const pdfjsLib = configurePdfJs();
let pdfViewport = null;
let templateMap = { fields: {} };
const output = document.getElementById('output');

// 1. Connect Folder
document.getElementById('connectFolderBtn').addEventListener('click', async () => {
    try {
        dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        output.textContent = `Connected: ${dirHandle.name}`;
        
        document.getElementById('loadPdfBtn').disabled = false;
        document.getElementById('processWaiverBtn').disabled = false;
    } catch (error) {
        output.textContent = `Connection failed: ${error.message}`;
    }
});

// 2. Visual Mapper Logic
document.getElementById('loadPdfBtn').addEventListener('click', async () => {
    try {
        const [fileHandle] = await window.showOpenFilePicker({ types: [{ accept: { 'application/pdf': ['.pdf'] } }] });
        const file = await fileHandle.getFile();
        const arrayBuffer = await file.arrayBuffer();

        const pdfDoc = await pdfjsLib.getDocument(arrayBuffer).promise;
        const page = await pdfDoc.getPage(1);
        
        pdfViewport = page.getViewport({ scale: 1.5 });
        const canvas = document.getElementById('pdfCanvas');
        const ctx = canvas.getContext('2d');
        canvas.width = pdfViewport.width;
        canvas.height = pdfViewport.height;

        await page.render({ canvasContext: ctx, viewport: pdfViewport }).promise;
        document.getElementById('saveMapBtn').disabled = false;
    } catch (error) {
        alert(`Error loading PDF: ${error.message}`);
    }
});

document.getElementById('pdfCanvas').addEventListener('click', (e) => {
    handleCanvasClick(e, pdfViewport, templateMap);
});

document.getElementById('saveMapBtn').addEventListener('click', async () => {
    try {
        const templatesDir = await dirHandle.getDirectoryHandle('Templates', { create: true });
        const fileHandle = await templatesDir.getFileHandle('Template_Config.json', { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(templateMap, null, 2));
        await writable.close();
        alert('Configuration saved!');
    } catch (error) {
        alert(`Save failed: ${error.message}`);
    }
});

// 3. Waiver Processing Logic
document.getElementById('processWaiverBtn').addEventListener('click', async () => {
    const job = document.getElementById('jobInput').value;
    const vendor = document.getElementById('vendorInput').value;
    
    if (!job || !vendor) return alert("Enter Job and Vendor.");
    
    try {
        output.textContent = "Processing started...\n";

        // Extract Data
        const excelFileHandle = await dirHandle.getFileHandle('Invoices.xlsx');
        const excelFile = await excelFileHandle.getFile();
        const vendorData = await extractVendorData(await excelFile.arrayBuffer(), job, vendor);
        output.textContent += `Data extracted for ${vendorData.vendorName}.\n`;

        // Load Template & Config
        const templatesDir = await dirHandle.getDirectoryHandle('Templates');
        const pdfFileHandle = await templatesDir.getFileHandle('WaiverTemplate.pdf');
        const configHandle = await templatesDir.getFileHandle('Template_Config.json');
        
        const configJson = JSON.parse(await (await configHandle.getFile()).text());
        const stampedPdfBytes = await stampWaiverWithConfig(await (await pdfFileHandle.getFile()).arrayBuffer(), vendorData, configJson);

        // Save PDF
        const pdfName = `${vendor.replace(/[^a-z0-9]/gi, '_')}_Waiver.pdf`;
        const newPdfHandle = await dirHandle.getFileHandle(pdfName, { create: true });
        const pdfWritable = await newPdfHandle.createWritable();
        await pdfWritable.write(stampedPdfBytes);
        await pdfWritable.close();

        // Generate & Save .eml
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
