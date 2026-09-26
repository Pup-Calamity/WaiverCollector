// js/utils/pdfEngine.js

// --- Helper: Word Wrapper ---
// Breaks a long string into an array of lines that fit inside a specific width
function wrapText(text, font, fontSize, maxWidth) {
    const paragraphs = String(text).split('\n');
    const lines = [];
    
    for (const p of paragraphs) {
        const words = p.split(' ');
        let currentLine = '';
        
        for (const word of words) {
            const testLine = currentLine ? currentLine + ' ' + word : word;
            const width = font.widthOfTextAtSize(testLine, fontSize);
            
            if (width > maxWidth && currentLine !== '') {
                lines.push(currentLine);
                currentLine = word;
            } else {
                currentLine = testLine;
            }
        }
        if (currentLine) lines.push(currentLine);
    }
    return lines;
}


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
                
                const isBoxed = field.width && field.height && !isBarcode;
                
                let finalFontSize = 12; // MAX FONT SIZE IS LOCKED TO 12pt
                let lines = [textToPrint];

                if (isBoxed) {
                    finalFontSize = Math.min(12, field.height);
                    
                    while (finalFontSize > 4) {
                        lines = wrapText(textToPrint, font, finalFontSize, field.width);
                        const totalTextHeight = lines.length * (finalFontSize * 1.2);
                        
                        if (totalTextHeight <= field.height) {
                            break; 
                        }
                        finalFontSize -= 0.5; 
                    }
                } else if (isBarcode) {
                    finalFontSize = 8; 
                } else {
                    finalFontSize = field.size || 12; 
                }

                // --- RENDERING PHASE ---
                if (isBarcode) {
                    // Safe lookup supporting multiple global CDN export names
                    const qrLib = window.QRCode || window.qrcode;
                    if (!qrLib || typeof qrLib.toDataURL !== 'function') {
                        throw new Error("QR Code library is not loaded or missing toDataURL method.");
                    }

                    const qrDataUrl = await qrLib.toDataURL(textToPrint, { 
                        errorCorrectionLevel: 'H',
                        margin: 1,
                        width: 150 
                    });
                    
                    const qrImage = await pdfDoc.embedPng(qrDataUrl);
                    const boxSize = field.width || 50; 
                    
                    targetPage.drawImage(qrImage, {
                        x: field.x,
                        y: field.y,
                        width: boxSize,
                        height: boxSize
                    });
                }
                else if (isBoxed) {
                    const totalTextHeight = lines.length * (finalFontSize * 1.2);
                    const emptySpace = field.height - totalTextHeight;
                    let currentY = (field.y + field.height) - (emptySpace / 2) - finalFontSize;
                    
                    for (const line of lines) {
                        targetPage.drawText(line, {
                            x: field.x,
                            y: currentY,
                            size: finalFontSize,
                            font: font,
                            color: rgb(0, 0, 0)
                        });
                        currentY -= (finalFontSize * 1.2);
                    }
                } 
                else {
                    targetPage.drawText(textToPrint, {
                        x: field.x,
                        y: field.y,
                        size: finalFontSize,
                        font: font,
                        color: rgb(0, 0, 0)
                    });
                }
            }
        }
    }

    // 3. Stamp Static Custom Text Boxes
    if (configJson.staticTexts) {
        for (const st of configJson.staticTexts) {
            const textToPrint = st.text || "";
            if (textToPrint.trim() !== "") {
                const pageNum = st.page || 1;
                const targetPage = pages[pageNum - 1] || firstPage;
                const isBoxed = st.width && st.height;
                
                let finalFontSize = 12;
                let lines = [textToPrint];

                if (isBoxed) {
                    finalFontSize = Math.min(12, st.height);
                    while (finalFontSize > 4) {
                        lines = wrapText(textToPrint, font, finalFontSize, st.width);
                        const totalTextHeight = lines.length * (finalFontSize * 1.2);
                        if (totalTextHeight <= st.height) break;
                        finalFontSize -= 0.5;
                    }
                } else {
                    finalFontSize = st.size || 12;
                }

                if (isBoxed) {
                    const totalTextHeight = lines.length * (finalFontSize * 1.2);
                    const emptySpace = st.height - totalTextHeight;
                    let currentY = (st.y + st.height) - (emptySpace / 2) - finalFontSize;
                    
                    for (const line of lines) {
                        targetPage.drawText(line, {
                            x: st.x,
                            y: currentY,
                            size: finalFontSize,
                            font: font,
                            color: rgb(0, 0, 0)
                        });
                        currentY -= (finalFontSize * 1.2);
                    }
                } else {
                    targetPage.drawText(textToPrint, {
                        x: st.x,
                        y: st.y,
                        size: finalFontSize,
                        font: font,
                        color: rgb(0, 0, 0)
                    });
                }
            }
        }
    }

    return await pdfDoc.save();
};
