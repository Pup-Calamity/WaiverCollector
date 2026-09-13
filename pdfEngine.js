export async function stampWaiverWithConfig(pdfArrayBuffer, vendorData, configJson) {
    const pdfDoc = await window.PDFLib.PDFDocument.load(pdfArrayBuffer);
    const pages = pdfDoc.getPages();
    const firstPage = pages[0]; 

    for (const [variableName, coordinates] of Object.entries(configJson.fields)) {
        if (vendorData[variableName]) {
            firstPage.drawText(String(vendorData[variableName]), {
                x: coordinates.x,
                y: coordinates.y,
                size: coordinates.size || 12,
                color: window.PDFLib.rgb(0, 0, 0) 
            });
        }
    }

    return await pdfDoc.save();
}
