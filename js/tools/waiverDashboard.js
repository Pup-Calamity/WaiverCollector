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

    // --- Return / Receive Waivers Hook ---
    const returnWaiversBtn = document.getElementById('returnWaiversBtn');
    if (returnWaiversBtn) {
        returnWaiversBtn.addEventListener('click', async () => {
            const checkedBoxes = Array.from(document.querySelectorAll('.row-checkbox:checked'));
            
            if (checkedBoxes.length === 0) {
                return alert("Please check at least one waiver row to mark as returned.");
            }

            const waiverIds = [];
            checkedBoxes.forEach(cb => {
                const waiverId = cb.dataset.waiverId;
                if (waiverId) waiverIds.push(waiverId);
            });

            // Fire the return engine
            await window.processReturnedWaivers(waiverIds);

            // Uncheck all boxes when done
            document.querySelectorAll('.row-checkbox').forEach(cb => cb.checked = false);
            const selectAllCb = document.getElementById('selectAllWaivers');
            if (selectAllCb) selectAllCb.checked = false;
        });
    }

    // --- Save Note Logic ---
   const saveNoteBtn = document.getElementById('saveNoteBtn');
    if (saveNoteBtn) {
        saveNoteBtn.addEventListener('click', async () => {
            const modal = document.getElementById('readNotesModal');
            
            // Bulletproof way to retrieve the attribute
            const waiverId = modal.getAttribute('data-waiver-id');
            const newNoteText = document.getElementById('newNoteInput').value.trim();
            
            if (!newNoteText) {
                modal.close();
                return; 
            }

            if (!waiverId) {
                return alert("Error: Could not identify the waiver record. Check if your Excel column is exactly 'Waiver ID'.");
            }

            const waivers = window.Workspace.appData.waivers || [];
            const record = waivers.find(w => String(w["Waiver ID"]) === String(waiverId));
            
            if (record) {
                // 1. Format the new note with a date and user stamp
                const todayStr = new Date().toLocaleDateString();
                const user = window.Workspace?.currentUser?.name || localStorage.getItem('currentUser') || "User";
                const formattedNote = `[${todayStr} - ${user}] ${newNoteText}`;
                
                // 2. Append it to existing notes (if any exist)
                const currentNotes = String(record["Notes"] || "").trim();
                if (currentNotes && currentNotes !== "No notes available.") {
                    record["Notes"] = currentNotes + "\n" + formattedNote;
                } else {
                    record["Notes"] = formattedNote;
                }

                // 3. Save to Excel
                try {
                    saveNoteBtn.textContent = "Saving...";
                    saveNoteBtn.disabled = true;
                    
                    const waiversFileHandle = await getFileByPath(window.Workspace.dirHandle, window.WORKSPACE_FILE_PATHS.waivers);
                    await UpdateExcel(waiversFileHandle, [record], "Waiver ID", "Waivers");
                    
                    // Re-render the table to reflect the new state
                    if (typeof window.renderWaiverTable === "function") window.renderWaiverTable();
                    
                } catch (e) {
                    alert("Error saving note: " + e.message);
                } finally {
                    saveNoteBtn.textContent = "Save Note";
                    saveNoteBtn.disabled = false;
                    modal.close();
                }
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
                // Populate existing notes
                document.getElementById('notesModalContent').textContent = rawNotes;
                // Clear the new note input box
                document.getElementById('newNoteInput').value = "";
                // Attach the Waiver ID to the modal itself so the Save button can find it!
                document.getElementById('readNotesModal').dataset.waiverId = row["Waiver ID"];
                
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
                document.getElementById('newNoteInput').value = "";
                
                // Bulletproof way to set the attribute
                const idToSave = row["Waiver ID"] || row["WaiverID"] || ""; // Fallback in case of Excel header differences
                document.getElementById('readNotesModal').setAttribute('data-waiver-id', idToSave);
                
                document.getElementById('readNotesModal').showModal();
            });
        }

        tbody.appendChild(tr);
    }

    if (matchCount === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="padding: 20px; text-align: center; color: var(--text-muted);">No waivers found matching these filters.</td></tr>`;
    }
};

// ==========================================
// MONTHLY ROLLOVER / JOB SETUP ENGINE
// ==========================================

window.addEventListener('DOMContentLoaded', () => {
    const setupModal = document.getElementById('setupMonthModal');
    const openSetupBtn = document.getElementById('openSetupMonthBtn');
    const cancelSetupBtn = document.getElementById('cancelSetupBtn');
    const scanBtn = document.getElementById('setupScanBtn');
    const confirmSetupBtn = document.getElementById('confirmSetupBtn');

    if (openSetupBtn) {
        openSetupBtn.addEventListener('click', () => {
            const today = new Date();
            document.getElementById('setupMonth').value = today.getMonth() + 1;
            document.getElementById('setupYear').value = today.getFullYear();
            document.getElementById('setupJobId').value = "";
            document.getElementById('setupVendorChecklist').style.display = "none";
            document.getElementById('setupVendorChecklist').innerHTML = "";
            confirmSetupBtn.disabled = true;
            setupModal.showModal();
        });
    }

    if (cancelSetupBtn) cancelSetupBtn.addEventListener('click', () => setupModal.close());

    // --- The Scanner & "Final Collected" Contract Check ---
    if (scanBtn) {
        scanBtn.addEventListener('click', () => {
            const jobId = document.getElementById('setupJobId').value.trim().toLowerCase();
            if (!jobId) return alert("Please enter a Job ID.");

            const waivers = window.Workspace.appData.waivers || [];
            const contractInfoData = window.Workspace.appData.contractInfo || [];
            const checklistContainer = document.getElementById('setupVendorChecklist');
            checklistContainer.innerHTML = "";
            checklistContainer.style.display = "block";

            // 1. Get all past waiver records for this specific job
            const pastJobWaivers = waivers.filter(w => String(w["Job ID"]).trim().toLowerCase() === jobId);
            
            if (pastJobWaivers.length === 0) {
                checklistContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 10px;">No previous vendors found for this Job ID. They will need to be added manually.</div>`;
                confirmSetupBtn.disabled = true;
                return;
            }

            // 2. Identify unique vendors and check Contract Info for "Final Collected"
            const vendorMap = new Map();
            
            pastJobWaivers.forEach(w => {
                const vendorId = String(w["Vendor ID"]).trim();
                
                // Look up this specific vendor's contract row for this job
                const contractRow = contractInfoData.find(c => 
                    String(c["Job ID"] || "").trim().toLowerCase() === jobId && 
                    String(c["Vendor ID"] || "").trim().toLowerCase() === vendorId.toLowerCase()
                );

                const finalCollectedVal = contractRow ? String(contractRow["Final Collected"] || "").trim().toLowerCase() : "";
                const isFinal = (finalCollectedVal === "yes");

                // Keep track of the vendor; if they are final anywhere, lock them out
                if (!vendorMap.has(vendorId) || isFinal) {
                    vendorMap.set(vendorId, { isFinal: isFinal });
                }
            });

            // 3. Render the checklist
            let validCount = 0;
            vendorMap.forEach((data, vendorId) => {
                let vendorName = vendorId;
                try { vendorName = window.WaiverMath.getEmailInfo(jobId, vendorId, "Vendor Name") || vendorId; } catch(e) {}

                const div = document.createElement('div');
                div.style.cssText = "display: flex; align-items: center; justify-content: space-between; padding: 8px; border-bottom: 1px solid var(--border-color);";
                
                if (data.isFinal) {
                    div.innerHTML = `
                        <label style="display: flex; align-items: center; gap: 10px; color: var(--text-muted); text-decoration: line-through;">
                            <input type="checkbox" class="rollover-cb" value="${vendorId}" disabled> 
                            ${vendorId} - ${vendorName}
                        </label>
                        <span style="font-size: 0.8em; color: #b91c1c; font-weight: bold; background: #fee2e2; padding: 2px 6px; border-radius: 4px;">Final Collected</span>
                    `;
                } else {
                    validCount++;
                    div.innerHTML = `
                        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; font-weight: bold; color: var(--text-main);">
                            <input type="checkbox" class="rollover-cb" value="${vendorId}" checked style="transform: scale(1.2);"> 
                            ${vendorId} - ${vendorName}
                        </label>
                    `;
                }
                checklistContainer.appendChild(div);
            });

            if (validCount > 0) {
                confirmSetupBtn.disabled = false;
            } else {
                checklistContainer.innerHTML += `<div style="text-align: center; color: #b91c1c; padding: 10px; font-weight: bold;">All historical vendors on this job have a "Yes" for Final Collected.</div>`;
            }
        });
    }
    
    // --- The Generator & Excel Saver ---
    if (confirmSetupBtn) {
        confirmSetupBtn.addEventListener('click', async () => {
            const jobId = document.getElementById('setupJobId').value.trim();
            const targetMonth = document.getElementById('setupMonth').value;
            const targetYear = document.getElementById('setupYear').value;
            const checkedVendors = Array.from(document.querySelectorAll('.rollover-cb:checked')).map(cb => cb.value);

            if (checkedVendors.length === 0) return alert("No vendors selected to roll over.");

            confirmSetupBtn.textContent = "Saving...";
            confirmSetupBtn.disabled = true;

            try {
                let newRecords = [];
                const jobSettings = window.Workspace.appData.jobNotes?.find(j => String(j["Job ID"]).trim().toLowerCase() === jobId.toLowerCase()) || {};

                // Generate a fresh record for every selected vendor using your math engine
                for (const vendorId of checkedVendors) {
                    const { startDay, endingDay, waiverMonthInt } = calculatePeriodDates(targetMonth, targetYear, "trailing", jobSettings["Through Day"] || 31);
                    const defaultThrough = `${startDay.toLocaleDateString()} to ${endingDay.toLocaleDateString()}`;
                    
                    const dueDay = parseInt(jobSettings["Due Day"]) || 25;
                    const defaultDue = new Date(targetYear, parseInt(targetMonth), dueDay).toLocaleDateString();

                    // Uses prepareNewWaiver from waiverTool.js
                    const newRow = prepareNewWaiver(jobId, vendorId, targetMonth, targetYear, defaultThrough, defaultDue, waiverMonthInt);
                    newRecords.push(newRow);
                }

                // Batch save to Excel
                const fileHandle = await getFileByPath(window.Workspace.dirHandle, window.WORKSPACE_FILE_PATHS.waivers);
                await UpdateExcel(fileHandle, newRecords, "Waiver ID", "Waivers"); 

                // Push to live memory and refresh table
                if (!window.Workspace.appData.waivers) window.Workspace.appData.waivers = [];
                window.Workspace.appData.waivers.push(...newRecords);
                
                if (typeof populateYearFilter === "function") populateYearFilter();
                if (typeof renderWaiverTable === "function") renderWaiverTable();

                setupModal.close();
                alert(`Successfully generated ${newRecords.length} new waiver records for Job ${jobId}!`);

            } catch (err) {
                console.error("Rollover failed:", err);
                alert("Error saving rolled-over waivers. Check console.");
            } finally {
                confirmSetupBtn.textContent = "Create Waiver Records";
                confirmSetupBtn.disabled = false;
            }
        });
    }
});
