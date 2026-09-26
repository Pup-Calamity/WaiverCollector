
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

// Prepare Excel Data for Upload (ExcelJS Surgical Update)
async function UpdateExcel(fileHandle, changedRows, uniqueIdKey, sheetName = "Sheet1") {
    try {
        console.log("Surgically updating Excel cells to preserve Tables...");

        const file = await fileHandle.getFile();
        const buffer = await file.arrayBuffer();

        const workbook = new window.ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);

        // --- ANTI-CORRUPTION FIX 1: Delete Calculation Chain ---
        // Forces Excel to rebuild its formula map on next open so it doesn't crash
        delete workbook.calcProperties;

        let worksheet = workbook.getWorksheet(sheetName);
        if (!worksheet) worksheet = workbook.worksheets[0];

        // --- ANTI-CORRUPTION FIX 2: Safe Header Parsing ---
        // Prevents rich-text formatting from hiding header names
        const headerRow = worksheet.getRow(1);
        const headers = {};
        headerRow.eachCell((cell, colNumber) => {
            let cellVal = cell.value;
            if (cellVal && typeof cellVal === 'object' && cellVal.richText) {
                cellVal = cellVal.richText.map(t => t.text).join('');
            }
            if (cellVal) headers[String(cellVal).trim()] = colNumber;
        });

        if (!headers[uniqueIdKey]) {
            throw new Error(`Unique ID column "${uniqueIdKey}" not found. Found: ${Object.keys(headers).join(', ')}`);
        }

        const activeUser = window.Workspace.currentUser || "Unknown User";
        const now = new Date();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const yyyy = now.getFullYear();
        const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const timestampString = `${mm}/${dd}/${yyyy} ${timeString}`;

        changedRows.forEach(changedRow => {
            changedRow["Last Updated"] = timestampString;
            changedRow["Updated By"] = activeUser;

            const targetId = String(changedRow[uniqueIdKey]).trim();
            let rowIndexToUpdate = -1;

            // --- ANTI-CORRUPTION FIX 3: Bulletproof ID Matching ---
            const idCol = headers[uniqueIdKey];
            worksheet.getColumn(idCol).eachCell((cell, rowNum) => {
                if (rowNum > 1) {
                    let cellVal = cell.value;
                    if (cellVal && typeof cellVal === 'object' && cellVal.richText) {
                        cellVal = cellVal.richText.map(t => t.text).join('');
                    } else if (cellVal && typeof cellVal === 'object' && cellVal.result) {
                        cellVal = cellVal.result; // Handle formula results
                    }
                    
                    if (String(cellVal).trim() === targetId) {
                        rowIndexToUpdate = rowNum;
                    }
                }
            });

            if (rowIndexToUpdate !== -1) {
                // UPDATE EXISTING ROW (Safe for Tables)
                const excelRow = worksheet.getRow(rowIndexToUpdate);
                for (const [key, val] of Object.entries(changedRow)) {
                    if (headers[key]) {
                        excelRow.getCell(headers[key]).value = val;
                    }
                }
                excelRow.commit();
            } else {
                // APPEND NEW ROW (Only triggers if ID is genuinely missing)
                const newRowObj = [];
                for (const [key, colNum] of Object.entries(headers)) {
                    newRowObj[colNum] = changedRow[key] !== undefined ? changedRow[key] : "";
                }
                worksheet.addRow(newRowObj).commit();
            }
        });

        // Write the clean, uncorrupted buffer back to disk
        const outBuffer = await workbook.xlsx.writeBuffer();
        const writableStream = await fileHandle.createWritable();
        await writableStream.write(outBuffer);
        await writableStream.close();

        console.log("✅ Cells updated successfully. Table & column structure fully preserved!");
    } catch (error) {
        console.error("Failed to update Excel:", error);
    }
}