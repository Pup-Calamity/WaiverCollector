// Global variable to track who is currently logged in
let currentUser = null;

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
    const selectedUser = document.getElementById('userDropdown').value;
    const pin = document.getElementById('userPin').value;
    
    if (!selectedUser || !pin) {
        alert("Please select a profile and enter your PIN.");
        return;
    }
    
    try {
        appSettings = await loadUserProfile(dirHandle, selectedUser, pin);
        currentUser = selectedUser;
        
        // Success! Hide auth, show main workspace
        document.getElementById('authContainer').style.display = 'none';
        document.getElementById('processingWorkspace').style.display = 'block';
        console.log(`Welcome back, ${currentUser}!`);
        
    } catch (error) {
        alert(error.message); // e.g., "Incorrect passcode."
    }
});

// --- Create Profile Action ---
document.getElementById('createProfileBtn').addEventListener('click', async () => {
    const newName = document.getElementById('newUsername').value.trim();
    const newPin = document.getElementById('newPin').value.trim();
    
    if (!newName || !newPin) {
        alert("Please enter a name and a PIN.");
        return;
    }
    
    try {
        // Create the user and immediately log them in
        appSettings = await createUserProfile(dirHandle, newName, newPin);
        currentUser = newName;
        
        document.getElementById('authContainer').style.display = 'none';
        document.getElementById('processingWorkspace').style.display = 'block';
        console.log(`Profile created! Welcome to the team, ${currentUser}!`);
        
    } catch (error) {
        alert("Failed to create profile: " + error.message);
    }
});

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

// 1. Ensure the settings subfolder exists, or create it
async function getSettingsFolder(baseDirHandle) {
    return await baseDirHandle.getDirectoryHandle('settings', { create: true });
}

// 2. Scan the settings folder and populate the dropdown list
async function populateUserDropdown(baseDirHandle) {
    const dropdown = document.getElementById('userDropdown');
    dropdown.innerHTML = '<option value="">-- Choose Profile --</option>';
    
    try {
        const settingsDir = await getSettingsFolder(baseDirHandle);
        
        // Loop through all the .json files in the settings folder
        for await (const entry of settingsDir.values()) {
            if (entry.kind === 'file' && entry.name.endsWith('.json')) {
                const username = entry.name.replace('.json', '');
                
                const option = document.createElement('option');
                option.value = username;
                // Capitalize the first letter so it looks nice in the UI
                option.textContent = username.charAt(0).toUpperCase() + username.slice(1); 
                dropdown.appendChild(option);
            }
        }
    } catch (error) {
        console.log("No settings folder yet. Ready for the first user!");
    }
}

// 3. Load a specific user's config file
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

// 4. Save the current user's profile changes
async function saveUserProfile(baseDirHandle, username, settingsObject) {
    const settingsDir = await getSettingsFolder(baseDirHandle);
    const fileName = `${username.toLowerCase()}.json`;
    
    const fileHandle = await settingsDir.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    
    await writable.write(JSON.stringify(settingsObject, null, 4));
    await writable.close();
    console.log(`✅ Saved settings for ${username}`);
}
