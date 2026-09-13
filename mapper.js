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
            
            // CRITICAL FIX: Ensure the arrays exist even on older saved files
            if (!templateMap.fields) templateMap.fields = {};
            if (!templateMap.coverUps) templateMap.coverUps = [];
            
            output.textContent = `Loaded existing map for ${currentPdfName}.`;
        } catch (err) {
            // CRITICAL FIX: Initialize both arrays on a fresh template
            templateMap = { fields: {}, coverUps: [] };
            output.textContent = `Loaded ${currentPdfName}. No existing map found.`;
        }
        
        redrawCanvas(canvas, offscreenCanvas, pdfViewport, templateMap);
    } catch (error) {
        alert(`Error loading PDF: ${error.message}`);
    }
});

/* --- NEW: Interactive Mouse Controls --- */
const canvas = document.getElementById('pdfCanvas');

if (!templateMap.fields) templateMap.fields = {};
if (!templateMap.coverUps) templateMap.coverUps = [];

let drawStartX = 0;
let drawStartY = 0;

canvas.addEventListener('mousedown', (e) => {
    if (!pdfViewport) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const currentTool = document.querySelector('input[name="toolMode"]:checked').value;
    
    // First, check if we clicked an existing item
    dragField = getHoveredItem(mouseX, mouseY, pdfViewport, templateMap);
    
    if (dragField) {
        isDragging = true;
        hasMoved = false;
    } else if (currentTool === 'coverup') {
        // If clicking empty space in coverup mode, start drawing a rectangle
        isDragging = true;
        hasMoved = true; // Force true so it doesn't trigger delete
        dragField = { type: 'drawing_coverup' };
        drawStartX = mouseX;
        drawStartY = mouseY;
    }
});

canvas.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (dragField && dragField.type === 'variable') {
        hasMoved = true;
        const pdfX = mouseX / pdfViewport.scale;
        const pdfY = (pdfViewport.height - mouseY) / pdfViewport.scale;
        templateMap.fields[dragField.id].x = pdfX;
        templateMap.fields[dragField.id].y = pdfY;
        redrawCanvas(canvas, offscreenCanvas, pdfViewport, templateMap);
    } 
    else if (dragField && dragField.type === 'drawing_coverup') {
        // Redraw base PDF to clear previous frame of the animation
        redrawCanvas(canvas, offscreenCanvas, pdfViewport, templateMap);
        
        // Math to support dragging in any direction
        const boxX = Math.min(drawStartX, mouseX);
        const boxY = Math.min(drawStartY, mouseY);
        const boxW = Math.abs(mouseX - drawStartX);
        const boxH = Math.abs(mouseY - drawStartY);

        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'; // Semi-transparent white while dragging
        ctx.fillRect(boxX, boxY, boxW, boxH);
        ctx.strokeStyle = 'red';
        ctx.strokeRect(boxX, boxY, boxW, boxH);
    }
});

canvas.addEventListener('mouseup', (e) => {
    if (!pdfViewport) return;
    const currentTool = document.querySelector('input[name="toolMode"]:checked').value;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (dragField && dragField.type === 'drawing_coverup') {
        // Calculate final dimensions regardless of drag direction
        const pixelW = Math.abs(mouseX - drawStartX);
        const pixelH = Math.abs(mouseY - drawStartY);
        
        if (pixelW > 5 && pixelH > 5) { // Prevent tiny accidental clicks
            const pdfW = pixelW / pdfViewport.scale;
            const pdfH = pixelH / pdfViewport.scale;
            
            // X is the leftmost point
            const pdfX = Math.min(drawStartX, mouseX) / pdfViewport.scale;
            
            // Y in pdf-lib is from the bottom of the page to the bottom of the rectangle
            const bottomPixelY = Math.max(drawStartY, mouseY); 
            const pdfY = (pdfViewport.height - bottomPixelY) / pdfViewport.scale;

            // Push to the array we guaranteed exists in the load step
            templateMap.coverUps.push({ x: pdfX, y: pdfY, width: pdfW, height: pdfH });
        }
        // Force a redraw so it locks in the solid white box with red border
        redrawCanvas(canvas, offscreenCanvas, pdfViewport, templateMap);
    } 
    else if (dragField && !hasMoved) {
        const confirmMsg = dragField.type === 'variable' 
            ? `Delete variable '${dragField.id}'?` 
            : `Delete this cover-up box?`;
            
        if (confirm(confirmMsg)) {
            if (dragField.type === 'variable') {
                delete templateMap.fields[dragField.id];
            } else if (dragField.type === 'coverup') {
                templateMap.coverUps.splice(dragField.id, 1);
            }
            redrawCanvas(canvas, offscreenCanvas, pdfViewport, templateMap);
        }
    } 
    else if (!dragField && currentTool === 'variable') {
        const variableName = prompt("Enter exact variable name:");
        if (variableName) {
            const pdfX = mouseX / pdfViewport.scale;
            const pdfY = (pdfViewport.height - mouseY) / pdfViewport.scale;
            templateMap.fields[variableName] = { x: pdfX, y: pdfY, size: 12 };
            redrawCanvas(canvas, offscreenCanvas, pdfViewport, templateMap);
        }
    }
    
    isDragging = false;
    dragField = null;
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
