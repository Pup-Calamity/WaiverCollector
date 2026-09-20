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
                // Read the file manually to bypass the empty-data check
                const file = await fileHandle.getFile();
                const buffer = await file.arrayBuffer();
                const workbook = XLSX.read(buffer, { type: 'array' });
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                
                // { header: 1 } forces it to return an array of raw rows. 
                // allRows[0] will be your header row, even if there's no data below it!
                const allRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                
                if (allRows.length > 0 && allRows[0].length > 0) {
                    headerMap[dataKey] = allRows[0];
                } else {
                    headerMap[dataKey] = ["⚠️ Completely blank sheet (not even headers)"];
                }
            } else {
                headerMap[dataKey] = ["❌ File not found"];
            }
        } catch (error) {
            headerMap[dataKey] = [`❌ Error reading file: ${error.message}`];
        }
    }

    console.log("=== COPY AND PASTE THE OUTPUT BELOW ===");
    console.log(JSON.stringify(headerMap, null, 4));
    
    return headerMap;
}
