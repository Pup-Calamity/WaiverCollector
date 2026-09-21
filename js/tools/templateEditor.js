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
export function redrawCanvas(canvas, bgCanvas, viewport, map) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (bgCanvas) ctx.drawImage(bgCanvas, 0, 0);

    // Draw coverups
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.strokeStyle = '#dc3545';
    ctx.lineWidth = 2;
    if (map.coverUps) {
        map.coverUps.forEach(box => {
            const px = box.x * viewport.scale;
            const py = viewport.height - (box.y * viewport.scale) - (box.height * viewport.scale);
            const pw = box.width * viewport.scale;
            const ph = box.height * viewport.scale;
            ctx.fillRect(px, py, pw, ph);
            ctx.strokeRect(px, py, pw, ph);
        });
    }

    // Draw variables (Now drawing full boxes!)
    ctx.lineWidth = 2;
    if (map.fields) {
        for (const [key, field] of Object.entries(map.fields)) {
            const px = field.x * viewport.scale;
            // Use field height if available, fallback to 15 if it's an old legacy dot
            const ph = (field.height || 15) * viewport.scale;
            const py = viewport.height - (field.y * viewport.scale) - ph;
            const pw = (field.width || 60) * viewport.scale;

            ctx.fillStyle = 'rgba(74, 246, 38, 0.3)';
            ctx.strokeStyle = '#4af626';
            ctx.fillRect(px, py, pw, ph);
            ctx.strokeRect(px, py, pw, ph);
            
            // Draw variable text inside the box
            ctx.fillStyle = '#000';
            ctx.font = '12px Arial';
            ctx.fillText(key, px + 2, py + 14);
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
