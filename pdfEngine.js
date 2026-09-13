// pdfEngine.js

export async function stampWaiverWithConfig(pdfArrayBuffer, vendorData, configJson) {
    // Load the blank PDF template
    const pdfDoc = await PDFLib.PDFDocument.load(pdfArrayBuffer);
    const pages = pdfDoc.getPages();
    const firstPage = pages[0]; 

    // Loop through every field defined in the JSON configuration
    for (const [variableName, coordinates] of Object.entries(configJson.fields)) {
        
        // Check if the current vendor data has a matching value for this variable
        if (vendorData[variableName]) {
            
            // Stamp the value at the exact X/Y coordinates from the visual editor
            firstPage.drawText(String(vendorData[variableName]), {
                x: coordinates.x,
                y: coordinates.y,
                size: coordinates.size || 12,
                color: PDFLib.rgb(0, 0, 0) // Standard black text
            });
        }
    }

    // Return the finished PDF as a byte array for saving
    return await pdfDoc.save();
}
