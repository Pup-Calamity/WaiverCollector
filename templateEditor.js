// templateEditor.js

// This object will hold all the mapped coordinates for the current template
let templateConfig = {
    templateName: "Frontline_Final.pdf",
    fields: {}
};

export function enableTemplateMapping(canvasElement, pdfHeight) {
    canvasElement.addEventListener('click', (event) => {
        // 1. Get the exact click coordinates relative to the canvas
        const rect = canvasElement.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const clickY = event.clientY - rect.top;

        // Note: HTML canvas Y-coordinates start at the top, but pdf-lib starts at the bottom.
        // We invert the Y coordinate here so pdf-lib understands it later.
        const pdfY = pdfHeight - clickY; 

        // 2. Prompt the user to assign a variable to this spot
        // (In the final UI, this would be a clean dropdown menu instead of a basic prompt)
        const variableName = prompt("Enter variable name (e.g., vendorName, amount, projectName):");

        if (variableName) {
            // 3. Save the mapping to our configuration object
            templateConfig.fields[variableName] = {
                x: clickX,
                y: pdfY,
                size: 12, // Default font size
                font: 'Helvetica'
            };

            // 4. Draw a visual marker on the screen so you know it's placed
            drawMarkerOnCanvas(canvasElement, clickX, clickY, variableName);
            console.log("Current Map:", templateConfig);
        }
    });
}

function drawMarkerOnCanvas(canvas, x, y, label) {
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(74, 246, 38, 0.5)'; // Bright green highlighter
    ctx.fillRect(x, y - 10, 100, 15);
    ctx.fillStyle = 'black';
    ctx.font = '10px Arial';
    ctx.fillText(label, x + 2, y);
}
