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
                    
                    const dueDay = parseInt(jobSettings["Waiver Due Day"]) || 25;
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

    const jobModal = document.getElementById('setupJobModal');
    const openJobBtn = document.getElementById('openSetupJobBtn');
    const cancelJobBtn = document.getElementById('cancelNewJobBtn');
    const jobForm = document.getElementById('setupJobForm');
    const jobIdInput = document.getElementById('njJobId');
    const addVendorBtn = document.getElementById('addVendorRowBtn');
    const vendorContainer = document.getElementById('vendorRowsContainer');

    function createVendorRow() {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'vendor-row';
        rowDiv.style.cssText = "background: var(--bg-color); padding: 10px; border-radius: 6px; border: 1px solid var(--border-color); display: flex; flex-direction: column; gap: 8px;";
        
        const vendorInfoData = window.Workspace.appData.vendorInfo || [];
        const uniqueRegions = [...new Set(vendorInfoData.map(v => String(v["Vendor Region"] || "").trim()))].filter(Boolean);
        let regionOptions = uniqueRegions.map(r => `<option value="${r}">Region ${r}</option>`).join('');
        regionOptions += `<option value="NEW">➕ Add New Region...</option>`;

        rowDiv.innerHTML = `
            <!-- Row 1: Core IDs & Contract Financials -->
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1.2fr 1fr 30px; gap: 6px; align-items: center;">
                <input type="text" class="v-id" placeholder="Vendor ID *" style="margin:0; padding:6px; font-size:0.85em;" required>
                
                <select class="v-reg-select" style="margin:0; padding:6px; font-size:0.85em;" title="Vendor Region">
                    ${regionOptions}
                </select>

                <input type="text" class="v-amt" placeholder="Contract Amount" style="margin:0; padding:6px; font-size:0.85em;">
                <input type="text" class="v-desc" placeholder="Contract Description" style="margin:0; padding:6px; font-size:0.85em;">
                <input type="date" class="v-date" style="margin:0; padding:5px; font-size:0.85em;" title="Contract Date">
                <button type="button" class="remove-vendor-btn" style="background: transparent; border: none; color: #ef4444; font-size: 1.2em; cursor: pointer; font-weight: bold;" title="Remove Vendor">×</button>
            </div>

            <!-- Row 2: Project Metadata (Owner, GC, Third Tier, CC, Manual) -->
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr 1fr 1fr; gap: 6px;">
                <input type="text" class="v-owner" placeholder="Owner Name" style="margin:0; padding:5px; font-size:0.8em;">
                <input type="text" class="v-gcname" placeholder="GC Name" style="margin:0; padding:5px; font-size:0.8em;">
                <input type="text" class="v-gcnum" placeholder="GC Numbers" style="margin:0; padding:5px; font-size:0.8em;">
                <input type="text" class="v-tier" placeholder="Third Tier (Hiring)" style="margin:0; padding:5px; font-size:0.8em;">
                <input type="text" class="v-cc" placeholder="Special CCs (;)" style="margin:0; padding:5px; font-size:0.8em;">
                <select class="v-manual" style="margin:0; padding:5px; font-size:0.8em;">
                    <option value="">Manual: No</option>
                    <option value="Yes">Manual: Yes</option>
                </select>
            </div>

            <!-- Row 3: Word Templates -->
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px;">
                <input type="text" class="v-cond" placeholder="Conditional Template" value="Standard_Cond" style="margin:0; padding:5px; font-size:0.8em;">
                <input type="text" class="v-uncond" placeholder="Unconditional Template" value="Standard_Uncond" style="margin:0; padding:5px; font-size:0.8em;">
                <input type="text" class="v-final" placeholder="Final Template" value="Standard_Final" style="margin:0; padding:5px; font-size:0.8em;">
            </div>

            <!-- Row 4: Special Email Notes -->
            <input type="text" class="v-note" placeholder="Special Email Note (optional)..." style="margin:0; padding:5px; font-size:0.8em; width:100%;">
        `;

        const regSelect = rowDiv.querySelector('.v-reg-select');
        const vIdInput = rowDiv.querySelector('.v-id');

        regSelect.addEventListener('change', () => {
            if (regSelect.value === "NEW") {
                const currentVId = vIdInput.value.trim();
                if (!currentVId) {
                    alert("Please enter the Vendor ID first before creating a new region.");
                    regSelect.value = uniqueRegions[0] || "1";
                    return;
                }

                document.getElementById('nvrVendorId').value = currentVId;
                document.getElementById('nvrRegionNum').value = "";
                document.getElementById('nvrDesc').value = "";
                document.getElementById('nvrContact').value = "";
                document.getElementById('nvrEmail').value = "";
                document.getElementById('nvrPhone').value = "";
                document.getElementById('nvrAddress').value = "";
                document.getElementById('nvrNotes').value = "";
                
                window._activeRegionSelect = regSelect;
                document.getElementById('newVendorRegionModal').showModal();
            }
        });

        rowDiv.querySelector('.remove-vendor-btn').addEventListener('click', () => {
            if (vendorContainer.children.length > 1) {
                rowDiv.remove();
            } else {
                alert("You must keep at least one vendor row.");
            }
        });

        vendorContainer.appendChild(rowDiv);
    }

    if (openJobBtn) {
        openJobBtn.addEventListener('click', () => {
            document.getElementById('njJobId').value = "";
            document.getElementById('njJobName').value = "";
            document.getElementById('njJobStreet').value = "";
            document.getElementById('njJobCity').value = "";
            document.getElementById('njJobState').value = "";
            document.getElementById('njJobZip').value = "";
            document.getElementById('njJobCounty').value = "";
            document.getElementById('njDueDay').value = "25";
            document.getElementById('njThroughDay').value = "31";
            document.getElementById('njSkipZero').value = "";
            document.getElementById('njValueIf0').value = "";
            
            vendorContainer.innerHTML = "";
            createVendorRow();

            if (jobModal) jobModal.showModal();
        });
    }

    if (addVendorBtn) {
        addVendorBtn.addEventListener('click', () => createVendorRow());
    }

    if (cancelJobBtn) {
        cancelJobBtn.addEventListener('click', () => {
            if (jobModal) jobModal.close();
        });
    }

    // --- ERP Auto-Reference / Autofill on Job ID Blur ---
    if (jobIdInput) {
        jobIdInput.addEventListener('blur', () => {
            const enteredId = jobIdInput.value.trim().toLowerCase();
            if (!enteredId) return;

            const jobInfoData = window.Workspace.appData.jobInfo || [];
            const foundJob = jobInfoData.find(j => String(j["Job ID"] || "").trim().toLowerCase() === enteredId);

            if (foundJob) {
                const setValIfEmpty = (elementId, value) => {
                    const el = document.getElementById(elementId);
                    if (el && !el.value) el.value = value || "";
                };

                // Map standard ERP fields
                setValIfEmpty('njJobName', foundJob["Job Name"]);
                setValIfEmpty('njJobStreet', foundJob["Job Address 1"]);
                setValIfEmpty('njJobCity', foundJob["Job City"]);
                setValIfEmpty('njJobState', foundJob["Job State"]);
                setValIfEmpty('njJobZip', foundJob["Job Zip"]);

                // Auto-fill owner name on active vendor rows from Customer Name if blank
                const customerName = foundJob["Customer Name"] || "";
                document.querySelectorAll('.vendor-row').forEach(row => {
                    const ownerInput = row.querySelector('.v-owner');
                    if (ownerInput && !ownerInput.value) ownerInput.value = customerName;
                });

                console.log(`💡 ERP Auto-Reference: Pre-filled project details for Job ID ${enteredId}.`);
            }
        });
    }

    if (jobForm) {
        jobForm.addEventListener('submit', async () => {
            const jobId = document.getElementById('njJobId').value.trim();
            const jobName = document.getElementById('njJobName').value.trim(); 
            const jobStreet = document.getElementById('njJobStreet').value.trim();
            const jobCity = document.getElementById('njJobCity').value.trim();
            const jobState = document.getElementById('njJobState').value.trim();
            const jobZip = document.getElementById('njJobZip').value.trim();
            const jobCounty = document.getElementById('njJobCounty').value.trim();

            const dueDay = document.getElementById('njDueDay').value.trim();
            const throughDay = document.getElementById('njThroughDay').value.trim();
            const condRule = document.getElementById('njCondRule').value.trim();
            const uncondRule = document.getElementById('njUncondRule').value.trim();
            const skipZero = document.getElementById('njSkipZero').value.trim();
            const valueIf0 = document.getElementById('njValueIf0').value.trim();

            if (!jobId) return alert("Job ID is required.");

            const vendorRows = document.querySelectorAll('.vendor-row');
            let newContracts = [];
            let newVendorInfos = [];

            for (const row of vendorRows) {
                const vId = row.querySelector('.v-id').value.trim();
                if (!vId) continue;

                // Determine Region value (Select or Custom New Input)
                const regSelectVal = row.querySelector('.v-reg-select').value;
                const regNewVal = row.querySelector('.v-reg-new').value.trim();
                const vendorRegion = regSelectVal === "NEW" ? regNewVal : regSelectVal;

                if (regSelectVal === "NEW" && !vendorRegion) {
                    return alert(`Please enter a region number for Vendor ID ${vId}.`);
                }

                // If it's a brand new region for this vendor, create a vendorInfo record
                if (regSelectVal === "NEW") {
                    newVendorInfos.push({
                        "Key": `${vId}-${vendorRegion}`,
                        "Vendor ID": vId,
                        "Vendor Region": vendorRegion,
                        "Region Description": "",
                        "Region Contact Name": "",
                        "Region Email": "",
                        "Region Address": "",
                        "Region Phone": "",
                        "Vendor Notes": ""
                    });
                }

                newContracts.push({
                    "Key": `${jobId}-${vId}`,
                    "Vendor ID": vId,
                    "Vendor Region": vendorRegion,
                    "Vendor Name": "",
                    "Job ID": jobId,
                    "Job Name": jobName,
                    "Owner": row.querySelector('.v-owner').value.trim(),
                    "GC Name": row.querySelector('.v-gcname').value.trim(),
                    "GC Numbers": row.querySelector('.v-gcnum').value.trim(),
                    "Job Street": jobStreet,
                    "Job City": jobCity,
                    "Job State": jobState,
                    "Job Zip": jobZip,
                    "Job County": jobCounty,
                    "Contract Description": row.querySelector('.v-desc').value.trim(),
                    "Contract Date": row.querySelector('.v-date').value.trim(),
                    "Contract Amount": row.querySelector('.v-amt').value.trim(),
                    "Third Tier": row.querySelector('.v-tier').value.trim(),
                    "CC": row.querySelector('.v-cc').value.trim(),
                    "Special Email Note": row.querySelector('.v-note').value.trim(),
                    "Contract Note": "",
                    "Invoice Reference": "",
                    "Conditional Template": row.querySelector('.v-cond').value.trim(),
                    "Unconditional Template": row.querySelector('.v-uncond').value.trim(),
                    "Conditional Final Template": "",
                    "Final Template": row.querySelector('.v-final').value.trim(),
                    "Final Collected": "",
                    "Final Date": "",
                    "Manual Only": row.querySelector('.v-manual').value
                });
            }

            if (newContracts.length === 0) {
                return alert("Please enter at least one valid Vendor ID.");
            }

            const saveBtn = document.getElementById('saveNewJobBtn');
            saveBtn.textContent = "Saving...";
            saveBtn.disabled = true;

            try {
                // 1. Build Job Notes Record including Skip Zero & ValueIf0
                const newJobNoteRow = {
                    "Job ID": jobId,
                    "Conditional": condRule,
                    "Unconditional": uncondRule,
                    "Waiver Due Day": dueDay,
                    "Through Day": throughDay,
                    "Skip Zero": skipZero,
                    "Notes": valueIf0 ? `ValueIf0: ${valueIf0}` : "",
                    "Collection Notes": ""
                };

                // 2. Save Job Notes to Excel
                if (!window.Workspace.appData.jobNotes) window.Workspace.appData.jobNotes = [];
                window.Workspace.appData.jobNotes.push(newJobNoteRow);
                const jobNotesHandle = await getFileByPath(window.Workspace.dirHandle, window.WORKSPACE_FILE_PATHS.jobNotes);
                if (jobNotesHandle) await UpdateExcel(jobNotesHandle, [newJobNoteRow], "Job ID", "Job Notes");

                // 3. Batch Save Contracts to Excel
                if (!window.Workspace.appData.contractInfo) window.Workspace.appData.contractInfo = [];
                window.Workspace.appData.contractInfo.push(...newContracts);
                
                const contractHandle = await getFileByPath(window.Workspace.dirHandle, window.WORKSPACE_FILE_PATHS.contractInfo);
                if (contractHandle) {
                    await UpdateExcel(contractHandle, newContracts, "Key", "Contract Info");
                }

                // 4. Save New Vendor Regions to Vendor Info Excel (if any created)
                if (newVendorInfos.length > 0) {
                    if (!window.Workspace.appData.vendorInfo) window.Workspace.appData.vendorInfo = [];
                    window.Workspace.appData.vendorInfo.push(...newVendorInfos);
                    
                    const vendorInfoHandle = await getFileByPath(window.Workspace.dirHandle, window.WORKSPACE_FILE_PATHS.vendorInfo);
                    if (vendorInfoHandle) {
                        await UpdateExcel(vendorInfoHandle, newVendorInfos, "Key", "Vendor Info");
                    }
                }

                jobModal.close();
                alert(`Successfully initialized Job ${jobId} rules, address fields, and ${newContracts.length} vendor contract(s)!`);

            } catch (err) {
                console.error("Failed to setup new job:", err);
                alert("Error saving job configuration. Check console.");
            } finally {
                saveBtn.textContent = "Save Job & Contracts";
                saveBtn.disabled = false;
            }
        });
    }

    // --- New Vendor Region Modal Engine ---
    const nvrModal = document.getElementById('newVendorRegionModal');
    const nvrForm = document.getElementById('newVendorRegionForm');
    const cancelNvrBtn = document.getElementById('cancelNvrBtn');

    if (cancelNvrBtn) cancelNvrBtn.addEventListener('click', () => nvrModal.close());

    if (nvrForm) {
        nvrForm.addEventListener('submit', async () => {
            const vId = document.getElementById('nvrVendorId').value.trim();
            const regNum = document.getElementById('nvrRegionNum').value.trim();
            
            if (!regNum) return alert("Region number is required.");

            const newVendorInfoRow = {
                "Key": `${vId}-${regNum}`,
                "Vendor ID": vId,
                "Vendor Region": regNum,
                "Region Description": document.getElementById('nvrDesc').value.trim(),
                "Region Contact Name": document.getElementById('nvrContact').value.trim(),
                "Region Email": document.getElementById('nvrEmail').value.trim(),
                "Region Address": document.getElementById('nvrAddress').value.trim(),
                "Region Phone": document.getElementById('nvrPhone').value.trim(),
                "Vendor Notes": document.getElementById('nvrNotes').value.trim()
            };

            try {
                // 1. Push to memory appData
                if (!window.Workspace.appData.vendorInfo) window.Workspace.appData.vendorInfo = [];
                window.Workspace.appData.vendorInfo.push(newVendorInfoRow);

                // 2. Save to Vendor Info Excel file
                const vendorInfoHandle = await getFileByPath(window.Workspace.dirHandle, window.WORKSPACE_FILE_PATHS.vendorInfo);
                if (vendorInfoHandle) {
                    await UpdateExcel(vendorInfoHandle, [newVendorInfoRow], "Key", "Vendor Info");
                }

                // 3. Dynamically update the active select dropdown and select the new region
                if (window._activeRegionSelect) {
                    const newOpt = document.createElement('option');
                    newOpt.value = regNum;
                    newOpt.textContent = `Region ${regNum}`;
                    // Insert before the "NEW" option
                    window._activeRegionSelect.insertBefore(newOpt, window._activeRegionSelect.lastElementChild);
                    window._activeRegionSelect.value = regNum;
                }

                nvrModal.close();
                alert(`Successfully created Region ${regNum} for Vendor ${vId} and updated Vendor Info!`);

            } catch (err) {
                console.error("Failed to save vendor region:", err);
                alert("Error saving region configuration. Check console.");
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
            <td style="padding: 6px 10px; text-align: center;">
                <input type="checkbox" class="row-checkbox" style="transform: scale(1.0); cursor: pointer;" 
                       data-waiver-id="${row["Waiver ID"]}">
            </td>
            <td style="padding: 6px 10px; font-family: monospace; font-size: 0.9em;"><strong>${row["Waiver ID"] || ""}</strong></td>
            <td style="padding: 6px 10px;">
                <div style="font-weight: bold; line-height: 1.1;">${jobId}</div>
                <div style="font-size: 0.75em; color: var(--text-muted);">${jobName}</div>
            </td>
            <td style="padding: 6px 10px;">
                <div style="font-weight: bold; line-height: 1.1;">${vendorId}</div>
                <div style="font-size: 0.75em; color: var(--text-muted);">${vendorName}</div>
            </td>
            <td style="padding: 6px 10px;">${displayMonth}</td>
            <td style="padding: 6px 10px;">
                <span style="padding: 2px 6px; border-radius: 8px; font-size: 0.75em; font-weight: bold; ${statusStyle}">${rowStatusRaw}</span>
            </td>
            <td style="padding: 6px 10px; font-size: 0.85em;">${row["Sent Date"] || "-"}</td>
            <td style="padding: 6px 10px; font-size: 0.85em;">${row["Received Date"] || "-"}</td>
            <td style="padding: 6px 10px; font-size: 0.85em;">${row["Action Date"] || "-"}</td>
            <td style="padding: 6px 10px; text-align: center;">
                <button class="read-notes-btn" title="View Notes" style="background: transparent; font-size: 1em; border: none; cursor: pointer; padding: 2px 4px;">📝</button>
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