// js/tools/mapperTool.js

const availableVariables = [
    { id: "barcode", label: "Barcode String" },
    { id: "subcontractor", label: "Vendor Name" },
    { id: "subcontractorAddress", label: "Vendor Address" },
    { id: "OUName", label: "Upper Tier Name" },
    { id: "vendorContract", label: "Vendor Contract Date" },
    { id: "owner", label: "Project Owner" },
    { id: "GCName", label: "General Contractor Name" },
    { id: "project", label: "Project Name" },
    { id: "GCNumber", label: "GC Contract Number" },
    { id: "projNum", label: "Project Number" },
    { id: "projectAddress", label: "Full Project Address (City, State, Zip)" },
    { id: "addressOnly", label: "Street Address Only" },
    { id: "city", label: "Project City" },
    { id: "state", label: "Project State" },
    { id: "zip", label: "Project Zip" },
    { id: "county", label: "Project County" },
    { id: "SubcontractScope", label: "Scope of Work" },
    { id: "ContractDate", label: "Date of Contract" },
    { id: "amount", label: "Current Payment Amount ($)" },
    { id: "amountWords", label: "Current Payment (Spelled Out)" },
    { id: "previousperiod", label: "Previous Period Amount ($)" },
    { id: "previousperiodWords", label: "Previous Period (Spelled Out)" },
    { id: "ContractPaid", label: "Total Paid Before This Waiver ($)" },
    { id: "conPaidWords", label: "Total Paid Before This (Spelled Out)" },
    { id: "Cumulative", label: "Cumulative Paid ($)" },
    { id: "CumulativeWords", label: "Cumulative Paid (Spelled Out)" },
    { id: "paidAmount", label: "Paid Amount ($)" },
    { id: "unpaidAmount", label: "Pending Unpaid Amount ($)" },
    { id: "contractAmount", label: "Contract Amount ($)" },
    { id: "remainingBalance", label: "Remaining Balance on Contract ($)" },
    { id: "startdate", label:  "Start Date" },
    { id: "throughDate", label: "Through Date" },
    { id: "day", label: "Through Date - Day Only" },
    { id: "month", label: "Through Date - Month Name Only" },
    { id: "year", label: "Through Date - Year Only" },
    { id: "paidThruDate", label: "Paid Through Date (Day before start)" },
    { id: "invoices", label: "Current Period Invoices List" },
    { id: "PrevInvoices", label: "Previous Period Invoices List" },
    { id: "exceptions", label: "Contract Exceptions" }
];

import { getPdfJsLib, redrawCanvas, getHoveredItem } from './templateEditor.js';

let pdfViewport = null;
let pdfDocument = null; 
let currentPageNum = 1; 
let totalPages = 1;     

// Added staticTexts array for custom text mapping
let templateMap = { fields: [], coverUps: [], staticTexts: [] };
let currentPdfName = "Template"; 
let currentPdfBytes = null; 
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
    const launchBtn = document.getElementById('launchMapperBtn');
    if (launchBtn) {
        launchBtn.addEventListener('click', async () => {
            if (!window.Workspace || !window.Workspace.dirHandle) {
                alert("Please connect a Master AR Folder first.");
                return;
            }
            switchView('templateMapperView');
            await refreshTemplateList();
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

// --- PDF Loading & Page Navigation ---
async function renderPdfPage(pageNum) {
    const page = await pdfDocument.getPage(pageNum);
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

    const ind = document.getElementById('pageIndicator');
    if (ind) ind.textContent = `Page ${pageNum} of ${totalPages}`;
    
    const prev = document.getElementById('prevPageBtn');
    if (prev) prev.disabled = pageNum <= 1;
    
    const next = document.getElementById('nextPageBtn');
    if (next) next.disabled = pageNum >= totalPages;

    selectedField = null;
    updateSelectionUI();
    redrawCanvas(canvas, offscreenCanvas, pdfViewport, templateMap, selectedField, currentPageNum);
}

document.getElementById('prevPageBtn')?.addEventListener('click', async () => {
    if (currentPageNum > 1) {
        currentPageNum--;
        await renderPdfPage(currentPageNum);
    }
});

document.getElementById('nextPageBtn')?.addEventListener('click', async () => {
    if (currentPageNum < totalPages) {
        currentPageNum++;
        await renderPdfPage(currentPageNum);
    }
});

document.getElementById('loadPdfBtn').addEventListener('click', async () => {
    try {
        const pdfjsLib = getPdfJsLib();
        const [fileHandle] = await window.showOpenFilePicker({ types: [{ accept: { 'application/pdf': ['.pdf'] } }] });
        const file = await fileHandle.getFile();
        currentPdfName = file.name;
        
        const arrayBuffer = await file.arrayBuffer();
        currentPdfBytes = arrayBuffer; 
        
        pdfDocument = await pdfjsLib.getDocument(arrayBuffer).promise;
        totalPages = pdfDocument.numPages;
        currentPageNum = 1; 

        document.getElementById('saveMapBtn').disabled = false;

        try {
            const templatesDir = await window.Workspace.dirHandle.getDirectoryHandle('Templates', { create: true });
            const configName = currentPdfName.replace('.pdf', '_Config.json');
            const configFile = await (await templatesDir.getFileHandle(configName)).getFile();
            templateMap = JSON.parse(await configFile.text());
            
            // CONVERT OLD DICTIONARIES TO NEW ARRAY FORMAT
            if (!templateMap.fields) {
                templateMap.fields = [];
            } else if (!Array.isArray(templateMap.fields)) {
                const convertedArray = [];
                for (const [key, val] of Object.entries(templateMap.fields)) {
                    convertedArray.push({ variable: key, ...val });
                }
                templateMap.fields = convertedArray;
            }
            if (!templateMap.coverUps) templateMap.coverUps = [];
            if (!templateMap.staticTexts) templateMap.staticTexts = []; // Backward compatibility
            
            if (output) output.textContent = `Loaded existing map for ${currentPdfName}.`;
        } catch (err) {
            templateMap = { fields: [], coverUps: [], staticTexts: [] };
            if (output) output.textContent = `Loaded ${currentPdfName}. No existing map found.`;
        }
        
        await renderPdfPage(currentPageNum);
        await refreshTemplateList(); 
        
    } catch (error) { 
        alert(`Error loading PDF: ${error.message}`); 
    }
});

// --- Saving and Deleting ---
document.getElementById('saveMapBtn').addEventListener('click', async () => {
    try {
        const templatesDir = await window.Workspace.dirHandle.getDirectoryHandle('Templates', { create: true });
        
        const configName = currentPdfName.replace('.pdf', '_Config.json');
        const configHandle = await templatesDir.getFileHandle(configName, { create: true });
        const configWritable = await configHandle.createWritable();
        await configWritable.write(JSON.stringify(templateMap, null, 2));
        await configWritable.close();

        if (currentPdfBytes) {
            const pdfHandle = await templatesDir.getFileHandle(currentPdfName, { create: true });
            const pdfWritable = await pdfHandle.createWritable();
            await pdfWritable.write(currentPdfBytes);
            await pdfWritable.close();
        }
        
        if (output) output.textContent = `✅ Imported PDF & Saved Map: ${currentPdfName}`;
        await refreshTemplateList();
        
    } catch (error) { 
        alert(`Save failed: ${error.message}`); 
    }
});

if (deleteTemplateBtn) {
    deleteTemplateBtn.addEventListener('click', async () => {
        const selectedPdf = templateDropdown.value;
        if (!selectedPdf) return;

        if (confirm(`Delete ${selectedPdf} and its mapping configuration?`)) {
            try {
                const templatesDir = await window.Workspace.dirHandle.getDirectoryHandle('Templates');
                const configName = selectedPdf.replace('.pdf', '_Config.json');
                await templatesDir.removeEntry(configName).catch(()=>console.log("No json"));
                await templatesDir.removeEntry(selectedPdf).catch(()=>console.log("No pdf"));
                
                if (output) output.textContent = `🗑️ Deleted ${selectedPdf}.`;
                
                const canvas = document.getElementById('pdfCanvas');
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                templateMap = { fields: [], coverUps: [], staticTexts: [] };
                
                await refreshTemplateList();
            } catch (error) { 
                alert(`Failed to delete: ${error.message}`); 
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

        select.innerHTML = availableVariables.map(v => {
            if (typeof v === 'string') return `<option value="${v}">${v}</option>`;
            return `<option value="${v.id}">${v.label}</option>`;
        }).join('');
        
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

// --- Canvas Mouse Controls & Selection State ---
const canvas = document.getElementById('pdfCanvas');

let selectedField = null;
let dragOffsetX = 0;
let dragOffsetY = 0;

let isResizing = false;
let initialWidth = 0;
let initialHeight = 0;
let initialY = 0; 

function getMousePos(canvas, evt) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;   
    const scaleY = canvas.height / rect.height; 
    return {
        x: (evt.clientX - rect.left) * scaleX,
        y: (evt.clientY - rect.top) * scaleY
    };
}

function updateSelectionUI() {
    const nameLabel = document.getElementById('selectionName');
    const delBtn = document.getElementById('deleteSelectionBtn');
    if (!nameLabel || !delBtn) return;

    if (!selectedField) {
        nameLabel.textContent = "Nothing selected. Click a box on the canvas.";
        delBtn.disabled = true;
    } else {
        let name = "";
        if (selectedField.type === 'variable') {
            name = `Variable: [ ${templateMap.fields[selectedField.id].variable} ]`;
        } else if (selectedField.type === 'coverup') {
            name = `Whiteout Box #${selectedField.id + 1}`;
        } else if (selectedField.type === 'staticText') {
            name = `Custom Text: "${templateMap.staticTexts[selectedField.id].text}"`;
        }

        nameLabel.innerHTML = `<strong style="color: var(--brand-color);">${name}</strong><br>Drag the center to move. Drag the bottom-right handle to resize.`;
        delBtn.disabled = false;
    }
}

// Bind Delete Button in UI (uses splice for arrays)
document.getElementById('deleteSelectionBtn')?.addEventListener('click', () => {
    if (!selectedField) return;
    
    if (selectedField.type === 'variable') {
        templateMap.fields.splice(selectedField.id, 1);
    } else if (selectedField.type === 'coverup') {
        templateMap.coverUps.splice(selectedField.id, 1);
    } else if (selectedField.type === 'staticText') {
        templateMap.staticTexts.splice(selectedField.id, 1);
    }

    selectedField = null;
    updateSelectionUI();
    redrawCanvas(canvas, offscreenCanvas, pdfViewport, templateMap, selectedField, currentPageNum);
});

if (canvas) {
    canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault(); 
        if (!pdfViewport) return;

        const { x: mouseX, y: mouseY } = getMousePos(canvas, e);
        const target = getHoveredItem(mouseX, mouseY, pdfViewport, templateMap, currentPageNum);
        
        if (target && confirm(`Delete this item?`)) {
            if (target.type === 'variable') templateMap.fields.splice(target.id, 1);
            else if (target.type === 'coverup') templateMap.coverUps.splice(target.id, 1);
            else if (target.type === 'staticText') templateMap.staticTexts.splice(target.id, 1);
            
            selectedField = null;
            updateSelectionUI();
            redrawCanvas(canvas, offscreenCanvas, pdfViewport, templateMap, selectedField, currentPageNum);
        }
    });

    canvas.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || !pdfViewport) return; 
        
        const { x: mouseX, y: mouseY } = getMousePos(canvas, e);
        const currentToolNode = document.querySelector('input[name="toolMode"]:checked');
        const currentTool = currentToolNode ? currentToolNode.value : 'variable';
        
        dragField = getHoveredItem(mouseX, mouseY, pdfViewport, templateMap, currentPageNum);
        
        if (dragField) { 
            selectedField = { type: dragField.type, id: dragField.id };
            updateSelectionUI();

            const field = dragField.type === 'variable' ? templateMap.fields[dragField.id] : 
                          dragField.type === 'coverup' ? templateMap.coverUps[dragField.id] :
                          templateMap.staticTexts[dragField.id];

            if (dragField.action === 'resize') {
                isResizing = true;
                isDragging = false;
                hasMoved = false;
                drawStartX = mouseX;
                drawStartY = mouseY;
                
                initialWidth = field.width || 60;
                initialHeight = field.height || 15;
                initialY = field.y; 
            } else {
                isDragging = true;
                isResizing = false;
                hasMoved = false;
                
                const pdfX = mouseX / pdfViewport.scale;
                const pdfY = (pdfViewport.height - mouseY) / pdfViewport.scale;
                dragOffsetX = pdfX - field.x;
                dragOffsetY = pdfY - field.y;
            }
            redrawCanvas(canvas, offscreenCanvas, pdfViewport, templateMap, selectedField, currentPageNum);
        } else {
            selectedField = null;
            updateSelectionUI();
            redrawCanvas(canvas, offscreenCanvas, pdfViewport, templateMap, selectedField, currentPageNum);
            
            isDragging = true;
            isResizing = false;
            dragField = { type: 'drawing_new', tool: currentTool };
            drawStartX = mouseX;
            drawStartY = mouseY;
        }
    });

    canvas.addEventListener('mousemove', (e) => {
        if (!isDragging && !isResizing) return;
        
        const { x: mouseX, y: mouseY } = getMousePos(canvas, e);

        if (isResizing && dragField) {
            hasMoved = true;
            const deltaX = (mouseX - drawStartX) / pdfViewport.scale;
            const deltaY = (mouseY - drawStartY) / pdfViewport.scale;
            
            const field = dragField.type === 'variable' ? templateMap.fields[dragField.id] : 
                          dragField.type === 'coverup' ? templateMap.coverUps[dragField.id] :
                          templateMap.staticTexts[dragField.id];
            
            const newW = Math.max(10, initialWidth + deltaX);
            const newH = Math.max(10, initialHeight + deltaY);
            const topEdgePdf = initialY + initialHeight;
            
            field.width = newW;
            field.height = newH;
            field.y = topEdgePdf - newH;

            redrawCanvas(canvas, offscreenCanvas, pdfViewport, templateMap, selectedField, currentPageNum);
        }
        else if (isDragging && dragField && (dragField.type === 'variable' || dragField.type === 'coverup' || dragField.type === 'staticText')) {
            hasMoved = true;
            const pdfX = mouseX / pdfViewport.scale;
            const pdfY = (pdfViewport.height - mouseY) / pdfViewport.scale;

            const field = dragField.type === 'variable' ? templateMap.fields[dragField.id] : 
                          dragField.type === 'coverup' ? templateMap.coverUps[dragField.id] :
                          templateMap.staticTexts[dragField.id];
            field.x = pdfX - dragOffsetX;
            field.y = pdfY - dragOffsetY;
            
            redrawCanvas(canvas, offscreenCanvas, pdfViewport, templateMap, selectedField, currentPageNum);
        } 
        else if (isDragging && dragField && dragField.type === 'drawing_new') {
            redrawCanvas(canvas, offscreenCanvas, pdfViewport, templateMap, selectedField, currentPageNum);
            
            const boxX = Math.min(drawStartX, mouseX);
            const boxY = Math.min(drawStartY, mouseY);
            const boxW = Math.abs(mouseX - drawStartX);
            const boxH = Math.abs(mouseY - drawStartY);

            const ctx = canvas.getContext('2d');
            if (dragField.tool === 'coverup') {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
                ctx.strokeStyle = '#dc3545'; // Red
            } else if (dragField.tool === 'staticText') {
                ctx.fillStyle = 'rgba(38, 138, 246, 0.3)'; 
                ctx.strokeStyle = '#268af6'; // Blue
            } else {
                ctx.fillStyle = 'rgba(74, 246, 38, 0.3)'; 
                ctx.strokeStyle = '#4af626'; // Green
            }
            ctx.fillRect(boxX, boxY, boxW, boxH);
            ctx.lineWidth = 2;
            ctx.strokeRect(boxX, boxY, boxW, boxH);
        }
    });

    canvas.addEventListener('mouseup', async (e) => {
        if (e.button !== 0 || !pdfViewport) return;
        
        const { x: mouseX, y: mouseY } = getMousePos(canvas, e);

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
                    templateMap.coverUps.push({ x: pdfX, y: pdfY, width: pdfW, height: pdfH, page: currentPageNum });
                    selectedField = { type: 'coverup', id: templateMap.coverUps.length - 1 };
                } else if (dragField.tool === 'staticText') {
                    const customText = prompt("Enter the custom text for this box:");
                    if (customText && customText.trim() !== "") {
                        templateMap.staticTexts.push({ text: customText.trim(), x: pdfX, y: pdfY, width: pdfW, height: pdfH, page: currentPageNum });
                        selectedField = { type: 'staticText', id: templateMap.staticTexts.length - 1 };
                    }
                } else if (dragField.tool === 'variable') {
                    const variableName = await openVariableModal();
                    if (variableName) {
                        templateMap.fields.push({ variable: variableName, x: pdfX, y: pdfY, width: pdfW, height: pdfH, page: currentPageNum });
                        selectedField = { type: 'variable', id: templateMap.fields.length - 1 };
                    }
                }
            }
            updateSelectionUI();
            redrawCanvas(canvas, offscreenCanvas, pdfViewport, templateMap, selectedField, currentPageNum);
        }
        
        isDragging = false;
        isResizing = false;
        dragField = null;
        hasMoved = false;
    });
}