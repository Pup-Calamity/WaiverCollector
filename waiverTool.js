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

// waiverTool.js

// --- Navigation & Setup ---
window.addEventListener('DOMContentLoaded', () => {
    const launchBtn = document.getElementById('launchWaiverToolBtn');
    if (launchBtn) {
        launchBtn.addEventListener('click', () => {
            switchView('waiverToolView');
            populateMonthDropdown(); // Build the dropdown options
            renderWaiverTable();     // Draw the table
        });
    }

    const backBtn = document.getElementById('backToHubBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            switchView('processingWorkspace');
        });
    }

    // --- NEW: Attach live event listeners to filters ---
    document.getElementById('waiverSearch').addEventListener('input', renderWaiverTable);
    document.getElementById('waiverStatusFilter').addEventListener('change', renderWaiverTable);
    document.getElementById('waiverMonthFilter').addEventListener('change', renderWaiverTable);
});

// --- Dynamic Filter Population ---
function populateMonthDropdown() {
    const monthDropdown = document.getElementById('waiverMonthFilter');
    monthDropdown.innerHTML = '<option value="ALL">All Months</option>'; 

    const waivers = window.Workspace.appData.waivers;
    if (!waivers) return;

    // Dynamically combine Month and Year, filter out any blanks, and get unique values
    const uniqueMonths = [...new Set(waivers.map(w => {
        if (w["Month"] && w["Year"]) {
            return `${w["Month"]}/${w["Year"]}`;
        }
        return null;
    }).filter(Boolean))];

    uniqueMonths.forEach(monthYearStr => {
        const option = document.createElement('option');
        option.value = monthYearStr;
        option.textContent = monthYearStr;
        monthDropdown.appendChild(option);
    });
}
// --- Data Rendering & Filtering ---
function renderWaiverTable() {
    const tbody = document.getElementById('waiverTableBody');
    tbody.innerHTML = ''; 
    
    const waivers = window.Workspace.appData.waivers;
    if (!waivers || waivers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="padding: 20px; text-align: center;">No waivers found.</td></tr>`;
        return;
    }

    // 1. Get the current value of all three filters
    const searchTerm = document.getElementById('waiverSearch').value.toLowerCase();
    const statusFilter = document.getElementById('waiverStatusFilter').value;
    const monthFilter = document.getElementById('waiverMonthFilter').value;

    // 2. Filter the data array
    const filteredWaivers = waivers.filter(waiver => {
        
        // Check Search (Job ID or Vendor ID)
        const job = (waiver["Job ID"] || '').toString().toLowerCase();
        const vendor = (waiver["Vendor ID"] || '').toString().toLowerCase();
        const matchesSearch = job.includes(searchTerm) || vendor.includes(searchTerm);

        // Check Status (Relies on Received Date being filled)
        const isReceived = waiver["Received Date"] && waiver["Received Date"].toString().trim() !== "";
        let matchesStatus = true;
        if (statusFilter === "PENDING") matchesStatus = !isReceived;
        if (statusFilter === "RECEIVED") matchesStatus = isReceived;

        // Check Month
        let matchesMonth = true;
        if (monthFilter !== "ALL") {
            const rowMonthYear = `${waiver["Month"]}/${waiver["Year"]}`;
            matchesMonth = (rowMonthYear === monthFilter);
        }

        // Only show the row if it passes ALL filters
        return matchesSearch && matchesStatus && matchesMonth;
    });

    if (filteredWaivers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="padding: 20px; text-align: center;">No waivers match your filters.</td></tr>`;
        return;
    }

    // 3. Render the filtered rows
    filteredWaivers.forEach(waiver => {
        const isReceived = waiver["Received Date"] && waiver["Received Date"].toString().trim() !== "";
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

function openWaiverDetails(waiverId) {
    console.log(`Opening details for Waiver: ${waiverId}`);
}


// Added customThroughPeriod and customDueDate as optional parameters (defaulting to null)
function prepareNewWaiver(jobId, vendorId, targetMonth, targetYear, customThroughPeriod = null, customDueDate = null) {
    
    // 1. Grab the job settings from your in-memory hub
    const jobSettings = window.Workspace.appData.jobNotes.find(j => j["Job ID"] === jobId);
    
    const dueDayOffset = jobSettings ? jobSettings["Due Day"] : null;
    const throughDay = jobSettings ? jobSettings["Through Day"] : null;

    // 2. Run the standard date math as a baseline
    const timing = calculateWaiverDates(targetMonth, targetYear, dueDayOffset, throughDay);

    // 3. THE OVERRIDE: Use the custom human input if it exists; otherwise, use the math
    const finalThroughPeriod = customThroughPeriod ? customThroughPeriod : timing.throughPeriod;
    const finalDueDate = customDueDate ? customDueDate : timing.dueDate;

    // 4. Build the row
    const newWaiverRow = {
        "Waiver ID": generateWaiverKey(jobId, vendorId, targetMonth, targetYear), // Auto-increments to 2, 3, etc.
        "Job ID": jobId,
        "Vendor ID": vendorId,
        "Month": targetMonth,
        "Year": targetYear,
        "Due Date": finalDueDate,             
        "Through Period": finalThroughPeriod, 
        "Status": "Pending"
    };

    return newWaiverRow;
}

// --- Date Calculator for Waivers ---
function calculateWaiverDates(targetMonth, targetYear, dueDayOffset, throughDay) {
    // JavaScript months are 0-11, so we subtract 1 from your target
    const monthIndex = parseInt(targetMonth) - 1; 
    
    // 1. Calculate the Due Date
    // Passing '0' for the day automatically gets the LAST day of the previous month index.
    // So if target is Sept (index 8), passing index 9 with day 0 returns Sept 30th.
    const endOfTargetMonth = new Date(targetYear, monthIndex + 1, 0);
    
    // Default to 45 days if the setting is blank/null
    const daysToAdd = dueDayOffset ? parseInt(dueDayOffset) : 45;
    
    // Add the days to the end of the month
    const dueDate = new Date(endOfTargetMonth);
    dueDate.setDate(dueDate.getDate() + daysToAdd);
    const dueDateStr = dueDate.toLocaleDateString();

    // 2. Calculate the "Through Period"
    let throughPeriodStr = "";
    if (throughDay) {
        const tDay = parseInt(throughDay);
        
        // Period End: Target Month, Target Day (e.g., Sep 15)
        const periodEnd = new Date(targetYear, monthIndex, tDay);
        
        // Period Start: PREVIOUS Month, Target Day + 1 (e.g., Aug 16)
        const periodStart = new Date(targetYear, monthIndex - 1, tDay + 1);
        
        throughPeriodStr = `${periodStart.toLocaleDateString()} to ${periodEnd.toLocaleDateString()}`;
    } else {
        // If blank, default to standard full month
        const periodStart = new Date(targetYear, monthIndex, 1);
        const periodEnd = new Date(targetYear, monthIndex + 1, 0); 
        
        throughPeriodStr = `${periodStart.toLocaleDateString()} to ${periodEnd.toLocaleDateString()}`;
    }

    return {
        dueDate: dueDateStr,
        throughPeriod: throughPeriodStr
    };
}

// --- One Time Waiver Modal Logic ---
window.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('customWaiverModal');
    
    // Open Modal
    document.getElementById('openCustomWaiverBtn').addEventListener('click', () => {
        // Auto-set the month to the current month as a nice default
        document.getElementById('cwMonth').value = new Date().getMonth() + 1;
        modal.style.display = 'flex';
    });

    // Close Modal
    document.getElementById('cancelCustomWaiverBtn').addEventListener('click', () => {
        modal.style.display = 'none';
    });

    // Save & Generate
    document.getElementById('saveCustomWaiverBtn').addEventListener('click', async () => {
        const jobId = document.getElementById('cwJobId').value.trim();
        const vendorId = document.getElementById('cwVendorId').value.trim();
        const month = document.getElementById('cwMonth').value;
        const year = document.getElementById('cwYear').value;
        
        // Grab the manual overrides (if they left them blank, it defaults to standard math)
        const customThrough = document.getElementById('cwThrough').value.trim() || null;
        const customDue = document.getElementById('cwDue').value.trim() || null;

        if (!jobId || !vendorId) {
            alert("Job ID and Vendor ID are required!");
            return;
        }

        try {
            // Change button text to show it's working
            const saveBtn = document.getElementById('saveCustomWaiverBtn');
            saveBtn.textContent = "Saving...";
            saveBtn.disabled = true;

            // 1. Run our engine to build the row
            const newRow = prepareNewWaiver(jobId, vendorId, month, year, customThrough, customDue);

            // 2. Grab the master waivers file
            const fileHandle = await getFileByPath(window.Workspace.dirHandle, window.WORKSPACE_FILE_PATHS.waivers);
            
            // 3. Smart Merge it into Excel
            await UpdateExcel(fileHandle, [newRow], "Waiver ID", "Waivers"); // Adjust sheet name if needed

            // 4. Update local memory so the UI refreshes instantly without a full reload
            window.Workspace.appData.waivers.push(newRow);
            populateMonthDropdown();
            renderWaiverTable();

            // 5. Cleanup
            modal.style.display = 'none';
            saveBtn.textContent = "Generate & Save";
            saveBtn.disabled = false;
            
            // Clear inputs for next time
            document.getElementById('cwJobId').value = '';
            document.getElementById('cwVendorId').value = '';
            document.getElementById('cwThrough').value = '';
            document.getElementById('cwDue').value = '';

        } catch (error) {
            console.error("Failed to generate custom waiver:", error);
            alert("Error saving waiver. Check console for details.");
            document.getElementById('saveCustomWaiverBtn').textContent = "Generate & Save";
            document.getElementById('saveCustomWaiverBtn').disabled = false;
        }
    });
});
