// templateEditor.js

export function getPdfJsLib() {
    if (!window.pdfjsLib) {
        throw new Error("PDF.js is not loaded. Check the CDN script tag in your HTML.");
    }
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
    return window.pdfjsLib;
}

// Helper to draw the green boxes so we can reuse it
function drawMarker(canvas, x, y, label) {
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(74, 246, 38, 0.4)';
    ctx.fillRect(x, y - 14, 120, 18);
    ctx.fillStyle = 'black';
    ctx.font = '14px Arial';
    ctx.fillText(label, x + 4, y - 1);
}

// Translates PDF coordinates back to HTML canvas coordinates and draws them
export function loadExistingMap(canvas, pdfViewport, templateMap) {
    if (!templateMap || !templateMap.fields) return;
    
    for (const [variableName, coords] of Object.entries(templateMap.fields)) {
        const htmlX = coords.x * pdfViewport.scale;
        const htmlY = pdfViewport.height - (coords.y * pdfViewport.scale);
        drawMarker(canvas, htmlX, htmlY, variableName);
    }
}

export function handleCanvasClick(e, pdfViewport, templateMap) {
    if (!pdfViewport) return;

    const canvas = document.getElementById('pdfCanvas');
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const pdfX = clickX / pdfViewport.scale;
    const pdfY = (pdfViewport.height - clickY) / pdfViewport.scale;

    const variableName = prompt("Enter exact variable name (e.g., vendorName, amount, projectName):");

    if (variableName) {
        templateMap.fields[variableName] = { x: pdfX, y: pdfY, size: 12 };
        drawMarker(canvas, clickX, clickY, variableName);
    }
}
