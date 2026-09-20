// waiverTool.js

// --- Waiver Key Generator ---
function generateWaiverKey(jobId, vendorId, month, year) {
    // 1. Clean the inputs (removes accidental spaces and ensures they are strings)
    const jId = String(jobId).trim();
    const vId = String(vendorId).trim();
    const m = String(month).trim();
    const y = String(year).trim();
    
    // 2. Build the base string: e.g., "J-101V-500Sep2026"
    const baseKey = `${jId}${vId}${m}${y}`;
    
    // 3. Look at your currently loaded waivers to find matches
    const existingWaivers = window.Workspace.appData.waivers || [];
    
    // 4. Count how many times this EXACT combination already exists
    const matchingCount = existingWaivers.filter(w => {
        return String(w["Job ID"]).trim() === jId &&
               String(w["Vendor ID"]).trim() === vId &&
               String(w["Month"]).trim() === m &&
               String(w["Year"]).trim() === y;
    }).length;
    
    // 5. The new suffix is the current count + 1 (Starts at 1, increments if duplicates exist)
    const nextNumber = matchingCount + 1;
    
    // 6. Return the final composite key: e.g., "J-101V-500Sep20261"
    return `${baseKey}${nextNumber}`;
}

// --- Navigation ---
document.getElementById('launchWaiverToolBtn').addEventListener('click', () => {
    switchView('waiverToolView');
    renderWaiverTable(); // We will build this next!
});

document.getElementById('backToHubBtn').addEventListener('click', () => {
    switchView('processingWorkspace');
});
// Inside waiverTool.js

function renderWaiverTable() {
    const tbody = document.getElementById('waiverTableBody');
    tbody.innerHTML = ''; // Clear out the "No data loaded" message
    
    // Grab the data from the global hub
    const waivers = window.Workspace.appData.waivers;
    
    if (!waivers || waivers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="padding: 20px; text-align: center;">No waivers found in the database.</td></tr>`;
        return;
    }

    // Loop through the data and build the HTML rows
    waivers.forEach(waiver => {
        // Determine status based on whether "Received Date" has a value
        const isReceived = waiver["Received Date"] && waiver["Received Date"].trim() !== "";
        const statusBadge = isReceived 
            ? `<span style="background: #dcfce7; color: #166534; padding: 4px 8px; border-radius: 6px; font-size: 0.85em; font-weight: bold;">Received</span>`
            : `<span style="background: #fef08a; color: #854d0e; padding: 4px 8px; border-radius: 6px; font-size: 0.85em; font-weight: bold;">Pending</span>`;

        const tr = document.createElement('tr');
        tr.style.borderBottom = "1px solid var(--border-color)";
        
        tr.innerHTML = `
            <td style="padding: 15px; font-weight: 500;">${waiver["Job ID"] || '-'}</td>
            <td style="padding: 15px;">${waiver["Vendor ID"] || '-'}</td>
            <td style="padding: 15px;">${waiver["Waiver Month"] || '-'}</td>
            <td style="padding: 15px;">${waiver["Sent Date"] || '-'}</td>
            <td style="padding: 15px;">${statusBadge}</td>
            <td style="padding: 15px;">
                <button class="action-btn" onclick="openWaiverDetails('${waiver["Waiver ID"]}')" 
                        style="background: transparent; border: 1px solid var(--brand-color); color: var(--brand-color); padding: 6px 12px; border-radius: 6px; cursor: pointer;">
                    Review
                </button>
            </td>
        `;
        
        tbody.appendChild(tr);
    });
}

// Dummy function for the Review button (we will expand this later)
function openWaiverDetails(waiverId) {
    console.log(`Opening details for Waiver: ${waiverId}`);
    // Here we can pop up a modal that joins the Vendor Name and Job Name for a full review!
}
