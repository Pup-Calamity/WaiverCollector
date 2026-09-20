// js/tools/waiverTool.js

// --- Waiver Key Generator ---
function generateWaiverKey(jobId, vendorId, month, year) {
    const jId = String(jobId).trim();
    const vId = String(vendorId).trim();
    const m = String(month).trim();
    const y = String(year).trim();
    
    const baseKey = `${jId}${vId}${m}${y}`;
    const existingWaivers = window.Workspace.appData.waivers || [];
    
    const matchingCount = existingWaivers.filter(w => {
        return String(w["Job ID"]).trim() === jId &&
               String(w["Vendor ID"]).trim() === vId &&
               String(w["Month"]).trim() === m &&
               String(w["Year"]).trim() === y;
    }).length;
    
    const nextNumber = matchingCount + 1;
    return `${baseKey}${nextNumber}`;
}

// --- Data Preparation Engine ---
function prepareNewWaiver(jobId, vendorId, targetMonth, targetYear, customThroughPeriod = null, customDueDate = null) {
    const jobNotesData = window.Workspace.appData.jobNotes || [];
    const jobSettings = jobNotesData.find(j => j["Job ID"] === jobId);
    
    const dueDayOffset = jobSettings ? jobSettings["Due Day"] : null;
    const throughDay = jobSettings ? jobSettings["Through Day"] : null;

    // Uses the global utility function calculateWaiverDates() from helpers.js
    const timing = calculateWaiverDates(targetMonth, targetYear, dueDayOffset, throughDay);

    const finalThroughPeriod = customThroughPeriod ? customThroughPeriod : timing.throughPeriod;
    const finalDueDate = customDueDate ? customDueDate : timing.dueDate;

    return {
        "Waiver ID": generateWaiverKey(jobId, vendorId, targetMonth, targetYear), 
        "Job ID": jobId,
        "Vendor ID": vendorId,
        "Month": targetMonth,
        "Year": targetYear,
        "Due Date": finalDueDate,              
        "Through Period": finalThroughPeriod, 
        "Status": "Pending"
    };
}

// --- Navigation & Setup ---
window.addEventListener('DOMContentLoaded', () => {
    
    // 1. Hub Navigation
    const launchBtn = document.getElementById('launchWaiverToolBtn');
    
    if (launchBtn) {
        launchBtn.addEventListener('click', async () => {
            if (!window.Workspace.appData || !window.Workspace.appData.waivers) {
                const originalText = launchBtn.innerHTML;
                launchBtn.innerHTML = `<h3>Syncing Data...</h3>`;
                await loadDataset(); 
                launchBtn.innerHTML = originalText; 
            }

            switchView('waiverToolView');
            populateMonthDropdown(); 
            renderWaiverTable();     
        });
    }
    
    const backBtn = document.getElementById('backToHubBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            switchView('processingWorkspace');
        });
    }

    // 2. Table Filters
    const searchInput = document.getElementById('waiverSearch');
    const statusFilter = document.getElementById('waiverStatusFilter');
    const monthFilter = document.getElementById('waiverMonthFilter');
    
    if (searchInput) searchInput.addEventListener('input', renderWaiverTable);
    if (statusFilter) statusFilter.addEventListener('change', renderWaiverTable);
    if (monthFilter) monthFilter.addEventListener('change', renderWaiverTable);

    // 3. Custom Waiver Modal
    const modal = document.getElementById('customWaiverModal');
    const openModalBtn = document.getElementById('openCustomWaiverBtn');
    const cancelModalBtn = document.getElementById('cancelCustomWaiverBtn');
    const saveModalBtn = document.getElementById('saveCustomWaiverBtn');

    if (openModalBtn) {
        openModalBtn.addEventListener('click', () => {
            document.getElementById('cwMonth').value = new Date().getMonth() + 1;
            if (modal) modal.style.display = 'flex';
        });
    }

    if (cancelModalBtn) {
        cancelModalBtn.addEventListener('click', () => {
            if (modal) modal.style.display = 'none';
        });
    }

    if (saveModalBtn) {
        saveModalBtn.addEventListener('click', async () => {
            const jobId = document.getElementById('cwJobId').value.trim();
            const vendorId = document.getElementById('cwVendorId').value.trim();
            const month = document.getElementById('cwMonth').value;
            const year = document.getElementById('cwYear').value;
            
            const customThrough = document.getElementById('cwThrough').value.trim() || null;
            const customDue = document.getElementById('cwDue').value.trim() || null;

            if (!jobId || !vendorId) {
                alert("Job ID and Vendor ID are required!");
                return;
            }

            try {
                saveModalBtn.textContent = "Saving...";
                saveModalBtn.disabled = true;

                const newRow = prepareNewWaiver(jobId, vendorId, month, year, customThrough, customDue);
                const fileHandle = await getFileByPath(window.Workspace.dirHandle, window.WORKSPACE_FILE_PATHS.waivers);
                
                await UpdateExcel(fileHandle, [newRow], "Waiver ID", "Waivers"); 

                if (!window.Workspace.appData.waivers) window.Workspace.appData.waivers = [];
                window.Workspace.appData.waivers.push(newRow);
                
                populateMonthDropdown();
                renderWaiverTable();

                if (modal) modal.style.display = 'none';
                saveModalBtn.textContent = "Generate & Save";
                saveModalBtn.disabled = false;
                
                document.getElementById('cwJobId').value = '';
                document.getElementById('cwVendorId').value = '';
                document.getElementById('cwThrough').value = '';
                document.getElementById('cwDue').value = '';

            } catch (error) {
                console.error("Failed to generate custom waiver:", error);
                alert("Error saving waiver. Check console for details.");
                saveModalBtn.textContent = "Generate & Save";
                saveModalBtn.disabled = false;
            }
        });
    }
});

// --- Dynamic Filter Population ---
function populateMonthDropdown() {
    const monthDropdown = document.getElementById('waiverMonthFilter');
    if (!monthDropdown) return;

    const currentSelection = monthDropdown.value; 
    monthDropdown.innerHTML = '<option value="ALL">All Months</option>'; 

    const waivers = window.Workspace.appData.waivers;
    if (!waivers) return;

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

    if (currentSelection && currentSelection !== "ALL") {
        monthDropdown.value = currentSelection;
    }
}

// --- Data Rendering & Filtering ---
function renderWaiverTable() {
    const tbody = document.getElementById('waiverTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = ''; 
    
    const waivers = window.Workspace.appData.waivers;
    if (!waivers || waivers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="padding: 20px; text-align: center;">No waivers found.</td></tr>`;
        return;
    }

    const searchTerm = document.getElementById('waiverSearch').value.toLowerCase();
    const statusFilter = document.getElementById('waiverStatusFilter').value;
    const monthFilter = document.getElementById('waiverMonthFilter').value;

    const filteredWaivers = waivers.filter(waiver => {
        const job = (waiver["Job ID"] || '').toString().toLowerCase();
        const vendor = (waiver["Vendor ID"] || '').toString().toLowerCase();
        const matchesSearch = job.includes(searchTerm) || vendor.includes(searchTerm);

        const isReceived = waiver["Received Date"] && waiver["Received Date"].toString().trim() !== "";
        let matchesStatus = true;
        if (statusFilter === "PENDING") matchesStatus = !isReceived;
        if (statusFilter === "RECEIVED") matchesStatus = isReceived;

        let matchesMonth = true;
        if (monthFilter !== "ALL") {
            const rowMonthYear = `${waiver["Month"]}/${waiver["Year"]}`;
            matchesMonth = (rowMonthYear === monthFilter);
        }

        return matchesSearch && matchesStatus && matchesMonth;
    });

    if (filteredWaivers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="padding: 20px; text-align: center;">No waivers match your filters.</td></tr>`;
        return;
    }

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

// --- Pre-Flight Validator ---
async function validateWaiverRun(targetMonth, vendorList, jobId, startDay, endingDay, isFinal, skipZero) {
    const appData = window.Workspace.appData;
    let errorLog = [];
    let skippedCount = 0;
    let validVendors = [];

    // Loop through each vendor in the list
    for (const vendorId of vendorList) {
        const vendor = String(vendorId).trim();
        const job = String(jobId).trim();
        const searchKey = `${job}${vendor}`.toLowerCase();

        // 1. Check Amount (Placeholder: See Question 1 below)
        const vendorAmount = await calculateVendorAmount(job, vendor, startDay, endingDay, isFinal);
        
        if (vendorAmount <= 0) {
            if (skipZero) {
                skippedCount++;
                continue; // Skip the rest of the checks and move to the next vendor
            }
        }

        // 2. Check Email Setup 
        // VBA used: ThisWorkbook.Worksheets("Email Information")
        // We will look in our loaded contractInfo (or wherever this lives now)
        const hasEmailSetup = appData.contractInfo.some(row => {
            const rowJob = String(row["Job ID"] || '').trim().toLowerCase();
            const rowVendor = String(row["Vendor ID"] || '').trim().toLowerCase();
            return (rowJob + rowVendor) === searchKey;
        });

        if (!hasEmailSetup) {
            errorLog.push(`- ${vendor}: Missing Email Information setup.`);
        }

        // 3. Check Template Setup
        // VBA used: ThisWorkbook.Worksheets(tabMonth) to find the template string
        const templateString = getTemplateStringFromMonthData(job, vendor, targetMonth);
        
        if (!templateString) {
            errorLog.push(`- ${vendor}: Missing Template assignment for ${targetMonth}.`);
        } else {
            // Parse "PartialTemplate;FinalTemplate" logic
            let targetTemplateName = "";
            if (isFinal) {
                // Grab everything AFTER the semicolon
                const splitIndex = templateString.indexOf(";");
                if (splitIndex === -1) {
                    errorLog.push(`- ${vendor}: No Final template specified (missing ';' in setup).`);
                    continue;
                }
                targetTemplateName = templateString.substring(splitIndex + 1).trim();
            } else {
                // Grab everything BEFORE the semicolon
                const splitIndex = templateString.indexOf(";");
                targetTemplateName = splitIndex === -1 ? templateString.trim() : templateString.substring(0, splitIndex).trim();
            }

            // Verify the template actually exists in the Template List
            const templateExists = appData.templateList.some(t => 
                String(t["Template Name"] || '').trim().toLowerCase() === targetTemplateName.toLowerCase()
            );

            if (!templateExists) {
                errorLog.push(`- ${vendor}: Template '${targetTemplateName}' not found in Master Template List.`);
            } else {
                // If it passed everything, add it to our approved list
                validVendors.push({ vendorId: vendor, templateName: targetTemplateName, amount: vendorAmount });
            }
        }
    }

    // 4. Return the Report Card
    return {
        passed: errorLog.length === 0,
        errors: errorLog,
        skipped: skippedCount,
        validVendors: validVendors,
        totalAttempted: vendorList.length
    };
}

// Stub function for calculating the amount
async function calculateVendorAmount(job, vendor, startDay, endingDay, isFinal) {
    // We need to build this logic! For now, assuming everything has a balance of $100.
    return 100.00; 
}

// Stub function for finding the template
function getTemplateStringFromMonthData(job, vendor, targetMonth) {
    // We need to map this!
    return "Standard Partial;Standard Final"; 
}
