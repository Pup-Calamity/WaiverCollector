// dataLoader.js

// dataLoader.js// Helper function to format today's date as MM.DD.YYYY
function getTodayString() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
    const dd = String(today.getDate()).padStart(2, '0');
    return `${mm}.${dd}.${yyyy}`;
}

async function loadDataset() {
    const filePaths = window.WORKSPACE_FILE_PATHS;
    const todayStr = getTodayString(); // e.g., "2026-09-19"

    console.log(`Starting data load for date: ${todayStr}...`);

    const loadTasks = Object.entries(filePaths).map(async ([dataKey, originalPath]) => {
        try {
            // Swap out the [TODAY] token for the actual date
            const targetPath = originalPath.replace('[TODAY]', todayStr);
            
            // Find the file using the dynamic path
            const fileHandle = await getFileByPath(window.Workspace.dirHandle, targetPath);
            
            if (fileHandle) {
                window.Workspace.appData[dataKey] = await extractAndValidateData(fileHandle);
                console.log(`✅ Loaded ${dataKey} from ${targetPath}`);
            } else {
                console.warn(`⚠️ Daily file missing: Could not find ${targetPath}`);
            }
        } catch (error) {
            console.error(`❌ Failed to parse ${originalPath}:`, error.message);
        }
    });

    await Promise.all(loadTasks);
    console.log("Entire database loaded!", window.Workspace.appData);
}

// --- Developer Utility: Generate Header Map ---
async function generateHeaderMap() {
    console.log("Scanning files for headers...");
    const headerMap = {};
    const todayStr = getTodayString(); // Uses your existing mm.dd.yyyy function

    for (const [dataKey, originalPath] of Object.entries(window.WORKSPACE_FILE_PATHS)) {
        try {
            const targetPath = originalPath.replace('[TODAY]', todayStr);
            const fileHandle = await getFileByPath(window.Workspace.dirHandle, targetPath);
            
            if (fileHandle) {
                // Read the file using your existing parser
                const data = await extractAndValidateData(fileHandle);
                
                if (data && data.length > 0) {
                    // Object.keys grabs all the column names from the first row
                    headerMap[dataKey] = Object.keys(data[0]);
                } else {
                    headerMap[dataKey] = ["⚠️ File exists but is empty"];
                }
            } else {
                headerMap[dataKey] = ["❌ File not found"];
            }
        } catch (error) {
            headerMap[dataKey] = [`❌ Error reading file: ${error.message}`];
        }
    }

    console.log("=== COPY AND PASTE THE OUTPUT BELOW ===");
    // Stringify makes it perfectly formatted for copying
    console.log(JSON.stringify(headerMap, null, 4));
    
    return headerMap;
}
