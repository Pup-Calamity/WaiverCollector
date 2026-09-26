// js/utils/helpers.js

// --- Global Email Lookup Utility ---
async function getEmployeeEmail(empName, logMsg = console.log) {
    if (!empName || empName.includes('Unknown')) return "";
    
    const empInfo = window.Workspace.appData.empInfo;
    if (!empInfo) return ""; 

    const emp = empInfo.find(e => String(e["Employee Name"]).trim().toLowerCase() === String(empName).trim().toLowerCase());
    
    if (emp && emp["Employee Email"]) {
        return emp["Employee Email"];
    }

    const newEmail = prompt(`Missing email for Project Contact: ${empName}\n\nPlease enter their email address to save it to the database:`);
    
    if (newEmail && newEmail.trim() !== "") {
        const cleanEmail = newEmail.trim();
        
        const newEmpRecord = {
            "Emp ID": "TBD", 
            "Employee Name": empName,
            "Employee Email": cleanEmail,
            "Employee Office": "",
            "Employee Cell": ""
        };

        empInfo.push(newEmpRecord);
        
        try {
            const fileHandle = await getFileByPath(window.Workspace.dirHandle, window.WORKSPACE_FILE_PATHS.empInfo);
            await UpdateExcel(fileHandle, [newEmpRecord], "Employee Name", "empInfo"); 
            logMsg(`➕ Saved new email for ${empName} to database.`);
        } catch (err) {
            console.warn("Failed to write new employee to Excel:", err);
            logMsg(`⚠️ Added ${empName} to memory, but failed to save to Excel.`, true);
        }

        return cleanEmail;
    }

    return "";
}

function getBurgEmail(burgName, roleName) {
    const burgData = window.Workspace.appData.burgEmails;
    if (!burgData || !burgName) return "";

    const cleanBurgName = String(burgName).trim().toLowerCase();
    
    const matchedBurg = burgData.find(row => 
        String(row["Burg"] || '').trim().toLowerCase() === cleanBurgName
    );

    if (matchedBurg && matchedBurg[roleName]) {
        return String(matchedBurg[roleName]).trim();
    }
    
    return "";
}


// --- File to Base64 Translator for Email Attachments ---
window.fileToBase64 = async function(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        // Read the file and translate it into a Data URL string
        reader.readAsDataURL(file);
        
        reader.onload = () => {
            // The result looks like "data:application/pdf;base64,JVBERi0xLjQK..."
            // We split at the comma to grab ONLY the raw Base64 characters
            const base64String = reader.result.split(',')[1];
            resolve(base64String);
        };
        
        reader.onerror = (error) => reject(error);
    });
};

// --- Upgraded Multipart EML Generator ---
async function generateEmailFile(saveFolderHandle, fileName, to, cc, subject, htmlBody, attachmentHandles = []) {
    try {
        const boundary = "----=_NextPart_EMAIL_BOUNDARY_" + Date.now();
        
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

        if (attachmentHandles && attachmentHandles.length > 0) {
            for (const handle of attachmentHandles) {
                const file = await handle.getFile();
                const base64Data = await fileToBase64(file);
                const formattedBase64 = base64Data.match(/.{1,76}/g).join('\r\n');

                emlContent += `\n--${boundary}\nContent-Type: application/octet-stream; name="${file.name}"\nContent-Transfer-Encoding: base64\nContent-Disposition: attachment; filename="${file.name}"\n\n${formattedBase64}\n`;
            }
        }

        emlContent += `\n--${boundary}--\n`;

        const safeFileName = fileName.replace(/[<>:"/\\|?*]+/g, '_') + ".eml";
        const fileHandle = await saveFolderHandle.getFileHandle(safeFileName, { create: true });
        const writable = await fileHandle.createWritable();
        
        await writable.write(emlContent);
        await writable.close();
        
        return true;
    } catch (error) {
        console.error(`❌ Failed to save email ${fileName}:`, error);
        return false;
    }
}

function getEmailSignature() {
    const activeUser = window.Workspace.currentUser || "AR Team";
    
    return `
        <br>
        <div style="font-family: Calibri, sans-serif; font-size: 11pt; color: #333;">
            <p style="margin: 0; font-weight: bold; color: #0056b3;">${activeUser}</p>
            <p style="margin: 0;"><strong>Lithko Contracting LLC</strong></p>
        </div>
    `;
}
