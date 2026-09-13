// templateEditor.js

export function getPdfJsLib() {
    if (!window.pdfjsLib) {
        throw new Error("PDF.js is not loaded. Check the CDN script tag in your HTML.");
    }
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
    return window.pdfjsLib;
}

// Clears the canvas, paints the raw PDF snapshot, and draws all active markers
export function redrawCanvas(canvas, offscreenCanvas, pdfViewport, templateMap) {
    if (!pdfViewport || !offscreenCanvas) return;
    const ctx = canvas.getContext('2d');
    
    // 1. Wipe clean and draw base PDF
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(offscreenCanvas, 0, 0);

    // 2. Draw all mapped variables
    if (templateMap && templateMap.fields) {
        for (const [variableName, coords] of Object.entries(templateMap.fields)) {
            const htmlX = coords.x * pdfViewport.scale;
            const htmlY = pdfViewport.height - (coords.y * pdfViewport.scale);
            
            ctx.fillStyle = 'rgba(74, 246, 38, 0.5)';
            ctx.fillRect(htmlX, htmlY - 14, 120, 18);
            ctx.fillStyle = 'black';
            ctx.font = '14px Arial';
            ctx.fillText(variableName, htmlX + 4, htmlY - 1);
        }
    }
}

// Checks if the mouse X/Y is currently hovering over an existing marker box
export function getHoveredField(mouseX, mouseY, pdfViewport, templateMap) {
    if (!templateMap || !templateMap.fields) return null;

    for (const [variableName, coords] of Object.entries(templateMap.fields)) {
        const htmlX = coords.x * pdfViewport.scale;
        const htmlY = pdfViewport.height - (coords.y * pdfViewport.scale);

        // Check if mouse is inside the 120x18 pixel box we drew
        if (mouseX >= htmlX && mouseX <= htmlX + 120 && 
            mouseY >= htmlY - 14 && mouseY <= htmlY + 4) {
            return variableName;
        }
    }
    return null;
}
