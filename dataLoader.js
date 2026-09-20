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
