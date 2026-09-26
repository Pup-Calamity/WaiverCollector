
//First Get Find the Excel Data
async function findExcelFile(baseDirHandle, fileNameOrKeyword) {
    // Attempt 1: Look for the exact file name
    try {
        return await baseDirHandle.getFileHandle(fileNameOrKeyword);
    } catch (error) {
        // Attempt 2: If exact match fails, scan for a partial keyword match
        const searchStr = fileNameOrKeyword.replace('.xlsx', '').toLowerCase();
        
        for await (const entry of baseDirHandle.values()) {
            if (entry.kind === 'file' && 
                entry.name.toLowerCase().includes(searchStr) && 
                entry.name.endsWith('.xlsx')) {
                return entry;
            }
        }
    }
    // Return null if the file is completely missing
    return null; 
}

async function getFileByPath(baseHandle, fullPath) {
    // Split the path (e.g., "Folder/Subfolder/file.xlsx")
    const parts = fullPath.split('/').filter(p => p.trim() !== '');
    const fileName = parts.pop(); // The last item is the file name
    let currentDir = baseHandle;

    try {
        // Walk down the folders
        for (const folderName of parts) {
            currentDir = await currentDir.getDirectoryHandle(folderName);
        }
        // Grab the file
        return await currentDir.getFileHandle(fileName);
    } catch (error) {
        return null; // Return null if the path or file is broken
    }
}

async function getSubfolderHandle(baseHandle, folderPath) {
    // If no path is provided, just return the main folder
    if (!folderPath || folderPath === '') return baseHandle;
    
    // Split the path by slashes and remove any empty spaces
    const folders = folderPath.split('/').filter(f => f.trim() !== '');
    let currentHandle = baseHandle;
    
    for (const folderName of folders) {
        try {
            // Get the handle for the next folder down the chain
            currentHandle = await currentHandle.getDirectoryHandle(folderName, { create: false });
        } catch (error) {
            console.warn(`Could not find subfolder: "${folderName}" in path.`, error);
            return null; 
        }
    }
    
    return currentHandle; // Returns the handle of the final target folder
}

//Then Validate it
async function extractAndValidateData(fileHandle, expectedHeaders = []) {
    // 1. Get the raw file data
    const file = await fileHandle.getFile();
    const buffer = await file.arrayBuffer();
    
    // 2. Parse with SheetJS
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    
    // 3. Convert to an array of objects (Keys are headers, values are row data)
    const jsonData = XLSX.utils.sheet_to_json(worksheet);
    
    // 4. Validate Headers (if expected headers were provided)
    if (expectedHeaders.length > 0 && jsonData.length > 0) {
        const actualHeaders = Object.keys(jsonData[0]);
        const isValid = expectedHeaders.every(header => actualHeaders.includes(header));
        
        if (!isValid) {
            throw new Error(`Header mismatch. Expected headers not found in ${fileHandle.name}`);
        }
    }
    
    return jsonData;
}

// Prepare Excel Data for Upload
async function UpdateExcel(fileHandle, changedRows, uniqueIdKey, sheetName = "Sheet1") {
    try {
        console.log("Fetching the absolute latest version of the file...");
        
        // 1. Re-read the file from disk right now
        const latestData = await extractAndValidateData(fileHandle); 
        
        // --- NEW: Grab the current user and format the date as mm.dd.yyyy ---
        const activeUser = window.Workspace.currentUser || "Unknown User";
        
        const today = new Date();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        const yyyy = today.getFullYear();
        const todayString = `${mm}/${dd}/${yyyy}`;
        // --------------------------------------------------------------------
        
        // 2. Loop through only the rows our web app changed
        changedRows.forEach(changedRow => {
            
            // -- -Auto-stamp the audit trail before merging ---
            changedRow["Last Updated"] = todayString;
            changedRow["Updated By"] = activeUser;
            // ------------------------------------------------------

            // Find the matching row in the fresh data using our Unique ID 
            const rowIndex = latestData.findIndex(row => row[uniqueIdKey] === changedRow[uniqueIdKey]);
            
            if (rowIndex !== -1) {
                // Object.assign merges our changes (and our new timestamps) into the existing row
                Object.assign(latestData[rowIndex], changedRow);
            } else {
                // If the row doesn't exist, add it
                latestData.push(changedRow);
            }
        });
        
        // 3. Write this freshly merged data back to the file
        console.log("Saving merged data...");
        
        await writeDataToExcel(fileHandle, latestData, sheetName);
        console.log("✅ Smart merge and audit stamp complete!");
        
    } catch (error) {
        console.error("Failed to merge and save:", error);
    }
}

// Prepare Excel Data for Upload (Safe XML Injection)
async function UpdateExcel(fileHandle, changedRows, uniqueIdKey, sheetName = "Sheet1") {
    try {
        console.log("Using XlsxPopulate to safely inject cell data...");

        const file = await fileHandle.getFile();
        const buffer = await file.arrayBuffer();

        // 1. Load the workbook (This library preserves the original XML verbatim)
        const workbook = await window.XlsxPopulate.fromDataAsync(buffer);
        
        // 2. Find the sheet
        let sheet = workbook.sheet(sheetName);
        if (!sheet) sheet = workbook.sheet(0); // Fallback to first sheet

        // 3. Map the exact column headers
        const headers = {};
        let colNum = 1;
        while (colNum <= 100) { // Scan up to 100 columns for headers
            const cellVal = sheet.cell(1, colNum).value();
            if (cellVal === undefined || cellVal === null || cellVal === "") break;
            headers[String(cellVal).trim()] = colNum;
            colNum++;
        }

        if (!headers[uniqueIdKey]) {
            throw new Error(`Unique ID column "${uniqueIdKey}" not found.`);
        }

        // --- Audit Trail Setup ---
        const activeUser = window.Workspace.currentUser || "Unknown User";
        const now = new Date();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const yyyy = now.getFullYear();
        const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const timestampString = `${mm}/${dd}/${yyyy} ${timeString}`;

        // 4. Process changes row by row
        changedRows.forEach(changedRow => {
            changedRow["Last Updated"] = timestampString;
            changedRow["Updated By"] = activeUser;

            const targetId = String(changedRow[uniqueIdKey]).trim();
            let rowIndexToUpdate = -1;

            // Scan the ID column to find which row to update
            const idCol = headers[uniqueIdKey];
            let searchRow = 2;
            
            while (searchRow < 2000) { // Safe limit to prevent infinite loops
                const cellVal = sheet.cell(searchRow, idCol).value();
                if (String(cellVal).trim() === targetId) {
                    rowIndexToUpdate = searchRow;
                    break;
                }
                searchRow++;
            }

            if (rowIndexToUpdate !== -1) {
                // UPDATE EXISTING ROW
                for (const [key, val] of Object.entries(changedRow)) {
                    if (headers[key]) {
                        sheet.cell(rowIndexToUpdate, headers[key]).value(val);
                    }
                }
            } else {
                // APPEND NEW ROW (Find the first completely blank row)
                let emptyRow = 2;
                while (sheet.cell(emptyRow, idCol).value() !== undefined && sheet.cell(emptyRow, idCol).value() !== null) {
                    emptyRow++;
                }
                for (const [key, colNumber] of Object.entries(headers)) {
                    const val = changedRow[key] !== undefined ? changedRow[key] : "";
                    sheet.cell(emptyRow, colNumber).value(val);
                }
            }
        });

        // 5. Output the buffer and overwrite the file
        const outBuffer = await workbook.outputAsync();
        const writableStream = await fileHandle.createWritable();
        await writableStream.write(outBuffer);
        await writableStream.close();

        console.log("✅ Cells injected successfully. Tables and AutoFilters left untouched!");
    } catch (error) {
        console.error("Failed to update Excel:", error);
    }
}