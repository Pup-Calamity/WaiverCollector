export async function extractVendorData(excelFileBuffer, targetJob, targetVendor) {
    const workbook = window.XLSX.read(excelFileBuffer, { type: 'array' });
    
    const invoicesData = window.XLSX.utils.sheet_to_json(workbook.Sheets['Invoices'] || {}, { defval: 0 });
    const onbaseData = window.XLSX.utils.sheet_to_json(workbook.Sheets['In Onbase'] || {}, { defval: 0 });
    const emailInfo = window.XLSX.utils.sheet_to_json(workbook.Sheets['Email Information'] || {});

    // Replicate VBA SUMIFS
    const invoiceTotal = invoicesData
        .filter(row => String(row['Job']) === targetJob && String(row['Vendor']) === targetVendor)
        .reduce((sum, row) => sum + Number(row['Amount'] || 0), 0);

    const onbaseTotal = onbaseData
        .filter(row => String(row['Job']) === targetJob && String(row['Vendor']) === targetVendor)
        .reduce((sum, row) => sum + Number(row['Amount'] || 0), 0);

    // Replicate VBA VLOOKUP
    const vendorStaticInfo = emailInfo.find(row => 
        String(row['Job']) === targetJob && String(row['Vendor']) === targetVendor
    ) || {};

    return {
        projectName: vendorStaticInfo['Job Name'] || "Unknown Project",
        vendorName: targetVendor,
        amount: (invoiceTotal + onbaseTotal).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
    };
}
