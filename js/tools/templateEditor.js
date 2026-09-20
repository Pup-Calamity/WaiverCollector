// js/tools/templateEditor.js

/**
 * Initializes and returns the PDF.js library.
 * The worker is required to parse PDFs without blocking the main browser thread.
 */
export function getPdfJsLib() {
    if (!window.pdfjsLib) throw new Error("PDF.js is not loaded. Check index.html script tags.");
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
    return window.pdfjsLib;
}

/**
 * Redraws the entire canvas frame. 
 * Layers: Base PDF -> Whiteout Cover-ups -> Green Variables
 */
export function redrawCanvas(canvas, offscreenCanvas, pdfViewport, templateMap) {
    if (!pdfViewport || !offscreenCanvas) return;
    const ctx = canvas.getContext('2d');
    
    // 1. Wipe clean and draw base PDF from the offscreen buffer
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(offscreenCanvas, 0, 0);

    // 2. Draw Cover-Ups (White with red boundary for editing visibility)
    if (templateMap.coverUps) {
        templateMap.coverUps.forEach(box => {
            const htmlX = box.x * pdfViewport.scale;
            // Convert PDF bottom-left origin to Canvas top-left origin
            const htmlY = pdfViewport.height - (box.y * pdfViewport.scale) - (box.height * pdfViewport.scale);
            const htmlW = box.width * pdfViewport.scale;
            const htmlH = box.height * pdfViewport.scale;

            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.fillRect(htmlX, htmlY, htmlW, htmlH);
            ctx.strokeStyle = '#dc3545'; // Bootstrap Danger Red
            ctx.strokeRect(htmlX, htmlY, htmlW, htmlH);
        });
    }

    // 3. Draw Variables (Green highlight blocks)
    if (templateMap.fields) {
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

/**
 * Checks if the mouse coordinates intersect with any drawn objects.
 * Returns the object type and ID, or null if clicking empty space.
 */
export function getHoveredItem(mouseX, mouseY, pdfViewport, templateMap) {
    // 1. Check variables first (they sit on top of coverups visually)
    if (templateMap.fields) {
        for (const [variableName, coords] of Object.entries(templateMap.fields)) {
            const htmlX = coords.x * pdfViewport.scale;
            const htmlY = pdfViewport.height - (coords.y * pdfViewport.scale);
            if (mouseX >= htmlX && mouseX <= htmlX + 120 && mouseY >= htmlY - 14 && mouseY <= htmlY + 4) {
                return { type: 'variable', id: variableName };
            }
        }
    }
    
    // 2. Check cover-ups
    if (templateMap.coverUps) {
        for (let i = 0; i < templateMap.coverUps.length; i++) {
            const box = templateMap.coverUps[i];
            const htmlX = box.x * pdfViewport.scale;
            const htmlY = pdfViewport.height - (box.y * pdfViewport.scale) - (box.height * pdfViewport.scale);
            const htmlW = box.width * pdfViewport.scale;
            const htmlH = box.height * pdfViewport.scale;
            
            if (mouseX >= htmlX && mouseX <= htmlX + htmlW && mouseY >= htmlY && mouseY <= htmlY + htmlH) {
                return { type: 'coverup', id: i }; // Return the array index so we can delete it later
            }
        }
    }
    
    return null;
}
