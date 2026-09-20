// Helper to convert a file into a Base64 string for the email attachment
async function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            // Extracts just the base64 string, removing the "data:application/pdf;base64," prefix
            const base64String = reader.result.split(',')[1];
            resolve(base64String);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// --- Upgraded Multipart EML Generator ---
// added 'attachmentHandles' as an optional array of FileSystemFileHandle objects
async function generateEmailFile(saveFolderHandle, fileName, to, cc, subject, htmlBody, attachmentHandles = []) {
    try {
        // A unique string to separate the body from the attachments
        const boundary = "----=_NextPart_EMAIL_BOUNDARY_" + Date.now();
        
        // 1. Build the MIME Header
        let emlContent = 
`To: ${to}
CC: ${cc}
Subject: ${subject}
X-Unsent: 1
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="${boundary}"

--${boundary}
Content-Type: text/html; charset="utf-8"

${htmlBody}
`;

        // 2. Process and inject attachments
        if (attachmentHandles && attachmentHandles.length > 0) {
            for (const handle of attachmentHandles) {
                // Get the actual file data from the handle
                const file = await handle.getFile();
                const base64Data = await fileToBase64(file);
                
                // Format the attachment MIME block
                // Breaking the base64 string into 76-character lines is standard email formatting
                const formattedBase64 = base64Data.match(/.{1,76}/g).join('\r\n');

                emlContent += 
`
--${boundary}
Content-Type: application/octet-stream; name="${file.name}"
Content-Transfer-Encoding: base64
Content-Disposition: attachment; filename="${file.name}"

${formattedBase64}
`;
            }
        }

        // 3. Close the MIME boundary
        emlContent += `\n--${boundary}--\n`;

        // 4. Clean filename and save to disk
        const safeFileName = fileName.replace(/[<>:"/\\|?*]+/g, '_') + ".eml";
        const fileHandle = await saveFolderHandle.getFileHandle(safeFileName, { create: true });
        const writable = await fileHandle.createWritable();
        
        await writable.write(emlContent);
        await writable.close();
        
        console.log(`✅ Saved draft with ${attachmentHandles.length} attachments: ${safeFileName}`);
        return true;

    } catch (error) {
        console.error(`❌ Failed to save email ${fileName}:`, error);
        return false;
    }
}
