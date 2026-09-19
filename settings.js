// 1. Ensure the settings subfolder exists, or create it
async function getSettingsFolder(baseDirHandle) {
    return await baseDirHandle.getDirectoryHandle('settings', { create: true });
}

// 2. Load a specific user's config file
async function loadUserProfile(baseDirHandle, username, password) {
    try {
        const settingsDir = await getSettingsFolder(baseDirHandle);
        const fileName = `${username.toLowerCase()}.json`;
        
        const fileHandle = await settingsDir.getFileHandle(fileName);
        const file = await fileHandle.getFile();
        const userData = JSON.parse(await file.text());
        
        // Simple light verification (not military grade, but keeps files separate)
        if (userData.pin && userData.pin !== password) {
            throw new Error("Incorrect passcode.");
        }
        
        return userData;
    } catch (error) {
        if (error.name === "NotFoundError") {
            throw new Error("User profile not found.");
        }
        throw error;
    }
}

// 3. Save the current user's profile changes
async function saveUserProfile(baseDirHandle, username, settingsObject) {
    const settingsDir = await getSettingsFolder(baseDirHandle);
    const fileName = `${username.toLowerCase()}.json`;
    
    const fileHandle = await settingsDir.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    
    await writable.write(JSON.stringify(settingsObject, null, 4));
    await writable.close();
    console.log(`✅ Saved settings for ${username}`);
}
