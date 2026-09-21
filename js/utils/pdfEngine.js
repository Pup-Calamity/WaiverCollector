// js/utils/pdfEngine.js

export async function stampWaiverWithConfig(pdfArrayBuffer, vendorData, configJson) {
    if (!window.PDFLib) throw new Error("PDF-lib is not loaded. Check index.html script tags.");
    
    const { PDFDocument, rgb, degrees, StandardFonts } = window.PDFLib; 
    const pdfDoc = await PDFDocument.load(pdfArrayBuffer);
    const pages = pdfDoc.getPages();
    
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // 1. Draw Cover-Ups
    if (configJson.coverUps) {
        configJson.coverUps.forEach(box => {
            const pageNum = box.page || 1; // Fallback to 1
            const targetPage = pages[pageNum - 1]; // Arrays start at 0
            
            targetPage.drawRectangle({
                x: box.x, y: box.y, width: box.width, height: box.height,
                color: rgb(1, 1, 1) 
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
                const targetPage = pages[pageNum - 1]; // Switch pages dynamically!
                
                let finalFontSize = coords.size || 12; 
                
                if (coords.width && coords.height && !isBarcode) {
                    finalFontSize = coords.height; 
                    while (finalFontSize > 4) {
                        const textWidth = font.widthOfTextAtSize(textToPrint, finalFontSize);
                        const textHeight = font.heightAtSize(finalFontSize);
                        if (textWidth <= coords.width && textHeight <= coords.height) break; 
                        finalFontSize -= 0.5; 
                    }
                }

                targetPage.drawText(textToPrint, {
                    x: coords.x,
                    y: coords.y,
                    size: finalFontSize,
                    font: font, 
                    color: rgb(0, 0, 0),
                    rotate: isBarcode ? degrees(90) : degrees(0)
                });
            }
        }
    }

    return await pdfDoc.save();
}
