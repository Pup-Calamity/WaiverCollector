// emailEngine.js

// Helper function to convert raw PDF bytes into a Base64 string
function bufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

export function generateEmlBlob(emailData, pdfBuffer, pdfFileName) {
    const base64Pdf = bufferToBase64(pdfBuffer);
    const boundary = "----=_Part_Boundary_" + Date.now();

    // Construct the exact MIME structure required for Outlook
    const emlString = [
        `X-Unsent: 1`,
        `From: waivers@lithko.com`,
        `To: ${emailData.to}`,
        `Cc: ${emailData.cc}`,
        `Subject: ${emailData.subject}`,
        `MIME-Version: 1.0`,
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        ``,
        `--${boundary}`,
        `Content-Type: text/html; charset=UTF-8`,
        ``,
        `${emailData.bodyHTML}`,
        ``,
        `--${boundary}`,
        `Content-Type: application/pdf; name="${pdfFileName}"`,
        `Content-Disposition: attachment; filename="${pdfFileName}"`,
        `Content-Transfer-Encoding: base64`,
        ``,
        `${base64Pdf}`,
        ``,
        `--${boundary}--`
    ].join('\r\n');

    // Return as a Blob ready to be saved by the File System Access API
    return new Blob([emlString], { type: 'message/rfc822' });
}
