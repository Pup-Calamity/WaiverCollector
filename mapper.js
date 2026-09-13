import { getPdfJsLib, redrawCanvas, getHoveredField } from './templateEditor.js';

let dirHandle;
let pdfViewport = null;
let templateMap = { fields: {} };
let currentPdfName = "Template"; 
let offscreenCanvas = null; // Holds the clean PDF image

// State tracking for dragging and undo
let isDragging = false;
let dragField = null;
let hasMoved = false;
let history = []; 
const output = document.getElementById('output');

// Helper to save state before a change
function saveState() {
    history.push(JSON.stringify(templateMap.fields));
    document.getElementById('undoBtn').disabled = false;
}

// Helper to handle coordinate conversion
function updateFieldPosition(e, canvas, fieldName) {
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const pdfX = clickX / pdfViewport.scale;
    const pdfY = (pdfViewport.height - clickY) / pdfViewport.scale;
    templateMap.fields[fieldName].x = pdfX;
    templateMap.fields[fieldName].y = pdfY;
}

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
        currentPdfName = file.name;
        
        const arrayBuffer = await file.arrayBuffer();
        const pdfDoc = await pdfjsLib.getDocument(arrayBuffer).promise;
        const page = await pdfDoc.getPage(1);
        
        pdfViewport = page.getViewport({ scale: 1.5 });
        const canvas = document.getElementById('pdfCanvas');
        const ctx = canvas.getContext('2d');
        canvas.width = pdfViewport.width;
        canvas.height = pdfViewport.height;

        await page.render({ canvasContext: ctx, viewport: pdfViewport }).promise;
        
        // Take a snapshot of the clean PDF in an invisible canvas
        offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = canvas.width;
        offscreenCanvas.height = canvas.height;
        offscreenCanvas.getContext('2d').drawImage(canvas, 0, 0);

        document.getElementById('saveMapBtn').disabled = false;

        // Try to load existing JSON
        try {
            const templatesDir = await dirHandle.getDirectoryHandle('Templates');
            const configName = currentPdfName.replace('.pdf', '_Config.json');
            const configFile = await (await templatesDir.getFileHandle(configName)).getFile();
            templateMap = JSON.parse(await configFile.text());
            output.textContent = `Loaded existing map for ${currentPdfName}.`;
        } catch (err) {
            templateMap = { fields: {} };
            output.textContent = `Loaded ${currentPdfName}. No existing map found.`;
        }
        
        redrawCanvas(canvas, offscreenCanvas, pdfViewport, templateMap);
    } catch (error) {
        alert(`Error loading PDF: ${error.message}`);
    }
});

/* --- NEW: Interactive Mouse Controls --- */
const canvas = document.getElementById('pdfCanvas');

canvas.addEventListener('mousedown', (e) => {
    if (!pdfViewport) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    dragField = getHoveredField(mouseX, mouseY, pdfViewport, templateMap);
    
    if (dragField) {
        // We clicked an existing marker. Prepare to move it.
        isDragging = true;
        hasMoved = false;
    }
});

canvas.addEventListener('mousemove', (e) => {
    if (isDragging && dragField) {
        if (!hasMoved) saveState(); // Save state only on the first pixel of movement
        hasMoved = true;
        updateFieldPosition(e, canvas, dragField);
        redrawCanvas(canvas, offscreenCanvas, pdfViewport, templateMap);
    }
});

canvas.addEventListener('mouseup', (e) => {
    if (!pdfViewport) return;

    if (isDragging && dragField) {
        // If we clicked it but didn't drag it, that means we want to DELETE it.
        if (!hasMoved) {
            if (confirm(`Delete the variable '${dragField}'?`)) {
                saveState();
                delete templateMap.fields[dragField];
                redrawCanvas(canvas, offscreenCanvas, pdfViewport, templateMap);
            }
        }
        isDragging = false;
        dragField = null;
    } else {
        // If we clicked empty space, ADD a new variable
        const variableName = prompt("Enter exact variable name (e.g., vendorName, amount):");
        if (variableName) {
            saveState();
            templateMap.fields[variableName] = { x: 0, y: 0, size: 12 };
            updateFieldPosition(e, canvas, variableName);
            redrawCanvas(canvas, offscreenCanvas, pdfViewport, templateMap);
        }
    }
});

/* --- NEW: Undo Button --- */
document.getElementById('undoBtn').addEventListener('click', () => {
    if (history.length > 0) {
        const previousState = history.pop();
        templateMap.fields = JSON.parse(previousState);
        redrawCanvas(canvas, offscreenCanvas, pdfViewport, templateMap);
        
        if (history.length === 0) {
            document.getElementById('undoBtn').disabled = true;
        }
    }
});

document.getElementById('saveMapBtn').addEventListener('click', async () => {
    try {
        const templatesDir = await dirHandle.getDirectoryHandle('Templates', { create: true });
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
