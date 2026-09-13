// templateEditor.js

export function getPdfJsLib() {
    // Ensure the global pdfjsLib exists (loaded via CDN in the HTML)
    if (!window.pdfjsLib) {
        throw new Error("PDF.js is not loaded. Check the CDN script tag in your HTML.");
    }
    
    // Configure the background worker only when requested
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
    
    return window.pdfjsLib;
}

export function handleCanvasClick(e, pdfViewport, templateMap) {
    if (!pdfViewport) return;

    const canvas = document.getElementById('pdfCanvas');
    const rect = canvas.getBoundingClientRect();
    
    // Calculate click coordinates relative to the canvas
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Convert HTML canvas coordinates (top-left origin) to pdf-lib coordinates (bottom-left origin)
    // Account for the 1.5x scale applied during viewport rendering
    const pdfX = clickX / pdfViewport.scale;
    const pdfY = (pdfViewport.height - clickY) / pdfViewport.scale;

    // Prompt user for the variable name to map
    const variableName = prompt("Enter exact variable name (e.g., vendorName, amount, projectName):");

    if (variableName) {
        // Save the mapping coordinates to the JSON object
        templateMap.fields[variableName] = { 
            x: pdfX, 
            y: pdfY, 
            size: 12 // Default font size for the PDF stamper
        };

        // Draw a visual marker on the canvas to confirm placement
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(74, 246, 38, 0.4)'; // Transparent green highlighter
        ctx.fillRect(clickX, clickY - 14, 120, 18);
        
        ctx.fillStyle = 'black';
        ctx.font = '14px Arial';
        ctx.fillText(variableName, clickX + 4, clickY - 1);
    }
}
