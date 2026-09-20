// js/core/storage.js

// --- Native Database Setup (IndexedDB for remembering the folder) ---
const dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open('WaiverIO_DB', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('keyval');
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = () => reject(req.error);
});

async function getDB(key) {
    const db = await dbPromise;
    return new Promise((resolve, reject) => {
        const req = db.transaction('keyval').objectStore('keyval').get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function setDB(key, val) {
    const db = await dbPromise;
    return new Promise((resolve, reject) => {
        const tx = db.transaction('keyval', 'readwrite');
        tx.objectStore('keyval').put(val, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

// --- File System & Permissions ---
async function verifyPermission(fileHandle) {
    if ((await fileHandle.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
    if ((await fileHandle.requestPermission({ mode: 'readwrite' })) === 'granted') return true;
    return false;
}

// --- User Profile Management (File I/O) ---
async function getSettingsFolder(baseDirHandle) {
    return await baseDirHandle.getDirectoryHandle('settings', { create: true });
}

async function loadUserProfile(username, password) {
    const settingsDir = await getSettingsFolder(window.Workspace.dirHandle);
    const fileHandle = await settingsDir.getFileHandle(`${username.toLowerCase()}.json`);
    const file = await fileHandle.getFile();
    const userData = JSON.parse(await file.text());
    
    if (userData.pin && userData.pin !== password) throw new Error("Incorrect passcode.");
    return userData;
}

async function saveUserProfile(username, settingsObject) {
    const settingsDir = await getSettingsFolder(window.Workspace.dirHandle);
    const fileHandle = await settingsDir.getFileHandle(`${username.toLowerCase()}.json`, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(settingsObject, null, 4));
    await writable.close();
}

async function createUserProfile(baseDirHandle, username, pin, initialPreferences = {}) {
    const settingsDir = await getSettingsFolder(baseDirHandle);
    const fileName = `${username.toLowerCase()}.json`;
    
    const newUserConfig = {
        username: username,
        pin: pin, 
        theme: "dark",
        ...initialPreferences
    };
    
    await saveUserProfile(username, newUserConfig); // Fixed: Removed baseDirHandle from args based on your saveUserProfile definition
    return newUserConfig;
}
