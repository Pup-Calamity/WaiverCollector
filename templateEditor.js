// templateEditor.js

export function initTemplateEditor(dirHandle) {
    // Add this resilient fallback for the PDF.js global variable
    const pdfjsLib = window.pdfjsLib || window['pdfjs-dist/build/pdf'];
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

    const canvas = document.getElementById('pdfCanvas');
    const ctx = canvas.getContext('2d');
    
    let pdfViewport = null;
    let currentFileName = "";
    
    // The master object we will save as JSON
    let templateMap = { fields: {} };

    // 1. Load the PDF onto the canvas
    document.getElementById('loadPdfBtn').addEventListener('click', async () => {
        try {
            const [fileHandle] = await window.showOpenFilePicker({
                types: [{ accept: { 'application/pdf': ['.pdf'] } }]
            });
            const file = await fileHandle.getFile();
            currentFileName = file.name;

            const arrayBuffer = await file.arrayBuffer();
            const pdfDoc = await pdfjsLib.getDocument(arrayBuffer).promise;
            const page = await pdfDoc.getPage(1);
            
            // Render at 1.5x scale for easier clicking
            pdfViewport = page.getViewport({ scale: 1.5 });
            canvas.width = pdfViewport.width;
            canvas.height = pdfViewport.height;

            await page.render({ canvasContext: ctx, viewport: pdfViewport }).promise;
            document.getElementById('saveMapBtn').disabled = false;
            console.log("PDF loaded. Click anywhere to map a variable.");
        } catch (error) {
            console.error("Error loading PDF to canvas:", error);
        }
    });

    // 2. Capture clicks and map variables
    canvas.addEventListener('click', (e) => {
        if (!pdfViewport) return;

        // Get exact click coordinates relative to the canvas
        const rect = canvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;

        // CRITICAL: Convert HTML canvas coordinates to PDF coordinates
        // HTML starts top-left. PDF-lib starts bottom-left. We also reverse the 1.5x scale.
        const pdfX = clickX / pdfViewport.scale;
        const pdfY = (pdfViewport.height - clickY) / pdfViewport.scale;

        const variableName = prompt("Enter exact variable name (e.g., vendorName, amount, projectName):");

        if (variableName) {
            templateMap.fields[variableName] = { x: pdfX, y: pdfY, size: 12 };

            // Draw a visual highlighter box on the canvas
            ctx.fillStyle = 'rgba(74, 246, 38, 0.4)'; // Transparent green
            ctx.fillRect(clickX, clickY - 14, 120, 18);
            ctx.fillStyle = 'black';
            ctx.font = '14px Arial';
            ctx.fillText(variableName, clickX + 4, clickY - 1);
        }
    });

    // 3. Save the JSON file to the Templates folder
    document.getElementById('saveMapBtn').addEventListener('click', async () => {
        try {
            const templatesDir = await dirHandle.getDirectoryHandle('Templates', { create: true });
            
            // Name the config file to match the PDF (e.g., Waiver.pdf -> Waiver_Config.json)
            const jsonFileName = currentFileName.replace('.pdf', '_Config.json');
            const fileHandle = await templatesDir.getFileHandle(jsonFileName, { create: true });
            
            const writable = await fileHandle.createWritable();
            await writable.write(JSON.stringify(templateMap, null, 2));
            await writable.close();

            alert(`Template map saved as ${jsonFileName}`);
        } catch (error) {
            console.error("Failed to save map:", error);
        }
    });
}
