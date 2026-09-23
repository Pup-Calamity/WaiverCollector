// js/tools/waiverDashboard.js

const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

window.addEventListener('DOMContentLoaded', () => {
    
    // UI Navigation Hooks
    const launchBtn = document.getElementById('launchDashboardBtn'); 
    if (launchBtn) {
        launchBtn.addEventListener('click', () => {
            if (!window.Workspace || !window.Workspace.appData.waivers) {
                return alert("Please sync data first.");
            }
            switchView('waiverDashboardView');
            populateYearFilter();
            renderWaiverTable();
        });
    }

    const backBtn = document.getElementById('backToHubFromDashboardBtn');
    if (backBtn) backBtn.addEventListener('click', () => switchView('processingWorkspace'));

    // Filter Listeners (Trigger live updates)
    const searchBox = document.getElementById('dashboardSearch');
    const statusBox = document.getElementById('dashboardStatus'); 
    const monthBox = document.getElementById('dashboardMonth');
    const yearBox = document.getElementById('dashboardYear');

    if (searchBox) searchBox.addEventListener('input', renderWaiverTable);
    if (statusBox) statusBox.addEventListener('change', renderWaiverTable); 
    if (monthBox) monthBox.addEventListener('change', renderWaiverTable);
    if (yearBox) yearBox.addEventListener('change', renderWaiverTable);

    // Modal Close Listeners
    const closeNotesBtn = document.getElementById('closeNotesModalBtn');
    if (closeNotesBtn) {
        closeNotesBtn.addEventListener('click', () => document.getElementById('readNotesModal').close());
    }

    // --- Batch Selection & Processing Hooks ---
    const selectAllCb = document.getElementById('selectAllWaivers');
    if (selectAllCb) {
        selectAllCb.addEventListener('change', (e) => {
            document.querySelectorAll('.row-checkbox').forEach(cb => cb.checked = e.target.checked);
        });
    }

    const openBatchBtn = document.getElementById('openBatchGeneratorBtn');
    if (openBatchBtn) {
        openBatchBtn.addEventListener('click', () => {
            const checkedBoxes = document.querySelectorAll('.row-checkbox:checked');
            if (checkedBoxes.length === 0) {
                return alert("Please select at least one waiver from the table to process.");
            }
            
            document.getElementById('batchSelectedCount').textContent = checkedBoxes.length;
            
            const modal = document.getElementById('batchSettingsModal');
            if (modal) modal.showModal();
        });
    }

    const cancelBatchBtn = document.getElementById('cancelBatchBtn');
    if (cancelBatchBtn) {
        cancelBatchBtn.addEventListener('click', () => document.getElementById('batchSettingsModal').close());
    }

    const confirmBatchBtn = document.getElementById('confirmBatchBtn');
    if (confirmBatchBtn) {
        confirmBatchBtn.addEventListener('click', async () => {
            const modal = document.getElementById('batchSettingsModal');
            if (modal) modal.close();

            const isFinal = document.getElementById('batchIsFinal')?.checked || false;
            const isManual = document.getElementById('batchIsManual')?.checked || false;
            const checkedBoxes = Array.from(document.querySelectorAll('.row-checkbox:checked'));
            
            if (checkedBoxes.length === 0) {
                alert("Please check at least one waiver row to process.");
                return;
            }

            // --- Collect the exact Waiver IDs from the checked rows ---
           const waiverIds = [];
            checkedBoxes.forEach(cb => {
                // Try grabbing it through dataset or direct attribute as a fallback
                const waiverId = cb.dataset.waiverId || cb.getAttribute('data-waiver-id');
                
                if (waiverId && waiverId !== "undefined" && String(waiverId).trim() !== "") {
                    waiverIds.push(waiverId);
                } else {
                    console.warn("⚠️ Found a checked box, but it has no Waiver ID attached to it! Check your Excel sheet to ensure this row has a Waiver ID.", cb);
                }
            });

            console.log(`🚀 Dispatching Batch for ${waiverIds.length} Waiver IDs...`, waiverIds);
            
            // --- Fire off the ID-driven batch processor ---
            await window.batchProcessWaivers(waiverIds, isFinal, isManual);
            
            // Clean up UI after processing
            const selectAllCb = document.getElementById('selectAllWaivers'); 
            if (selectAllCb) selectAllCb.checked = false;
            
            const finalCb = document.getElementById('batchIsFinal');
            const manualCb = document.getElementById('batchIsManual');
            if (finalCb) finalCb.checked = false;
            if (manualCb) manualCb.checked = false;

            if (typeof renderWaiverTable === 'function') {
                renderWaiverTable();
            }
        });
    }
});


// --- Dynamic Year Dropdown ---
window.populateYearFilter = function() {
    const waivers = window.Workspace.appData.waivers || [];
    const yearSelect = document.getElementById('dashboardYear');
    if (!yearSelect) return;
    
    const uniqueYears = [...new Set(waivers.map(w => String(w["Year"]).trim()))].filter(y => y && y !== "undefined");
    uniqueYears.sort((a, b) => b - a);

    yearSelect.innerHTML = '<option value="">All Years</option>';
    uniqueYears.forEach(year => {
        const opt = document.createElement('option');
        opt.value = year;
        opt.textContent = year;
        yearSelect.appendChild(opt);
    });
}

// --- Master Table Renderer ---
window.renderWaiverTable = function() {
    const waivers = window.Workspace.appData.waivers || [];
    const tbody = document.getElementById('waiverTableBody');
    if (!tbody) return;

    // Reset Select All checkbox when table updates
    const selectAllCb = document.getElementById('selectAllWaivers');
    if (selectAllCb) selectAllCb.checked = false;

    // Safely get filter values
    const searchVal = document.getElementById('dashboardSearch') ? document.getElementById('dashboardSearch').value.toLowerCase() : "";
    const statusVal = document.getElementById('dashboardStatus') ? document.getElementById('dashboardStatus').value.toLowerCase() : ""; 
    const monthVal = document.getElementById('dashboardMonth') ? document.getElementById('dashboardMonth').value : "";
    const yearVal = document.getElementById('dashboardYear') ? document.getElementById('dashboardYear').value : "";

    tbody.innerHTML = "";

    const sortedWaivers = [...waivers].reverse(); 
    let matchCount = 0;

    for (const row of sortedWaivers) {
        const jobId = String(row["Job ID"] || "").trim();
        const vendorId = String(row["Vendor ID"] || "").trim();
        const customerId = String(row["Customer ID"] || "").trim();
        const rowStatusRaw = String(row["Status"] || "").trim();
        
        let jobName = "Unknown Job";
        let vendorName = "Unknown Vendor";

        try {
            if (typeof WaiverMath !== 'undefined') {
                jobName = WaiverMath.getEmailInfo(jobId, vendorId, "Job Name") || "Unknown Job";
                vendorName = WaiverMath.getEmailInfo(jobId, vendorId, "Vendor Name") || "Unknown Vendor";
            }
        } catch (error) {}

        // 1. FILTER: Status
        if (statusVal) {
            const checkStatus = rowStatusRaw.toLowerCase();
            if (statusVal === "held") {
                if (!checkStatus.includes("held")) continue; 
            } else if (statusVal === "received") {
                if (checkStatus !== "received" && checkStatus !== "paid") continue;
            } else {
                if (checkStatus !== statusVal) continue;
            }
        }

        // 2. FILTER: Month & Year
        if (monthVal && parseInt(row["Month"]) !== parseInt(monthVal)) continue;
        if (yearVal && String(row["Year"]).trim() !== yearVal) continue;

        // 3. FILTER: Search Bar 
        const searchString = `${jobId} ${jobName} ${vendorId} ${vendorName} ${customerId}`.toLowerCase();
        if (searchVal && !searchString.includes(searchVal)) continue;

        matchCount++;
        if (matchCount > 200) break; 

        // 4. Format Status Color Bubble
        let statusStyle = "background: #e2e8f0; color: #475569;"; 
        if (rowStatusRaw.toLowerCase() === "ready") statusStyle = "background: #dbeafe; color: #1d4ed8;";
        if (rowStatusRaw.toLowerCase() === "sent") statusStyle = "background: #fef9c3; color: #854d0e;";
        if (rowStatusRaw.toLowerCase() === "received" || rowStatusRaw.toLowerCase() === "paid") statusStyle = "background: #dcfce7; color: #15803d;";
        if (rowStatusRaw.toLowerCase().includes("held")) statusStyle = "background: #fee2e2; color: #b91c1c;";

        // 5. Convert Month Number to Name
        const monthNum = parseInt(row["Month"]);
        const displayMonth = !isNaN(monthNum) && monthNum >= 1 && monthNum <= 12 ? monthNames[monthNum] : row["Month"];

        const tr = document.createElement('tr');
        tr.style.borderBottom = "1px solid var(--border-color)";
        
        // ---> NOTICE THE FIX ON THE CHECKBOX INPUT HERE <---
        tr.innerHTML = `
            <td style="padding: 12px; text-align: center;">
                <input type="checkbox" class="row-checkbox" style="transform: scale(1.2); cursor: pointer;" 
                       data-waiver-id="${row["Waiver ID"]}">
            </td>
            <td style="padding: 12px;"><strong>${row["Waiver ID"] || ""}</strong></td>
            <td style="padding: 12px;">
                <div style="font-weight: bold;">${jobId}</div>
                <div style="font-size: 0.85em; color: var(--text-muted);">${jobName}</div>
            </td>
            <td style="padding: 12px;">
                <div style="font-weight: bold;">${vendorId}</div>
                <div style="font-size: 0.85em; color: var(--text-muted);">${vendorName}</div>
            </td>
            <td style="padding: 12px;">${displayMonth}</td>
            <td style="padding: 12px;">
                <span style="padding: 4px 8px; border-radius: 12px; font-size: 0.85em; font-weight: bold; ${statusStyle}">${rowStatusRaw}</span>
            </td>
            <td style="padding: 12px;">${row["Sent Date"] || "-"}</td>
            <td style="padding: 12px;">${row["Received Date"] || "-"}</td>
            <td style="padding: 12px;">${row["Action Date"] || "-"}</td>
            <td style="padding: 12px; text-align: center;">
                <button class="icon-btn read-notes-btn" style="background: transparent; font-size: 1.2em; border: none; cursor: pointer;">📝</button>
            </td>
        `;

        const notesBtn = tr.querySelector('.read-notes-btn');
        if (notesBtn) {
            const rawNotes = row["Notes"] || "No notes available.";
            notesBtn.addEventListener('click', () => {
                document.getElementById('notesModalContent').textContent = rawNotes;
                document.getElementById('readNotesModal').showModal();
            });
        }

        tbody.appendChild(tr);
    }

    if (matchCount === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="padding: 20px; text-align: center; color: var(--text-muted);">No waivers found matching these filters.</td></tr>`;
    }
};


// --- Dynamic Year Dropdown ---
window.populateYearFilter = function() {
    const waivers = window.Workspace.appData.waivers || [];
    const yearSelect = document.getElementById('dashboardYear');
    if (!yearSelect) return;
    
    const uniqueYears = [...new Set(waivers.map(w => String(w["Year"]).trim()))].filter(y => y && y !== "undefined");
    uniqueYears.sort((a, b) => b - a);

    yearSelect.innerHTML = '<option value="">All Years</option>';
    uniqueYears.forEach(year => {
        const opt = document.createElement('option');
        opt.value = year;
        opt.textContent = year;
        yearSelect.appendChild(opt);
    });
}

// --- Master Table Renderer ---
window.renderWaiverTable = function() {
    const waivers = window.Workspace.appData.waivers || [];
    const tbody = document.getElementById('waiverTableBody');
    if (!tbody) return;

    // Reset Select All checkbox when table updates
    const selectAllCb = document.getElementById('selectAllWaivers');
    if (selectAllCb) selectAllCb.checked = false;

    // Safely get filter values
    const searchVal = document.getElementById('dashboardSearch') ? document.getElementById('dashboardSearch').value.toLowerCase() : "";
    const statusVal = document.getElementById('dashboardStatus') ? document.getElementById('dashboardStatus').value.toLowerCase() : ""; 
    const monthVal = document.getElementById('dashboardMonth') ? document.getElementById('dashboardMonth').value : "";
    const yearVal = document.getElementById('dashboardYear') ? document.getElementById('dashboardYear').value : "";

    tbody.innerHTML = "";

    const sortedWaivers = [...waivers].reverse(); 
    let matchCount = 0;

    for (const row of sortedWaivers) {
        const jobId = String(row["Job ID"] || "").trim();
        const vendorId = String(row["Vendor ID"] || "").trim();
        const customerId = String(row["Customer ID"] || "").trim();
        const rowStatusRaw = String(row["Status"] || "").trim();
        
        let jobName = "Unknown Job";
        let vendorName = "Unknown Vendor";

        try {
            if (typeof WaiverMath !== 'undefined') {
                jobName = WaiverMath.getEmailInfo(jobId, vendorId, "Job Name") || "Unknown Job";
                vendorName = WaiverMath.getEmailInfo(jobId, vendorId, "Vendor Name") || "Unknown Vendor";
            }
        } catch (error) {}

        // 1. FILTER: Status
        if (statusVal) {
            const checkStatus = rowStatusRaw.toLowerCase();
            if (statusVal === "held") {
                if (!checkStatus.includes("held")) continue; 
            } else if (statusVal === "received") {
                if (checkStatus !== "received" && checkStatus !== "paid") continue;
            } else {
                if (checkStatus !== statusVal) continue;
            }
        }

        // 2. FILTER: Month & Year
        // Use parseInt to ensure "09" matches "9" safely
        if (monthVal && parseInt(row["Month"]) !== parseInt(monthVal)) continue;
        
        if (yearVal && String(row["Year"]).trim() !== yearVal) continue;

        // 3. FILTER: Search Bar 
        const searchString = `${jobId} ${jobName} ${vendorId} ${vendorName} ${customerId}`.toLowerCase();
        if (searchVal && !searchString.includes(searchVal)) continue;

        matchCount++;
        if (matchCount > 200) break; 

        // 4. Format Status Color Bubble
        let statusStyle = "background: #e2e8f0; color: #475569;"; 
        if (rowStatusRaw.toLowerCase() === "ready") statusStyle = "background: #dbeafe; color: #1d4ed8;";
        if (rowStatusRaw.toLowerCase() === "sent") statusStyle = "background: #fef9c3; color: #854d0e;";
        if (rowStatusRaw.toLowerCase() === "received" || rowStatusRaw.toLowerCase() === "paid") statusStyle = "background: #dcfce7; color: #15803d;";
        if (rowStatusRaw.toLowerCase().includes("held")) statusStyle = "background: #fee2e2; color: #b91c1c;";

        // 5. Convert Month Number to Name
        const monthNum = parseInt(row["Month"]);
        const displayMonth = !isNaN(monthNum) && monthNum >= 1 && monthNum <= 12 ? monthNames[monthNum] : row["Month"];

        const tr = document.createElement('tr');
        tr.style.borderBottom = "1px solid var(--border-color)";
        
        tr.innerHTML = `
            <td style="padding: 12px; text-align: center;">
                <input type="checkbox" class="row-checkbox" style="transform: scale(1.2); cursor: pointer;" 
                       data-waiver-id="${row["Waiver ID"]}">
            </td>
            <td style="padding: 12px;"><strong>${row["Waiver ID"] || ""}</strong></td>
            <td style="padding: 12px;">
                <div style="font-weight: bold;">${jobId}</div>
                <div style="font-size: 0.85em; color: var(--text-muted);">${jobName}</div>
            </td>
            <td style="padding: 12px;">
                <div style="font-weight: bold;">${vendorId}</div>
                <div style="font-size: 0.85em; color: var(--text-muted);">${vendorName}</div>
            </td>
            <td style="padding: 12px;">${displayMonth}</td>
            <td style="padding: 12px;">
                <span style="padding: 4px 8px; border-radius: 12px; font-size: 0.85em; font-weight: bold; ${statusStyle}">${rowStatusRaw}</span>
            </td>
            <td style="padding: 12px;">${row["Sent Date"] || "-"}</td>
            <td style="padding: 12px;">${row["Received Date"] || "-"}</td>
            <td style="padding: 12px;">${row["Action Date"] || "-"}</td>
            <td style="padding: 12px; text-align: center;">
                <button class="icon-btn read-notes-btn" style="background: transparent; font-size: 1.2em; border: none; cursor: pointer;">📝</button>
            </td>
        `;

        const notesBtn = tr.querySelector('.read-notes-btn');
        if (notesBtn) {
            const rawNotes = row["Notes"] || "No notes available.";
            notesBtn.addEventListener('click', () => {
                document.getElementById('notesModalContent').textContent = rawNotes;
                document.getElementById('readNotesModal').showModal();
            });
        }

        tbody.appendChild(tr);
    }

    if (matchCount === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="padding: 20px; text-align: center; color: var(--text-muted);">No waivers found matching these filters.</td></tr>`;
    }
};
