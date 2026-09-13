export function configurePdfJs() {
    const pdfjsLib = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
    return pdfjsLib;
}

export function handleCanvasClick(e, pdfViewport, templateMap) {
    if (!pdfViewport) return;

    const canvas = document.getElementById('pdfCanvas');
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Convert to pdf-lib bottom-left origin coordinates
    const pdfX = clickX / pdfViewport.scale;
    const pdfY = (pdfViewport.height - clickY) / pdfViewport.scale;

    const variableName = prompt("Enter exact variable name (e.g., vendorName, amount, projectName):");

    if (variableName) {
        templateMap.fields[variableName] = { x: pdfX, y: pdfY, size: 12 };

        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(74, 246, 38, 0.4)';
        ctx.fillRect(clickX, clickY - 14, 120, 18);
        ctx.fillStyle = 'black';
        ctx.font = '14px Arial';
        ctx.fillText(variableName, clickX + 4, clickY - 1);
    }
}
