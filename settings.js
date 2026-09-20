// --- Global Shared State ---
window.Workspace = {
    dirHandle: null,
    currentUser: null,
    settings: {},
    
    // Your main data hub for all AR tools
    appData: {
        waiverInvoices: [],
        unpaidInvoices: [],
        invInProcessing: [],
        rejectionNotes: [],
        openAR: [],
        jobInfo: [],
        contractInfo: [],
        templateList: [],
        empInfo: [],
        customerInfo: [],
        vendorInfo: [],
        waivers: [],
        collectionNotes: [],
        nonPaymentList: [],
        WIP: [],
        noticeTracker: [],
        jobNotes: [],
        billingTracker: []
    }
};

window.WORKSPACE_FILE_PATHS = {
    openAR: "Data/DailyUpdateData/Open AR [TODAY].xlsx",
    unpaidInvoices: "Data/DailyUpdateData/Unpaid Invoices [TODAY].xlsx",
    invInProcessing: "Data/DailyUpdateData/In Onbase [TODAY].xlsx",
    rejectionNotes: "Data/DailyUpdateData/Rejection Notes [TODAY].xlsx",
    jobInfo: "Data/DailyUpdateData/Job Address [TODAY].xlsx",
    empInfo: "Data/MainData/Employee Info.xlsx",
    customerInfo: "Data/MainData/GC Info.xlsx",
    templateList: "Data/MainData/Templates.xlsx",
    vendorInfo: "Data/MainData/Vendor Info.xlsx",
    contractInfo: "Data/MainData/Contract Info.xlsx",
    waivers: "Data/MainData/Master Waiver.xlsx",
    collectionNotes: "Data/MainData/Collection Notes.xlsx",
    nonPaymentList: "Data/MainData/TX NPN Tracking.xlsx",
    WIP: "Data/MainData/WIP.xlsx",
    noticeTracker: "Data/MainData/Prelim Tracker.xlsx",
    billingTracker: "Data/MainData/Billing Checklist.xlsx",
    jobNotes: "Data/MainData/Job Notes.xlsx",
    waiverInvoices: "Data/DailyUpdateData/Waiver Invoices.xlsx"
};

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

// --- User Profile Management ---
async function getSettingsFolder(baseDirHandle) {
    return await baseDirHandle.getDirectoryHandle('settings', { create: true });
}

async function populateUserDropdown() {
    const dropdown = document.getElementById('userDropdown');
    dropdown.innerHTML = '<option value="">-- Select Profile --</option>';
    
    try {
        const settingsDir = await getSettingsFolder(window.Workspace.dirHandle);
        for await (const entry of settingsDir.values()) {
            if (entry.kind === 'file' && entry.name.endsWith('.json')) {
                const username = entry.name.replace('.json', '');
                const option = document.createElement('option');
                option.value = username;
                option.textContent = username.charAt(0).toUpperCase() + username.slice(1);
                dropdown.appendChild(option);
            }
        }
    } catch (error) {
        console.log("No settings folder found. Ready for first user.");
    }
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
        pin: pin, // simple 4-digit or text pin
        theme: "dark",
        ...initialPreferences
    };
    
    await saveUserProfile(baseDirHandle, username, newUserConfig);
    return newUserConfig;
}


// --- UI Navigation Helpers ---
function switchView(viewId) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
}

function applyTheme(themeStr) {
    const themeToggle = document.getElementById('themeToggle');
    if (themeStr === 'dark') {
        document.body.setAttribute('data-theme', 'dark');
        themeToggle.textContent = '☀️';
    } else {
        document.body.removeAttribute('data-theme');
        themeToggle.textContent = '🌙';
    }
}
////@@@@@@@@@@@@@
async function setupDirectory(handle) {
    dirHandle = handle;
    
    // Hide the initial connect button
    document.getElementById('connectionCard').style.display = 'none';
    
    // Show the login screen and populate it with team members
    document.getElementById('authContainer').style.display = 'block';
    await populateUserDropdown(dirHandle);
    
    const navStatus = document.getElementById('navStatus');
    if (navStatus) navStatus.textContent = `✅ Connected: ${dirHandle.name}`;
}

window.addEventListener('DOMContentLoaded', async () => {
    try {
        const storedHandle = await getDB('masterARFolder');
        if (storedHandle && (await storedHandle.queryPermission({ mode: 'readwrite' })) === 'granted') {
            window.Workspace.dirHandle = storedHandle;
            document.getElementById('navStatus').innerHTML = `🟢 ${storedHandle.name}`;
            await populateUserDropdown();
            switchView('authContainer');
        }
    } catch (e) {
        console.warn("Could not load stored directory.", e);
    }
});

document.getElementById('connectFolderBtn').addEventListener('click', async () => {
    try {
        const newHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        await setDB('masterARFolder', newHandle);
        window.Workspace.dirHandle = newHandle;
        
        document.getElementById('navStatus').innerHTML = `🟢 ${newHandle.name}`;
        await populateUserDropdown();
        switchView('authContainer');
    } catch (error) {
        if (error.name !== 'AbortError') alert(`Connection failed: ${error.message}`);
    }
});
// --- UI Toggles ---
document.getElementById('showCreateBtn').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('createSection').style.display = 'block';
});
document.getElementById('showLoginBtn').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('createSection').style.display = 'none';
    document.getElementById('loginSection').style.display = 'block';
});
// --- Login Action ---
document.getElementById('loginBtn').addEventListener('click', async () => {
    const user = document.getElementById('userDropdown').value;
    const pin = document.getElementById('userPin').value;
    if (!user || !pin) return alert("Select a profile and enter PIN.");
    
    try {
        window.Workspace.settings = await loadUserProfile(user, pin);
        window.Workspace.currentUser = user;
        
        applyTheme(window.Workspace.settings.theme || 'light');
        document.getElementById('welcomeText').textContent = `Welcome, ${user}!`;
        switchView('processingWorkspace');

        // --- NEW: Trigger Data Load ---
        const subtitle = document.querySelector('.hub-section .subtitle');
        subtitle.textContent = "Loading spreadsheet data... ⏳";
        
        await loadDataset(); // Triggers your function from dataLoader.js
        
        subtitle.textContent = "All data loaded. Select a tool to begin.";
        // ------------------------------
        
    } catch (error) {
        alert(error.message);
    }
});

// --- Create Profile Action ---
document.getElementById('createProfileBtn').addEventListener('click', async () => {
    const newName = document.getElementById('newUsername').value.trim();
    const newPin = document.getElementById('newPin').value.trim();
    if (!newName || !newPin) return alert("Name and PIN required.");
    
    try {
        const newConfig = { username: newName, pin: newPin, theme: 'light' };
        await saveUserProfile(newName, newConfig);
        
        window.Workspace.settings = newConfig;
        window.Workspace.currentUser = newName;
        
        document.getElementById('welcomeText').textContent = `Welcome, ${newName}!`;
        switchView('processingWorkspace');

        // --- NEW: Trigger Data Load ---
        const subtitle = document.querySelector('.hub-section .subtitle');
        subtitle.textContent = "Loading spreadsheet data... ⏳";
        
        await loadDataset(); 
        
        subtitle.textContent = "All data loaded. Select a tool to begin.";
        // ------------------------------

    } catch (error) {
        alert("Failed to create profile: " + error.message);
    }
});

