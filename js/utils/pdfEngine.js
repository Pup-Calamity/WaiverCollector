// js/utils/pdfEngine.js

// js/utils/helpers.js (or wherever this is stored)

export async function stampWaiverWithConfig(pdfArrayBuffer, vendorData, configJson) {
    if (!window.PDFLib) throw new Error("PDF-lib is not loaded. Check index.html script tags.");
    
    // Deconstruct degrees from the global PDFLib object
    const { PDFDocument, rgb, degrees } = window.PDFLib; 
    
    const pdfDoc = await PDFDocument.load(pdfArrayBuffer);
    const pages = pdfDoc.getPages();
    const firstPage = pages[0]; 

    // 1. Draw Cover-Ups (White Rectangles) FIRST to hide old text
    if (configJson.coverUps) {
        configJson.coverUps.forEach(box => {
            firstPage.drawRectangle({
                x: box.x,
                y: box.y,
                width: box.width,
                height: box.height,
                color: rgb(1, 1, 1) // Pure white
            });
        });
    }

    // 2. Stamp the new dynamic text on top
    if (configJson.fields) {
        for (const [variableName, coords] of Object.entries(configJson.fields)) {
            
            // Only stamp if the data actually exists in our dictionary
            const textToPrint = vendorData[variableName] !== undefined ? String(vendorData[variableName]) : "";
            
            if (textToPrint.trim() !== "") {
                
                // Check if this specific variable is the barcode
                const isBarcode = (variableName === "barcode");

                firstPage.drawText(textToPrint, {
                    x: coords.x,
                    y: coords.y,
                    size: coords.size || 12,
                    color: rgb(0, 0, 0), // Pure black
                    
                    // Rotate the barcode 90 degrees; leave everything else flat at 0 degrees
                    rotate: isBarcode ? degrees(90) : degrees(0)
                });
            }
        }
    }

    // Return the raw byte array of the new PDF
    return await pdfDoc.save();
}
}
