// dataLoader.js

async function loadDataset() {
    try {
        // Load Open AR
        let ARHandle = await findExcelFile(window.Workspace.dirHandle, "Vendor_Waivers");
        if (ARHandle) {
            window.Workspace.appData.waivers = await extractAndValidateData(ARHandle);
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
