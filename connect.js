// --- Native Database Setup (No external libraries) ---
const dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open('WaiverIO_DB', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('keyval');
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = () => reject(req.error);
});
async function get(key) {
    const db = await dbPromise;
    return new Promise(resolve => {
        const req = db.transaction('keyval').objectStore('keyval').get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
async function set(key, val) {
    const db = await dbPromise;
    return new Promise(resolve => {
        const tx = db.transaction('keyval', 'readwrite');
        tx.objectStore('keyval').put(val, key);
        tx.oncomplete = () => resolve();
        req.onerror = () => reject(req.error);
    });
}
// ----------------------------------------------------

let dirHandle;
const output = document.getElementById('output');

async function verifyPermission(fileHandle) {
    if ((await fileHandle.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
    if ((await fileHandle.requestPermission({ mode: 'readwrite' })) === 'granted') return true;
    return false;
}

// UI Toggles
async function setupDirectory(handle) {
    dirHandle = handle;
    
    // Hide the connection card, show the workspace
    document.getElementById('connectionCard').style.display = 'none';
    document.getElementById('processingWorkspace').style.display = 'block';
    
    // Update the Nav bar status
    const navStatus = document.getElementById('navStatus');
    if (navStatus) navStatus.textContent = `✅ Connected: ${dirHandle.name}`;
}

window.addEventListener('DOMContentLoaded', async () => {
    try {
        const storedHandle = await get('masterARFolder');
        if (storedHandle && (await storedHandle.queryPermission({ mode: 'readwrite' })) === 'granted') {
            await setupDirectory(storedHandle);
        }
    } catch (e) {
        console.warn("Could not load stored directory handle.", e);
    }
});

document.getElementById('connectFolderBtn').addEventListener('click', async () => {
    try {
        const storedHandle = await get('masterARFolder');
        if (storedHandle && await verifyPermission(storedHandle)) {
            await setupDirectory(storedHandle);
            return;
        }
        const newHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        await set('masterARFolder', newHandle);
        await setupDirectory(newHandle);
    } catch (error) {
        if (error.name !== 'AbortError') {
            alert(`Connection failed: ${error.message}`);
        }
    }
});
