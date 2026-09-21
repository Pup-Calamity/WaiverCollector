// js/utils/statusUpdater.js

export async function refreshWaiverStatuses(logMsg = console.log) {
    const waivers = window.Workspace.appData.waivers;
    const invInProcessing = window.Workspace.appData.invInProcessing;
    
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

        // Skip waivers that are already locked in a post-processing state
        const lockedStatuses = ["sent", "received", "returned", "not needed", "paid"];
        if (lockedStatuses.includes(currentStatus.toLowerCase())) return;

        // Find any stuck invoices for this job/vendor combo
        const stuckInvoices = invInProcessing.filter(inv => 
            String(inv["jobid"] || "").trim().toLowerCase() === jobId &&
            String(inv["vendorid"] || "").trim().toLowerCase() === vendorId
        );

        let newStatus = "Ready"; // Default to Ready if no holds are found

        // Determine if anything is holding it up based on the two queues
        const hasRejected = stuckInvoices.some(inv => String(inv["Queue"]).toLowerCase().includes("reject"));
        const hasApproval = stuckInvoices.some(inv => String(inv["Queue"]).toLowerCase().includes("approval"));

        // Rejected takes priority over Approval since it requires immediate AP action
        if (hasRejected) {
            newStatus = "Held - Rejected";
        } else if (hasApproval) {
            newStatus = "Held - Approval";
        }

        // If the status changed from what is currently in Excel, stage it for update
        if (currentStatus !== newStatus) {
            waiver["Status"] = newStatus;
            updatedRecords.push(waiver);
            changesMade++;
        }
    });

    // Batch update Excel if we found changes
    if (changesMade > 0) {
        logMsg(`🔄 Morning Sweep: Updating ${changesMade} waiver statuses in Master Tracker...`);
        
        // Assumes UpdateExcel is globally available from your helpers
        await UpdateExcel(waiversFileHandle, updatedRecords, "Waiver ID", "Waivers");
        
        // Refresh the UI if the table is currently visible
        if (typeof renderWaiverTable === "function") renderWaiverTable();
        
        logMsg(`✅ Status sweep complete.`);
    } else {
        logMsg(`✅ Morning Sweep: All waiver statuses are up to date.`);
    }
}
