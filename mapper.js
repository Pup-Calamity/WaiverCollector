// mapper.js
import { getPdfJsLib, handleCanvasClick, loadExistingMap } from './templateEditor.js';

let dirHandle;
let pdfViewport = null;
let templateMap = { fields: {} };
let currentPdfName = "Template"; // Track the name of the loaded PDF
const output = document.getElementById('output');

document.getElementById('connectFolderBtn').addEventListener('click', async () => {
    try {
        dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        output.textContent = `Connected: ${dirHandle.name}`;
        document.getElementById('loadPdfBtn').disabled = false;
    } catch (error) {
        output.textContent = `Connection failed: ${error.message}`;
    }
});

document.getElementById('loadPdfBtn').addEventListener('click', async () => {
    try {
        const pdfjsLib = getPdfJsLib();

        const [fileHandle] = await window.showOpenFilePicker({ types: [{ accept: { 'application/pdf': ['.pdf'] } }] });
        const file = await fileHandle.getFile();
        currentPdfName = file.name; // Save the name for the JSON file
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

        // --- NEW: Attempt to load an existing JSON config ---
        try {
            const templatesDir = await dirHandle.getDirectoryHandle('Templates');
            const configName = currentPdfName.replace('.pdf', '_Config.json');
            const configHandle = await templatesDir.getFileHandle(configName);
            const configFile = await configHandle.getFile();
            
            templateMap = JSON.parse(await configFile.text());
            loadExistingMap(canvas, pdfViewport, templateMap);
            
            output.textContent = `Loaded ${currentPdfName} and existing JSON map! Click canvas to add/edit.`;
        } catch (err) {
            // If the file doesn't exist, start fresh
            templateMap = { fields: {} };
            output.textContent = `Loaded ${currentPdfName}. No existing map found. Click canvas to map variables.`;
        }
        
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
        
        // Dynamically name the JSON file to match the PDF
        const configName = currentPdfName.replace('.pdf', '_Config.json');
        const fileHandle = await templatesDir.getFileHandle(configName, { create: true });
        const writable = await fileHandle.createWritable();
        
        await writable.write(JSON.stringify(templateMap, null, 2));
        await writable.close();
        alert(`Configuration saved as ${configName}!`);
    } catch (error) {
        alert(`Save failed: ${error.message}`);
    }
});
