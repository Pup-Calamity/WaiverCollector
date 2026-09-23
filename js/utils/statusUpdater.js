// js/utils/statusUpdater.js

async function refreshWaiverStatuses(logMsg = console.log) {
    const waivers = window.Workspace.appData.waivers;
    const invInProcessing = window.Workspace.appData.invInProcessing;
    const jobNotesData = window.Workspace.appData.jobNotes || []; 
    
    // Safety check: ensure data is loaded
    if (!waivers || !invInProcessing || !window.Workspace.dirHandle) return;

    const waiversFileHandle = await getFileByPath(window.Workspace.dirHandle, window.WORKSPACE_FILE_PATHS.waivers);
    if (!waiversFileHandle) return;

    let updatedRecords = [];
    let changesMade = 0;

    waivers.forEach(waiver => {
        const currentStatus = String(waiver["Status"] || "").trim();
        const jobId = String(waiver["Job ID"] || "").trim().toLowerCase();
        const vendorId = String(waiver["Vendor ID"] || "").trim().toLowerCase();
        
        let isChanged = false;

        // --- 1. POPULATE / FIX DUE DATE ---
        const jobSettings = jobNotesData.find(j => String(j["Job ID"]).trim().toLowerCase() === jobId) || {};
        const dueDay = parseInt(jobSettings["Due Day"]) || 25;
        const targetMonth = parseInt(waiver["Month"]);
        const targetYear = parseInt(waiver["Year"]);
        
        if (!isNaN(targetMonth) && !isNaN(targetYear)) {
            // Official contract due date (e.g. Sept 15, 2026)
            const calculatedDueDate = new Date(targetYear, targetMonth, dueDay).toLocaleDateString();
            
            if (String(waiver["Due Date"] || "").trim() !== calculatedDueDate) {
                waiver["Due Date"] = calculatedDueDate;
                isChanged = true;
            }
        }

        // --- 2. UPDATE HOLD STATUSES ---
        // Skip status updates if already finalized (but we STILL updated the due date above!)
        const lockedStatuses = ["sent", "received", "returned", "not needed", "paid"];
        if (!lockedStatuses.includes(currentStatus.toLowerCase())) {
            
            // Find stuck invoices for this job/vendor combo
            const stuckInvoices = invInProcessing.filter(inv => 
                String(inv["jobid"] || "").trim().toLowerCase() === jobId &&
                String(inv["vendorid"] || "").trim().toLowerCase() === vendorId
            );

            let newStatus = "Ready"; // Default to Ready if no holds are found

            const hasRejected = stuckInvoices.some(inv => String(inv["Queue"]).toLowerCase().includes("reject"));
            const hasApproval = stuckInvoices.some(inv => String(inv["Queue"]).toLowerCase().includes("approval"));

            // Rejected takes priority over Approval
            if (hasRejected) {
                newStatus = "Held - Rejected";
            } else if (hasApproval) {
                newStatus = "Held - Approval";
            }

            // Stage for update if the status changed
            if (currentStatus !== newStatus) {
                waiver["Status"] = newStatus;
                isChanged = true;
            }
        }

        // Queue the row if EITHER the Due Date OR the Status changed
        if (isChanged) {
            updatedRecords.push(waiver);
            changesMade++;
        }
    });

    // Batch update Excel if we found changes
    if (changesMade > 0) {
        logMsg(`🔄 Sweep: Updating ${changesMade} waiver rows in Master Tracker...`);
        await UpdateExcel(waiversFileHandle, updatedRecords, "Waiver ID", "Waivers");
        
        // Refresh the UI if the table is currently visible
        if (typeof window.renderWaiverTable === "function") window.renderWaiverTable();
        
        logMsg(`✅ Status sweep complete.`);
    } else {
        logMsg(`✅ Sweep: All waiver statuses and due dates are up to date.`);
    }
}