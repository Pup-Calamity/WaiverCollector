
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
async function writeDataToExcel(fileHandle, jsonData, sheetName = "Sheet1") {
    try {
        // 1. Read the existing file back into memory so we keep its workbook structure & tables
        const file = await fileHandle.getFile();
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        
        // 2. Determine the correct target sheet name
        let targetSheetName = sheetName;
        if (!workbook.Sheets[targetSheetName]) {
            targetSheetName = workbook.SheetNames[0] || "Sheet1";
        }
        
        const worksheet = workbook.Sheets[targetSheetName];

        // 3. Clear out old cell data safely
        // (We blank the range so old ghost rows don't linger if the dataset shrinks)
        if (worksheet['!ref']) {
            const range = XLSX.utils.decode_range(worksheet['!ref']);
            for (let R = range.s.r; R <= range.e.r; ++R) {
                for (let C = range.s.c; C <= range.e.c; ++C) {
                    const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
                    delete worksheet[cellAddress];
                }
            }
        }

        // 4. In-place update: Write the new JSON array directly into the existing sheet
        XLSX.utils.sheet_add_json(worksheet, jsonData, { skipHeader: false, origin: "A1" });

        // 5. Package and write back out while preserving original table/workbook XML structure
        const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        
        const writableStream = await fileHandle.createWritable();
        await writableStream.write(excelBuffer);
        await writableStream.close();
        
        return true;
    } catch (error) {
        console.error(`Failed to write to ${fileHandle.name}:`, error);
        throw error;
    }
}
