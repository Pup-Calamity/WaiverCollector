// pdfEngine.js

export async function stampWaiver(pdfArrayBuffer, vendorData) {
    // Load the raw PDF buffer into pdf-lib
    const pdfDoc = await PDFLib.PDFDocument.load(pdfArrayBuffer);
    const pages = pdfDoc.getPages();
    const firstPage = pages[0]; // Assuming a 1-page waiver template

    // Draw text at specific X/Y coordinates (Origin is bottom-left)
    // You will tweak these coordinates based on your specific GC template
    
    firstPage.drawText(vendorData.projectName, {
        x: 120,
        y: 700,
        size: 12,
        color: PDFLib.rgb(0, 0, 0)
    });

    firstPage.drawText(vendorData.vendorName, {
        x: 120,
        y: 675,
        size: 12,
    });

    firstPage.drawText(`$${vendorData.amount}`, {
        x: 400,
        y: 675,
        size: 12,
    });

    // Serialize the document back to raw bytes
    return await pdfDoc.save();
}
