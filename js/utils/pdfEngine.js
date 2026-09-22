// js/utils/pdfEngine.js

window.stampWaiverWithConfig = async function(pdfArrayBuffer, vendorData, configJson) {
    if (!window.PDFLib) throw new Error("PDF-lib is not loaded. Check index.html script tags.");
    
    const { PDFDocument, rgb, degrees, StandardFonts } = window.PDFLib; 
    
    const pdfDoc = await PDFDocument.load(pdfArrayBuffer);
    const pages = pdfDoc.getPages();
    const firstPage = pages[0]; 

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // 1. Draw Cover-Ups
    if (configJson.coverUps) {
        configJson.coverUps.forEach(box => {
            const pageNum = box.page || 1;
            const targetPage = pages[pageNum - 1] || firstPage; 
            
            targetPage.drawRectangle({
                x: box.x, y: box.y, width: box.width, height: box.height,
                color: rgb(1, 1, 1) 
            });
        });
    }

    // 2. Stamp the new dynamic text on top
    if (configJson.fields) {
        // BACKWARDS COMPATIBILITY: Convert old dictionary to new Array format
        const fieldList = Array.isArray(configJson.fields) 
            ? configJson.fields 
            : Object.entries(configJson.fields).map(([k, v]) => ({ variable: k, ...v }));

        for (const field of fieldList) {
            const textToPrint = vendorData[field.variable] !== undefined ? String(vendorData[field.variable]) : "";
            
            if (textToPrint.trim() !== "") {
                const isBarcode = (field.variable === "barcode");
                const pageNum = field.page || 1;
                const targetPage = pages[pageNum - 1] || firstPage; 
                
                let finalFontSize = field.size || 12; 
                
                if (field.width && field.height && !isBarcode) {
                    finalFontSize = field.height; 
                    while (finalFontSize > 4) {
                        const textWidth = font.widthOfTextAtSize(textToPrint, finalFontSize);
                        const textHeight = font.heightAtSize(finalFontSize);
                        
                        if (textWidth <= field.width && textHeight <= field.height) {
                            break; 
                        }
                        finalFontSize -= 0.5; 
                    }
                }

                targetPage.drawText(textToPrint, {
                    x: field.x,
                    y: field.y,
                    size: finalFontSize,
                    font: font, 
                    color: rgb(0, 0, 0),
                    rotate: isBarcode ? degrees(90) : degrees(0)
                });
            }
        }
    }

    return await pdfDoc.save();
};
