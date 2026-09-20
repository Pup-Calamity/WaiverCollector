
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

//Prepare Excel Data for Upload
async function UpdateExcel(fileHandle, changedRows, uniqueIdKey, sheetName = "Sheet1") {
    try {
        console.log("Fetching the absolute latest version of the file...");
        
        // 1. Re-read the file from disk right now, catching anyone else's recent changes
        const latestData = await extractAndValidateData(fileHandle); 
        
        // 2. Loop through only the rows our web app changed
        changedRows.forEach(changedRow => {
            // Find the matching row in the fresh data using our Unique ID (e.g., "Contract Number")
            const rowIndex = latestData.findIndex(row => row[uniqueIdKey] === changedRow[uniqueIdKey]);
            
            if (rowIndex !== -1) {
                // Object.assign merges our changes into the existing row, 
                // leaving any other columns someone else might have touched completely alone!
                Object.assign(latestData[rowIndex], changedRow);
            } else {
                // Optional: If the row doesn't exist, it must be new, so add it
                latestData.push(changedRow);
            }
        });
        
        // 3. Write this freshly merged data back to the file
        console.log("Saving merged data...");
        await writeDataToExcel(fileHandle, latestData, sheetName);
        console.log("✅ Smart merge complete!");
        
    } catch (error) {
        console.error("Failed to merge and save:", error);
    }
}
//Update the excel sheet
async function writeDataToExcel(fileHandle, jsonData, sheetName = "Sheet1") {
    try {
        // 1. Convert the JavaScript array back into a SheetJS worksheet
        const newWorksheet = XLSX.utils.json_to_sheet(jsonData);
        
        // 2. Create a new blank workbook and attach the worksheet
        const newWorkbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(newWorkbook, newWorksheet, sheetName);
        
        // 3. Package the workbook into an ArrayBuffer (binary data)
        const excelBuffer = XLSX.write(newWorkbook, { bookType: 'xlsx', type: 'array' });
        
        // 4. Request write access from the File System Access API
        // This creates a temporary swap file to ensure safe overwriting
        const writableStream = await fileHandle.createWritable();
        
        // 5. Write the data and close the stream to apply the changes
        await writableStream.write(excelBuffer);
        await writableStream.close();
        
        return true;
    } catch (error) {
        console.error(`Failed to write to ${fileHandle.name}:`, error);
        throw error;
    }
}
