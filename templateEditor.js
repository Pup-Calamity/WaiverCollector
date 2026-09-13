// templateEditor.js

export function getPdfJsLib() {
    if (!window.pdfjsLib) throw new Error("PDF.js is not loaded.");
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
    return window.pdfjsLib;
}

export function redrawCanvas(canvas, offscreenCanvas, pdfViewport, templateMap) {
    if (!pdfViewport || !offscreenCanvas) return;
    const ctx = canvas.getContext('2d');
    
    // Wipe clean and draw base PDF
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(offscreenCanvas, 0, 0);

    // Draw Cover-Ups (White with red border)
    if (templateMap.coverUps) {
        templateMap.coverUps.forEach(box => {
            const htmlX = box.x * pdfViewport.scale;
            const htmlY = pdfViewport.height - (box.y * pdfViewport.scale) - (box.height * pdfViewport.scale);
            const htmlW = box.width * pdfViewport.scale;
            const htmlH = box.height * pdfViewport.scale;

            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.fillRect(htmlX, htmlY, htmlW, htmlH);
            ctx.strokeStyle = 'red';
            ctx.strokeRect(htmlX, htmlY, htmlW, htmlH);
        });
    }

    // Draw Variables (Green)
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

export function getHoveredItem(mouseX, mouseY, pdfViewport, templateMap) {
    // 1. Check variables first
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
                return { type: 'coverup', id: i };
            }
        }
    }
    return null;
}
