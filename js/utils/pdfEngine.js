// js/utils/pdfEngine.js

// By attaching to "window", it becomes globally available to waiverTool.js
window.stampWaiverWithConfig = async function(pdfArrayBuffer, vendorData, configJson) {
    if (!window.PDFLib) throw new Error("PDF-lib is not loaded. Check index.html script tags.");
    
    const { PDFDocument, rgb, degrees, StandardFonts } = window.PDFLib; 
    
    const pdfDoc = await PDFDocument.load(pdfArrayBuffer);
    const pages = pdfDoc.getPages();
    const firstPage = pages[0]; 

    // Load the font so we can mathematically measure text width/height
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // 1. Draw Cover-Ups
    if (configJson.coverUps) {
        configJson.coverUps.forEach(box => {
            const pageNum = box.page || 1;
            const targetPage = pages[pageNum - 1] || firstPage; // Safely default to page 1
            
            targetPage.drawRectangle({
                x: box.x, y: box.y, width: box.width, height: box.height,
                color: rgb(1, 1, 1) // Pure white
            });
        });
    }

    // 2. Stamp the new dynamic text on top
    if (configJson.fields) {
        for (const [variableName, coords] of Object.entries(configJson.fields)) {
            
            const textToPrint = vendorData[variableName] !== undefined ? String(vendorData[variableName]) : "";
            
            if (textToPrint.trim() !== "") {
                const isBarcode = (variableName === "barcode");
                const pageNum = coords.page || 1;
                const targetPage = pages[pageNum - 1] || firstPage; // Safely default to page 1
                
                // --- THE AUTO-SIZE MATH ENGINE ---
                let finalFontSize = coords.size || 12; // Default fallback
                
                // If the user drew a bounding box in the UI with a width & height
                if (coords.width && coords.height && !isBarcode) {
                    finalFontSize = coords.height; // Start font size as large as the box height
                    
                    // Keep shrinking the font until it fits both Width and Height bounds
                    while (finalFontSize > 4) {
                        const textWidth = font.widthOfTextAtSize(textToPrint, finalFontSize);
                        const textHeight = font.heightAtSize(finalFontSize);
                        
                        if (textWidth <= coords.width && textHeight <= coords.height) {
                            break; // It fits!
                        }
                        finalFontSize -= 0.5; // Shrink it and loop again
                    }
                }

                targetPage.drawText(textToPrint, {
                    x: coords.x,
                    y: coords.y,
                    size: finalFontSize,
                    font: font, // MUST pass the font object to use precise sizing
                    color: rgb(0, 0, 0),
                    rotate: isBarcode ? degrees(90) : degrees(0)
                });
            }
        }
    }

    return await pdfDoc.save();
};
