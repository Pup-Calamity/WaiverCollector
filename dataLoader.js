// dataLoader.js

// dataLoader.js

async function loadDataset() {
    // Grab the hardcoded master dictionary instead of user settings
    const filePaths = window.WORKSPACE_FILE_PATHS;

    console.log("Starting parallel data load from strict paths...");

    const loadTasks = Object.entries(filePaths).map(async ([dataKey, pathStr]) => {
        try {
            // Find the file using the strict path
            const fileHandle = await getFileByPath(window.Workspace.dirHandle, pathStr);
            
            if (fileHandle) {
                window.Workspace.appData[dataKey] = await extractAndValidateData(fileHandle);
                console.log(`✅ Loaded ${dataKey}`);
            } else {
                // If it's missing, tell them exactly where it's supposed to be
                console.warn(`⚠️ File missing: Expected to find ${pathStr}`);
            }
        } catch (error) {
            console.error(`❌ Failed to parse ${pathStr}:`, error.message);
        }
    });

    // Fire all tasks simultaneously
    await Promise.all(loadTasks);

    console.log("Entire database loaded!", window.Workspace.appData);
}
