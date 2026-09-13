// mapper.js
import { get, set } from 'https://cdn.jsdelivr.net/npm/idb-keyval@6/+esm';
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

// Default list in case the variables.json file gets deleted
let availableVariables = ["vendorName", "amount", "projectName", "contractDate"]; 

const output = document.getElementById('output');
const templateDropdown = document.getElementById('templateDropdown');
const deleteTemplateBtn = document.getElementById('deleteTemplateBtn');

/* --- Folder Connection & Persistence --- */
async function verifyPermission(fileHandle) {
    if ((await fileHandle.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
    if ((await fileHandle.requestPermission({ mode: 'readwrite' })) === 'granted') return true;
    return false;
}

// Scans the Data folder for variables.json. If it doesn't exist, it builds it.
async function loadVariablesList() {
    try {
        const dataDir = await dirHandle.getDirectoryHandle('Data', { create: true });
        const varFile = await dataDir.getFileHandle('variables.json', { create: true });
        const file = await varFile.getFile();
        const text = await file.text();
        
        if (text.trim() !== '') {
            availableVariables = JSON.parse(text);
        } else {
            const writable = await varFile.createWritable();
            await writable.write(JSON.stringify(availableVariables, null, 2));
            await writable.close();
        }
    } catch (e) {
        console.error("Failed to load variables.json. Using defaults.", e);
    }
}

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
        if (!foundAny) templateDropdown.innerHTML = '<option value="">-- No templates found --</option>';
        else deleteTemplateBtn.disabled = false;
    } catch (err) {
        templateDropdown.innerHTML = '<option value="">-- No templates found --</option>';
    }
}

async function setupDirectory(handle) {
    dirHandle = handle;
    output.textContent = `Connected: ${dirHandle.name}`;
    document.getElementById('loadPdfBtn').disabled = false;
    await refreshTemplateList();
    await loadVariablesList(); // Load the JSON variables list
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
                try { await templatesDir.removeEntry(selectedPdf.replace('.pdf', '_Config.json')); } catch(e){}
                alert(`Deleted ${selectedPdf}.`);
                await refreshTemplateList();
            } catch (error) { alert(`Failed to delete: ${error.message}`); }
        }
    });
}

/* --- PDF Loading (Remains the same) --- */
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
            
            if (!templateMap.fields) templateMap.fields = {};
            if (!templateMap.coverUps) templateMap.coverUps = [];
            output.textContent = `Loaded existing map for ${currentPdfName}.`;
        } catch (err) {
            templateMap = { fields: {}, coverUps: [] };
            output.textContent = `Loaded ${currentPdfName}. No existing map found.`;
        }
        
        redrawCanvas(canvas, offscreenCanvas, pdfViewport, templateMap);
    } catch (error) { alert(`Error loading PDF: ${error.message}`); }
});

/* --- Custom Variable Selection Modal --- */
function openVariableModal() {
    return new Promise((resolve) => {
        const modal = document.getElementById('variableModal');
        const select = document.getElementById('variableSelect');
        const confirmBtn = document.getElementById('confirmVariableBtn');
        const cancelBtn = document.getElementById('cancelVariableBtn');

        // Populate the dropdown with the array loaded from Data/variables.json
        select.innerHTML = availableVariables.map(v => `<option value="${v}">${v}</option>`).join('');
        modal.showModal();

        const onConfirm = () => { cleanup(); resolve(select.value); };
        const onCancel = () => { cleanup(); resolve(null); };
        
        const cleanup = () => {
            confirmBtn.removeEventListener('click', onConfirm);
            cancelBtn.removeEventListener('click', onCancel);
            modal.close();
        };

        confirmBtn.addEventListener('click', onConfirm);
        cancelBtn.addEventListener('click', onCancel);
    });
}

/* --- Canvas Mouse Controls --- */
const canvas = document.getElementById('pdfCanvas');

canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault(); 
    if (!pdfViewport) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const target = getHoveredItem(mouseX, mouseY, pdfViewport, templateMap);
    if (target) {
        const name = target.type === 'variable' ? `'${target.id}'` : 'this whiteout box';
        if (confirm(`Delete ${name}?`)) {
            if (target.type === 'variable') delete templateMap.fields[target.id];
            else templateMap.coverUps.splice(target.id, 1);
            redrawCanvas(canvas, offscreenCanvas, pdfViewport, templateMap);
        }
    }
});

canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || !pdfViewport) return; 
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const currentTool = document.querySelector('input[name="toolMode"]:checked').value;
    dragField = getHoveredItem(mouseX, mouseY, pdfViewport, templateMap);
    
    if (dragField && dragField.type === 'variable') {
        isDragging = true;
        hasMoved = false;
    } else if (currentTool === 'coverup') {
        isDragging = true;
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
        ctx.strokeStyle = '#dc3545';
        ctx.lineWidth = 2;
        ctx.strokeRect(boxX, boxY, boxW, boxH);
    }
});

// Changed to async to support awaiting the new Modal Promise
canvas.addEventListener('mouseup', async (e) => {
    if (e.button !== 0 || !pdfViewport) return;
    const currentTool = document.querySelector('input[name="toolMode"]:checked').value;
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
    else if (!dragField && currentTool === 'variable' && !hasMoved) {
        // Halt code execution, open the modal, and wait for the user to make a choice
        const variableName = await openVariableModal();
        
        if (variableName) {
            const pdfX = mouseX / pdfViewport.scale;
            const pdfY = (pdfViewport.height - mouseY) / pdfViewport.scale;
            templateMap.fields[variableName] = { x: pdfX, y: pdfY, size: 12 };
            redrawCanvas(canvas, offscreenCanvas, pdfViewport, templateMap);
        }
    }
    
    isDragging = false;
    dragField = null;
    hasMoved = false;
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
    } catch (error) { alert(`Save failed: ${error.message}`); }
});
