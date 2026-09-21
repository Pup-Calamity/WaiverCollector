// js/tools/mapperTool.js

const availableVariables = [
    // Entities
    { id: "subcontractor", label: "Vendor Name" },
    { id: "subcontractorAddress", label: "Vendor Address" },
    { id: "OUName", label: "Vendor's Contractor Name" },
    { id: "owner", label: "Project Owner" },
    { id: "GCName", label: "General Contractor Name" },
    
    // Project Info
    { id: "project", label: "Job Name" },
    { id: "projNum", label: "Job ID Number" },
    { id: "projectAddress", label: "Full Project Address (City, State, Zip)" },
    { id: "addressOnly", label: "Street Address Only" },
    { id: "city", label: "Project City" },
    { id: "state", label: "Project State" },
    { id: "zip", label: "Project Zip" },
    { id: "county", label: "Project County" },
    { id: "SubcontractScope", label: "Scope of Work" },
    { id: "vendorContract", label: "Vendor Contract Date" },
    { id: "ContractDate", label: "Date of Contract" },
    { id: "GCNumber", label: "GC Contract Number" },

    // Amounts
    { id: "amount", label: "Current Payment Amount ($)" },
    { id: "amountWords", label: "Current Payment (Spelled Out)" },
    { id: "previousperiod", label: "Previous Period Amount ($)" },
    { id: "previousperiodWords", label: "Previous Period (Spelled Out)" },
    { id: "ContractPaid", label: "Total Paid Before This Waiver ($)" },
    { id: "conPaidWords", label: "Total Paid Before This (Spelled Out)" },
    { id: "Cumulative", label: "Cumulative Paid Including This Waiver ($)" },
    { id: "CumulativeWords", label: "Cumulative Paid (Spelled Out)" },
    { id: "paidAmount", label: "Cleared Paid Amount ($)" },
    { id: "unpaidAmount", label: "Pending Unpaid Amount ($)" },
    { id: "contractAmount", label: "Base Contract Amount ($)" },
    { id: "remainingBalance", label: "Remaining Balance on Contract ($)" },

    // Dates
    { id: "startdate", label: "Period Start Date" },
    { id: "throughDate", label: "Period Through Date" },
    { id: "paidThruDate", label: "Paid Through Date (Day before start)" },
    { id: "dueDate", label: "Waiver Due Date" },
    { id: "day", label: "Through Date - Day Only" },
    { id: "month", label: "Through Date - Month Name Only" },
    { id: "year", label: "Through Date - Year Only" },
    
    // Lists & Misc
    { id: "invoices", label: "Current Period Invoices List" },
    { id: "PrevInvoices", label: "Previous Period Invoices List" },
    { id: "exceptions", label: "Contract Exceptions" },
    { id: "barcode", label: "Barcode String" }
];


import { getPdfJsLib, redrawCanvas, getHoveredItem } from './templateEditor.js';

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

// --- Initialization & UI Routing ---
window.addEventListener('DOMContentLoaded', () => {
    
    // We can launch this tool from anywhere you want to add a button in the future.
    // Assuming you add an id="launchMapperBtn" somewhere in your Hub view:
    const launchBtn = document.getElementById('launchMapperBtn');
    if (launchBtn) {
        launchBtn.addEventListener('click', async () => {
            if (!window.Workspace || !window.Workspace.dirHandle) {
                alert("Please connect a Master AR Folder first.");
                return;
            }
            
            switchView('templateMapperView');
            await refreshTemplateList();
            await loadVariablesList();
        });
    }

    const backBtn = document.getElementById('backToHubFromMapperBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            switchView('processingWorkspace');
        });
    }
});

// --- Folder Management & Loading ---
async function loadVariablesList() {
    if (!window.Workspace.dirHandle) return;
    
    try {
        const dataDir = await window.Workspace.dirHandle.getDirectoryHandle('Data', { create: true });
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
    if (!templateDropdown || !window.Workspace.dirHandle) return;
    templateDropdown.innerHTML = '<option value="">-- Load a PDF to map --</option>';
    if (deleteTemplateBtn) deleteTemplateBtn.disabled = true;

    try {
        const templatesDir = await window.Workspace.dirHandle.getDirectoryHandle('Templates', { create: true });
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
        } else if (deleteTemplateBtn) {
            deleteTemplateBtn.disabled = false;
        }
    } catch (err) {
        templateDropdown.innerHTML = '<option value="">-- No templates found --</option>';
    }
}

// --- PDF Loading ---
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
            const templatesDir = await window.Workspace.dirHandle.getDirectoryHandle('Templates', { create: true });
            const configName = currentPdfName.replace('.pdf', '_Config.json');
            const configFile = await (await templatesDir.getFileHandle(configName)).getFile();
            templateMap = JSON.parse(await configFile.text());
            
            if (!templateMap.fields) templateMap.fields = {};
            if (!templateMap.coverUps) templateMap.coverUps = [];
            if (output) output.textContent = `Loaded existing map for ${currentPdfName}.`;
        } catch (err) {
            templateMap = { fields: {}, coverUps: [] };
            if (output) output.textContent = `Loaded ${currentPdfName}. No existing map found.`;
        }
        
        redrawCanvas(canvas, offscreenCanvas, pdfViewport, templateMap);
        await refreshTemplateList(); // Refresh list to see if we loaded a known one
        
    } catch (error) { 
        alert(`Error loading PDF: ${error.message}`); 
    }
});

// --- Saving and Deleting ---
document.getElementById('saveMapBtn').addEventListener('click', async () => {
    try {
        const templatesDir = await window.Workspace.dirHandle.getDirectoryHandle('Templates', { create: true });
        const configName = currentPdfName.replace('.pdf', '_Config.json');
        const fileHandle = await templatesDir.getFileHandle(configName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(templateMap, null, 2));
        await writable.close();
        
        if (output) output.textContent = `✅ Configuration saved as ${configName}!`;
        await refreshTemplateList();
        
    } catch (error) { 
        alert(`Save failed: ${error.message}`); 
    }
});

if (deleteTemplateBtn) {
    deleteTemplateBtn.addEventListener('click', async () => {
        const selectedPdf = templateDropdown.value;
        if (!selectedPdf) return;

        if (confirm(`Delete configuration map for ${selectedPdf}? (This will not delete the actual PDF file).`)) {
            try {
                const templatesDir = await window.Workspace.dirHandle.getDirectoryHandle('Templates');
                const configName = selectedPdf.replace('.pdf', '_Config.json');
                await templatesDir.removeEntry(configName);
                
                if (output) output.textContent = `🗑️ Deleted mapping for ${selectedPdf}.`;
                await refreshTemplateList();
            } catch (error) { 
                alert(`Failed to delete configuration: ${error.message}`); 
            }
        }
    });
}

// --- Custom Variable Selection Modal ---
function openVariableModal() {
    return new Promise((resolve) => {
        const modal = document.getElementById('variableModal');
        const select = document.getElementById('variableSelect');
        const confirmBtn = document.getElementById('confirmVariableBtn');
        const cancelBtn = document.getElementById('cancelVariableBtn');

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

// --- Canvas Mouse Controls ---
const canvas = document.getElementById('pdfCanvas');

if (canvas) {
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

        const currentToolNode = document.querySelector('input[name="toolMode"]:checked');
        const currentTool = currentToolNode ? currentToolNode.value : 'variable';
        
        dragField = getHoveredItem(mouseX, mouseY, pdfViewport, templateMap);
        
        if (dragField) { 
            // Clicked an existing box - allow moving it
            isDragging = true;
            hasMoved = false;
        } else {
            // Start drawing a NEW box (both tools now use click-and-drag)
            isDragging = true;
            dragField = { type: 'drawing_new', tool: currentTool };
            drawStartX = mouseX;
            drawStartY = mouseY;
        }
    });

    canvas.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        if (dragField && (dragField.type === 'variable' || dragField.type === 'coverUp')) {
            hasMoved = true;
            const pdfX = mouseX / pdfViewport.scale;
            const pdfY = (pdfViewport.height - mouseY) / pdfViewport.scale;

            if (dragField.type === 'variable') {
                templateMap.fields[dragField.id].x = pdfX;
                templateMap.fields[dragField.id].y = pdfY;
            } else {
                templateMap.coverUps[dragField.id].x = pdfX;
                templateMap.coverUps[dragField.id].y = pdfY;
            }
            redrawCanvas(canvas, offscreenCanvas, pdfViewport, templateMap);
        } 
        else if (dragField && dragField.type === 'drawing_new') {
            redrawCanvas(canvas, offscreenCanvas, pdfViewport, templateMap);
            
            const boxX = Math.min(drawStartX, mouseX);
            const boxY = Math.min(drawStartY, mouseY);
            const boxW = Math.abs(mouseX - drawStartX);
            const boxH = Math.abs(mouseY - drawStartY);

            const ctx = canvas.getContext('2d');
            if (dragField.tool === 'coverup') {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
                ctx.strokeStyle = '#dc3545';
            } else {
                ctx.fillStyle = 'rgba(74, 246, 38, 0.3)'; // Green for variables
                ctx.strokeStyle = '#4af626';
            }
            ctx.fillRect(boxX, boxY, boxW, boxH);
            ctx.lineWidth = 2;
            ctx.strokeRect(boxX, boxY, boxW, boxH);
        }
    });

    canvas.addEventListener('mouseup', async (e) => {
        if (e.button !== 0 || !pdfViewport) return;
        
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        if (dragField && dragField.type === 'drawing_new') {
            const pixelW = Math.abs(mouseX - drawStartX);
            const pixelH = Math.abs(mouseY - drawStartY);
            
            if (pixelW > 5 && pixelH > 5) { 
                const pdfW = pixelW / pdfViewport.scale;
                const pdfH = pixelH / pdfViewport.scale;
                const pdfX = Math.min(drawStartX, mouseX) / pdfViewport.scale;
                const bottomPixelY = Math.max(drawStartY, mouseY); 
                const pdfY = (pdfViewport.height - bottomPixelY) / pdfViewport.scale;

                if (dragField.tool === 'coverup') {
                    templateMap.coverUps.push({ x: pdfX, y: pdfY, width: pdfW, height: pdfH });
                } else if (dragField.tool === 'variable') {
                    const variableName = await openVariableModal();
                    if (variableName) {
                        // SAVE THE WIDTH AND HEIGHT!
                        templateMap.fields[variableName] = { x: pdfX, y: pdfY, width: pdfW, height: pdfH };
                    }
                }
            }
            redrawCanvas(canvas, offscreenCanvas, pdfViewport, templateMap);
        }
        
        isDragging = false;
        dragField = null;
        hasMoved = false;
    });
}
