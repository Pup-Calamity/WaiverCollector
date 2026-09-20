// dataLoader.js

async function loadDataset() {
    try {
        // Load Waivers
        let waiverHandle = await findExcelFile(window.Workspace.dirHandle, "Vendor_Waivers");
        if (waiverHandle) {
            window.Workspace.appData.waivers = await extractAndValidateData(waiverHandle);
        }

        // Load Invoices
        let invoiceHandle = await findExcelFile(window.Workspace.dirHandle, "AR_Invoices");
        if (invoiceHandle) {
            window.Workspace.appData.waiverInvoices = await extractAndValidateData(invoiceHandle);
        }

        // Load Employee Emails
        let emailHandle = await findExcelFile(window.Workspace.dirHandle, "Employee_Directory");
        if (emailHandle) {
            window.Workspace.appData.empEmails = await extractAndValidateData(emailHandle);
        }
        
        console.log("Entire database loaded!", window.Workspace.appData);

    } catch (error) {
        console.error("Data loading failed:", error.message);
    }
}
