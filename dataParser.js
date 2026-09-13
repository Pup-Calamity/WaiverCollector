// dataParser.js

// Import the ES6 module version of SheetJS
import * as XLSX from 'https://cdn.sheetjs.com/xlsx-latest/package/mjs/xlsx.mjs';

export async function extractVendorData(excelFileBuffer, targetJob, targetVendor) {
    // 1. Load the workbook into memory
    const workbook = XLSX.read(excelFileBuffer, { type: 'array' });
    
    // 2. Convert specific sheets to JSON arrays
    const invoicesData = XLSX.utils.sheet_to_json(workbook.Sheets['Invoices'] || {}, { defval: 0 });
    const onbaseData = XLSX.utils.sheet_to_json(workbook.Sheets['In Onbase'] || {}, { defval: 0 });
    const emailInfo = XLSX.utils.sheet_to_json(workbook.Sheets['Email Information'] || {});

    // 3. Replicate VBA SUMIFS: Filter rows matching Job & Vendor, then sum the amounts
    const invoiceTotal = invoicesData
        .filter(row => String(row['Job']) === targetJob && String(row['Vendor']) === targetVendor)
        .reduce((sum, row) => sum + Number(row['Amount'] || 0), 0);

    const onbaseTotal = onbaseData
        .filter(row => String(row['Job']) === targetJob && String(row['Vendor']) === targetVendor)
        .reduce((sum, row) => sum + Number(row['Amount'] || 0), 0);

    // 4. Replicate VBA VLOOKUP: Find the first matching row for static info
    const vendorStaticInfo = emailInfo.find(row => 
        String(row['Job']) === targetJob && String(row['Vendor']) === targetVendor
    ) || {};

    // 5. Return the mapped variables matching your JSON template configuration
    return {
        projectName: vendorStaticInfo['Job Name'] || "Unknown Project",
        vendorName: targetVendor,
        amount: (invoiceTotal + onbaseTotal).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ","), // Formats as 45,000.00
        contractDate: vendorStaticInfo['ContractDate'] || "TBD"
    };
}
