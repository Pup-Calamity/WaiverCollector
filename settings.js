const defaultSettings = {
    theme: "dark",
    waiverSubfolder: "Compliance/Vendor Waivers",
    requireSignatures: true
};

async function loadConfig(baseDirHandle) {
    try {
        // Attempt to find and read the local config file
        const fileHandle = await baseDirHandle.getFileHandle('config.json');
        const file = await fileHandle.getFile();
        const textData = await file.text(); // Read raw text, no SheetJS needed for JSON
        
        return JSON.parse(textData);
    } catch (error) {
        // If the file doesn't exist (e.g., first time setup), return the defaults
        console.log("No custom config found. Using defaults.");
        return defaultSettings;
    }
}

async function saveConfig(baseDirHandle, settingsObject) {
    try {
        // The { create: true } flag makes the file if it doesn't exist yet
        const fileHandle = await baseDirHandle.getFileHandle('config.json', { create: true });
        
        const writable = await fileHandle.createWritable();
        // Convert the JS object to a nicely formatted JSON string
        await writable.write(JSON.stringify(settingsObject, null, 4));
        await writable.close();
        
        console.log("✅ Settings saved locally!");
    } catch (error) {
        console.error("Failed to save config:", error);
    }
}
