// mapper.js
import { getPdfJsLib, redrawCanvas, getHoveredItem } from './templateEditor.js';

let dirHandle;
let pdfViewport = null;
let templateMap = { fields: {}, coverUps: [] };
let currentPdfName = "Template"; 
let offscreenCanvas = null; 

let isDragging = false;
let dragField = null;
let hasMoved = false;
let drawStartX = 0;
let drawStartY = 0;

const output = document.getElementById('output');
const templateDropdown = document.getElementById('templateDropdown');
const deleteTemplateBtn = document.getElementById('deleteTemplateBtn');

/* --- Folder Connection & Dropdown --- */
async function refreshTemplateList() {
    if (!templateDropdown) return;
    templateDropdown.innerHTML = '<option value="">-- Select a template --</option>';
    deleteTemplateBtn.disabled = true;

    try {
        const templatesDir = await dirHandle.getDirectoryHandle('Templates');
        let foundAny = false;

        for await (const entry of templatesDir.values()) {
            if (entry.kind === 'file' && entry.name.endsWith('.pdf')) {
                foundAny = true;
                const option = document.createElement('option');
                option.value = entry.name;
                option.textContent = entry.name;
                templateDropdown.appendChild(option);
            }
        }

        if (!foundAny) {
            templateDropdown.innerHTML = '<option value="">-- No templates found --</option>';
        } else {
            deleteTemplateBtn.disabled = false;
        }
    } catch (err) {
        templateDropdown.innerHTML = '<option value="">-- No templates found --</option>';
    }
}

document.getElementById('connectFolderBtn').addEventListener('click', async () => {
    try {
        dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        output.textContent = `Connected: ${dirHandle.name}`;
        document.getElementById('loadPdfBtn').disabled = false;
        await refreshTemplateList();
    } catch (error) {
        output.textContent = `Connection failed: ${error.message}`;
    }
});

if (deleteTemplateBtn) {
    deleteTemplateBtn.addEventListener('click', async () => {
        const selectedPdf = templateDropdown.value;
        if (!selectedPdf) return;

        if (confirm(`Delete ${selectedPdf} and its mapping configuration?`)) {
            try {
                const templatesDir = await dirHandle.getDirectoryHandle('Templates');
                await templatesDir.removeEntry(selectedPdf);
                try {
                    await templatesDir.removeEntry(selectedPdf.replace('.pdf', '_Config.json'));
                } catch (e) { console.log("No matching JSON found."); }

                alert(`Deleted ${selectedPdf}.`);
                await refreshTemplateList();
            } catch (error) {
                alert(`Failed to delete: ${error.message}`);
            }
        }
    });
}

/* --- PDF Loading & Rendering --- */
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
        
        offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = canvas.width;
        offscreenCanvas.height = canvas.height;
        offscreenCanvas.getContext('2d').drawImage(canvas, 0, 0);

        document.getElementById('saveMapBtn').disabled = false;

        try {
            const templatesDir = await dirHandle.getDirectoryHandle('Templates');
            const configName = currentPdfName.replace('.pdf', '_Config.json');
            const configFile = await (await templatesDir.getFileHandle(configName)).getFile();
            templateMap = JSON.parse(await configFile.text());
            
            // Ensure arrays exist
            if (!templateMap.fields) templateMap.fields = {};
            if (!templateMap.coverUps) templateMap.coverUps = [];
            
            output.textContent = `Loaded existing map for ${currentPdfName}.`;
        } catch (err) {
            templateMap = { fields: {}, coverUps: [] };
            output.textContent = `Loaded ${currentPdfName}. No existing map found.`;
        }
        
        redrawCanvas(canvas, offscreenCanvas, pdfViewport, templateMap);
    } catch (error) {
        alert(`Error loading PDF: ${error.message}`);
    }
});

/* --- Canvas Interaction Logic --- */
const canvas = document.getElementById('pdfCanvas');

canvas.addEventListener('mousedown', (e) => {
    if (!pdfViewport) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const toolInputs = document.querySelectorAll('input[name="toolMode"]');
    let currentTool = 'variable';
    if (toolInputs.length > 0) {
        currentTool = document.querySelector('input[name="toolMode"]:checked').value;
    }
    
    dragField = getHoveredItem(mouseX, mouseY, pdfViewport, templateMap);
    
    if (dragField) {
        isDragging = true;
        hasMoved = false;
    } else if (currentTool === 'coverup') {
        isDragging = true;
        hasMoved = true; 
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
        redrawCanvas(canvas, offscreenCanvas, pdfViewport, templateMap);
        
        const boxX = Math.min(drawStartX, mouseX);
        const boxY = Math.min(drawStartY, mouseY);
        const boxW = Math.abs(mouseX - drawStartX);
        const boxH = Math.abs(mouseY - drawStartY);

        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.fillRect(boxX, boxY, boxW, boxH);
        ctx.strokeStyle = 'red';
        ctx.strokeRect(boxX, boxY, boxW, boxH);
    }
});

canvas.addEventListener('mouseup', (e) => {
    if (!pdfViewport) return;
    
    const toolInputs = document.querySelectorAll('input[name="toolMode"]');
    let currentTool = 'variable';
    if (toolInputs.length > 0) {
        currentTool = document.querySelector('input[name="toolMode"]:checked').value;
    }

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (dragField && dragField.type === 'drawing_coverup') {
        const pixelW = Math.abs(mouseX - drawStartX);
        const pixelH = Math.abs(mouseY - drawStartY);
        
        if (pixelW > 5 && pixelH > 5) { 
            const pdfW = pixelW / pdfViewport.scale;
            const pdfH = pixelH / pdfViewport.scale;
            const pdfX = Math.min(drawStartX, mouseX) / pdfViewport.scale;
            const bottomPixelY = Math.max(drawStartY, mouseY); 
            const pdfY = (pdfViewport.height - bottomPixelY) / pdfViewport.scale;

            templateMap.coverUps.push({ x: pdfX, y: pdfY, width: pdfW, height: pdfH });
        }
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
