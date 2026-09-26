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
        billingTracker: [],
        WaiverReviewQueue: [],
        WaiverEmails: [],
        BurgList: []
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
    waiverInvoices: "Data/DailyUpdateData/Waiver Invoices.xlsx",
    WaiverReviewQueue: "Data/MainData/WaiverReviewQueue.xlsx",
    WaiverEmails: "Data/MainData/Waiver Emails.xlsx",
    BurgList: "Data/MainData/Burg Emails.xlsx"
};
// --- Native Database Setup (IndexedDB for remembering the folder) ---
const dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open('WaiverIO_DB', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('keyval');
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = () => reject(req.error);
});

window.addEventListener('DOMContentLoaded', async () => {
    try {
        const storedHandle = await getDB('masterARFolder');
        
        if (storedHandle && (await storedHandle.queryPermission({ mode: 'readwrite' })) === 'granted') {
            window.Workspace.dirHandle = storedHandle;
            document.getElementById('navStatus').innerHTML = `🟢 ${storedHandle.name}`;
            
            await populateUserDropdown();
            
            // --- Auto-Login Sequence ---
            const savedUser = localStorage.getItem('activeUser');
            const savedPin = localStorage.getItem('activePin');
            
            if (savedUser && savedPin) {
                console.log(`Silently logging in ${savedUser}...`);
                
                window.Workspace.settings = await loadUserProfile(savedUser, savedPin);
                window.Workspace.currentUser = savedUser;
                applyTheme(window.Workspace.settings.theme || 'light');
                document.getElementById('welcomeText').textContent = `Welcome, ${savedUser}!`;
                
                switchView('processingWorkspace');
                
                // --- SKIP DATA LOAD ON REFRESH ---
                const subtitle = document.querySelector('.hub-section .subtitle');
                subtitle.textContent = "Ready. (Data will auto-sync when a tool is opened).";
            } else {
                switchView('authContainer');
            }
        }
    } catch (e) {
        console.warn("Could not load stored directory.", e);
    }
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
        
        // Save session
        localStorage.setItem('activeUser', user);
        localStorage.setItem('activePin', pin); 
        
        applyTheme(window.Workspace.settings.theme || 'light');
        document.getElementById('welcomeText').textContent = `Welcome, ${user}!`;
        switchView('processingWorkspace');

        // --- LOAD DATA ONCE AT LOGIN ---
        const subtitle = document.querySelector('.hub-section .subtitle');
        subtitle.textContent = "Loading spreadsheet data... ⏳";
        
        await loadDataset(); 
        
        subtitle.textContent = "All data loaded. Select a tool to begin.";
        
    } catch (error) {
        alert(error.message);
    }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
    // Clear the saved memory
    localStorage.removeItem('activeUser');
    localStorage.removeItem('activePin');
    // Kick them back to the login screen
    document.getElementById('userPin').value = ''; // Clear the password field
    switchView('authContainer');
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

document.getElementById('manualSyncBtn').addEventListener('click', async () => {
    const syncBtn = document.getElementById('manualSyncBtn');
    const statusText = document.getElementById('syncStatusText');
    
    syncBtn.disabled = true;
    syncBtn.textContent = "Syncing... ⏳";
    statusText.textContent = "Status: Reading Excel files...";

    try {
        await loadDataset(); // Your master data loader
        statusText.textContent = `Status: Last synced at ${new Date().toLocaleTimeString()}`;
    } catch (error) {
        statusText.textContent = "Status: Sync failed. Check console.";
        console.error(error);
    }

    syncBtn.disabled = false;
    syncBtn.textContent = "📥 Sync Data from Excel";
});

// --- Change Folder Logic ---
const changeFolderBtn = document.getElementById('changeFolderBtn');
if (changeFolderBtn) {
    changeFolderBtn.addEventListener('click', async () => {
        try {
            // 1. Open the file picker for the user to select a new folder
            const newHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
            
            // 2. Save the new handle to IndexedDB
            // Note: If your app uses a different function like saveDirectoryHandle(), swap it here!
            if (typeof setDB === 'function') {
                await setDB('masterARFolder', newHandle);
            } else {
                console.warn("Make sure to save this handle to your IndexedDB setup!");
            }

            // 3. Update the live workspace variables
            window.Workspace.dirHandle = newHandle;
            document.getElementById('navStatus').innerHTML = `🟢 ${newHandle.name}`;
            
            // 4. Wipe the old data from memory so files don't mix
            window.Workspace.appData = {};
            
            // 5. Update UI to prompt a fresh sync
            document.getElementById('syncStatusText').textContent = "Status: New folder linked. Waiting for sync...";
            const subtitle = document.querySelector('.hub-section .subtitle');
            if (subtitle) subtitle.textContent = "New workspace connected. Please sync data.";

            alert(`Successfully switched workspace to: ${newHandle.name}`);
            
        } catch (err) {
            console.warn("Folder change cancelled or failed:", err);
        }
    });
}
