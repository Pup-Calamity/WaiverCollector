// pdfEngine.js
export async function stampWaiverWithConfig(pdfArrayBuffer, vendorData, configJson) {
    const pdfDoc = await window.PDFLib.PDFDocument.load(pdfArrayBuffer);
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
                color: window.PDFLib.rgb(1, 1, 1) // Pure white
            });
        });
    }

    // 2. Stamp the new text on top
    if (configJson.fields) {
        for (const [variableName, coords] of Object.entries(configJson.fields)) {
            if (vendorData[variableName]) {
                firstPage.drawText(String(vendorData[variableName]), {
                    x: coords.x,
                    y: coords.y,
                    size: coords.size || 12,
                    color: window.PDFLib.rgb(0, 0, 0) 
                });
            }
        }
    }

    return await pdfDoc.save();
}
