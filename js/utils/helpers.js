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

// --- Date Utilities ---
function getTodayString() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${mm}.${dd}.${yyyy}`;
}

function calculateWaiverDates(targetMonth, targetYear, dueDayOffset, throughDay) {
    const monthIndex = parseInt(targetMonth) - 1; 
    const endOfTargetMonth = new Date(targetYear, monthIndex + 1, 0);
    const daysToAdd = dueDayOffset ? parseInt(dueDayOffset) : 45;
    
    const dueDate = new Date(endOfTargetMonth);
    dueDate.setDate(dueDate.getDate() + daysToAdd);
    const dueDateStr = dueDate.toLocaleDateString();

    let throughPeriodStr = "";
    if (throughDay) {
        const tDay = parseInt(throughDay);
        const periodEnd = new Date(targetYear, monthIndex, tDay);
        const periodStart = new Date(targetYear, monthIndex - 1, tDay + 1);
        
        throughPeriodStr = `${periodStart.toLocaleDateString()} to ${periodEnd.toLocaleDateString()}`;
    } else {
        const periodStart = new Date(targetYear, monthIndex, 1);
        const periodEnd = new Date(targetYear, monthIndex + 1, 0); 
        
        throughPeriodStr = `${periodStart.toLocaleDateString()} to ${periodEnd.toLocaleDateString()}`;
    }

    return {
        dueDate: dueDateStr,
        throughPeriod: throughPeriodStr
    };
}

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
