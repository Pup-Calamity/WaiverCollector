// js/core/app.js

// --- Global Shared State ---
window.Workspace = {
    dirHandle: null,
    currentUser: null,
    settings: {},
    
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
        burgEmails: []
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
    burgEmails: "Data/MainData/Burg Emails.xlsx",
};

// --- UI Navigation Helpers ---
function switchView(viewId) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
}

function applyTheme(themeStr) {
    const themeToggle = document.getElementById('themeToggle');
    if (themeStr === 'dark') {
        document.body.setAttribute('data-theme', 'dark');
        if(themeToggle) themeToggle.textContent = '☀️';
    } else {
        document.body.removeAttribute('data-theme');
        if(themeToggle) themeToggle.textContent = '🌙';
    }
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

// --- Startup & Auto-Login ---
window.addEventListener('DOMContentLoaded', async () => {
    
    // 1. Initial Theme Check (from local storage)
    if (localStorage.getItem('theme') === 'dark') {
        applyTheme('dark');
    }

    // 2. Folder Connection Check
    try {
        const storedHandle = await getDB('masterARFolder');
        
        if (storedHandle && (await storedHandle.queryPermission({ mode: 'readwrite' })) === 'granted') {
            window.Workspace.dirHandle = storedHandle;
            document.getElementById('navStatus').innerHTML = `🟢 ${storedHandle.name}`;
            
            await populateUserDropdown();
            
            const savedUser = localStorage.getItem('activeUser');
            const savedPin = localStorage.getItem('activePin');
            
            if (savedUser && savedPin) {
                console.log(`Silently logging in ${savedUser}...`);
                
                window.Workspace.settings = await loadUserProfile(savedUser, savedPin);
                window.Workspace.currentUser = savedUser;
                applyTheme(window.Workspace.settings.theme || 'light');
                document.getElementById('welcomeText').textContent = `Welcome, ${savedUser}!`;
                
                switchView('processingWorkspace');
                
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

// --- Theme Toggle Listener ---
const themeToggleBtn = document.getElementById('themeToggle');
if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
        let newTheme = 'light';
        if (document.body.getAttribute('data-theme') === 'dark') {
            applyTheme('light');
            localStorage.setItem('theme', 'light');
        } else {
            applyTheme('dark');
            localStorage.setItem('theme', 'dark');
            newTheme = 'dark';
        }
        
        if (window.Workspace && window.Workspace.currentUser) {
            window.Workspace.settings.theme = newTheme;
            saveUserProfile(window.Workspace.currentUser, window.Workspace.settings)
                .catch(err => console.error("Failed to save theme to profile:", err));
        }
    });
}

// --- Connection Actions ---
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

const changeFolderBtn = document.getElementById('changeFolderBtn');
if (changeFolderBtn) {
    changeFolderBtn.addEventListener('click', async () => {
        try {
            const newHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
            await setDB('masterARFolder', newHandle);
            
            window.Workspace.dirHandle = newHandle;
            document.getElementById('navStatus').innerHTML = `🟢 ${newHandle.name}`;
            window.Workspace.appData = {};
            
            document.getElementById('syncStatusText').textContent = "Status: New folder linked. Waiting for sync...";
            const subtitle = document.querySelector('.hub-section .subtitle');
            if (subtitle) subtitle.textContent = "New workspace connected. Please sync data.";

            alert(`Successfully switched workspace to: ${newHandle.name}`);
        } catch (err) {
            console.warn("Folder change cancelled or failed:", err);
        }
    });
}

// --- Login / Logout Actions ---
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

document.getElementById('loginBtn').addEventListener('click', async () => {
    const user = document.getElementById('userDropdown').value;
    const pin = document.getElementById('userPin').value;
    if (!user || !pin) return alert("Select a profile and enter PIN.");
    
    try {
        window.Workspace.settings = await loadUserProfile(user, pin);
        window.Workspace.currentUser = user;
        
        localStorage.setItem('activeUser', user);
        localStorage.setItem('activePin', pin); 
        
        applyTheme(window.Workspace.settings.theme || 'light');
        document.getElementById('welcomeText').textContent = `Welcome, ${user}!`;
        switchView('processingWorkspace');

        const subtitle = document.querySelector('.hub-section .subtitle');
        subtitle.textContent = "Loading spreadsheet data... ⏳";
        
        await loadDataset(); 
        
        subtitle.textContent = "All data loaded. Select a tool to begin.";
    } catch (error) {
        alert(error.message);
    }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('activeUser');
    localStorage.removeItem('activePin');
    document.getElementById('userPin').value = ''; 
    switchView('authContainer');
});

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

        const subtitle = document.querySelector('.hub-section .subtitle');
        subtitle.textContent = "Loading spreadsheet data... ⏳";
        
        await loadDataset(); 
        
        subtitle.textContent = "All data loaded. Select a tool to begin.";
    } catch (error) {
        alert("Failed to create profile: " + error.message);
    }
});

// --- Manual Sync Action ---
document.getElementById('manualSyncBtn').addEventListener('click', async () => {
    const syncBtn = document.getElementById('manualSyncBtn');
    const statusText = document.getElementById('syncStatusText');
    
    syncBtn.disabled = true;
    syncBtn.textContent = "Syncing... ⏳";
    statusText.textContent = "Status: Reading Excel files...";

    try {
        await loadDataset(); 
        statusText.textContent = `Status: Last synced at ${new Date().toLocaleTimeString()}`;
    } catch (error) {
        statusText.textContent = "Status: Sync failed. Check console.";
        console.error(error);
    }

    syncBtn.disabled = false;
    syncBtn.textContent = "📥 Sync Data from Excel";
});
