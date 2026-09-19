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
