// js/utils/waiverMath.js

const WaiverMath = {
    // --- 1. Email Info Lookup ---
    getEmailInfo: function(job, vendor, headerName) {
        // Uses 'contractInfo' based on your provided schema
        const emailData = window.Workspace.appData.contractInfo || []; 
        
        const matchingRow = emailData.find(row => {
            const rowJob = String(row["Job ID"] || '').trim().toLowerCase();
            const rowVen = String(row["Vendor ID"] || '').trim().toLowerCase();
            return (rowJob === String(job).trim().toLowerCase() && 
                    rowVen === String(vendor).trim().toLowerCase());
        });

        if (!matchingRow || matchingRow[headerName] === undefined) {
            return "";
        }
        return String(matchingRow[headerName]);
    },

    // --- 2. Amount Summation Engine ---
    getAmount: function(job, vendor, firstDay, lastDay, fCheck, invStatus) {
        const invoices = window.Workspace.appData.waiverInvoices || [];
        const onBase = window.Workspace.appData.invInProcessing || [];
        const CRAcct = "2100000"; 
        
        const start = new Date(firstDay).getTime();
        const end = new Date(lastDay).getTime();
        
        let total = 0;

        // Sum Invoices Tab (waiverInvoices)
        invoices.forEach(row => {
            const rowJob = String(row["Job ID"] || '').trim();
            const rowVen = String(row["Vendor ID"] || '').trim();
            const rowStatus = String(row["AP Status Code"] || '').trim();
            const rowAcct = String(row["CR Acct #"] || '').trim();
            const rowDate = new Date(row["Invoice Date"]).getTime();
            
            let isMatch = (rowJob === job && rowVen === vendor && rowDate >= start && rowDate <= end);
            if (invStatus !== "<>") isMatch = isMatch && (rowStatus === invStatus);
            if (!fCheck) isMatch = isMatch && (rowAcct === CRAcct); // If fCheck is false, mandate CR Account

            if (isMatch) total += parseFloat(row["AP Amount"] || 0);
        });

        // Sum OnBase Tab (invInProcessing)
        onBase.forEach(row => {
            const rowJob = String(row["jobid"] || '').trim();
            const rowVen = String(row["vendorid"] || '').trim();
            const rowDate = new Date(row["invoicedate (Day-Month-Year)"]).getTime();
            
            if (rowJob === job && rowVen === vendor && rowDate >= start && rowDate <= end) {
                total += parseFloat(row["Amount"] || 0);
            }
        });

        return total < 0 ? "0.00" : total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },

    // --- 3. Unpaid Retention ---
    getUnpaidRetention: function(job, vendor) {
        const invoices = window.Workspace.appData.waiverInvoices || [];
        const CRAcct = "2110000"; 
        let total = 0;

        invoices.forEach(row => {
            const rowJob = String(row["Job ID"] || '').trim();
            const rowVen = String(row["Vendor ID"] || '').trim();
            const rowAcct = String(row["CR Acct #"] || '').trim();

            if (rowJob === job && rowVen === vendor && rowAcct === CRAcct) {
                total += parseFloat(row["AP Amount"] || 0);
            }
        });

        return total < 0 ? "0.00" : total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },

    // --- 4. Invoice List Generator (Replaces CreateInvoiceList & Exceptions) ---
    getInvoiceList: function(job, vendor, firstDay, lastDay, isFinal, returnWithAmounts = false) {
        if (isFinal) return returnWithAmounts ? "" : "Final Lien Waiver";

        const invoices = window.Workspace.appData.waiverInvoices || [];
        const onBase = window.Workspace.appData.invInProcessing || [];
        
        const start = new Date(firstDay).getTime();
        const end = new Date(lastDay).getTime();
        
        const uniqueInvoices = new Map(); // Map prevents duplicates and stores the amount
        let grandTotal = 0;

        // Scan Invoices Tab
        invoices.forEach(row => {
            const rowJob = String(row["Job ID"] || '').trim();
            const rowVen = String(row["Vendor ID"] || '').trim();
            const rowDate = new Date(row["Invoice Date"]).getTime();
            const invNum = String(row["Vendor Invoice #"] || '').trim();
            const status = String(row["AP Status Code"] || '').trim();

            if (rowJob === job && rowVen === vendor && rowDate >= start && rowDate <= end && status !== "C") {
                const amt = parseFloat(row["AP Amount"] || 0);
                if (!uniqueInvoices.has(invNum)) {
                    uniqueInvoices.set(invNum, amt);
                    grandTotal += amt;
                }
            }
        });

        // Scan OnBase Tab
        onBase.forEach(row => {
            const rowJob = String(row["jobid"] || '').trim();
            const rowVen = String(row["vendorid"] || '').trim();
            const rowDate = new Date(row["invoicedate (Day-Month-Year)"]).getTime();
            const invNum = String(row["invoicenumb"] || '').trim();

            if (rowJob === job && rowVen === vendor && rowDate >= start && rowDate <= end) {
                const amt = parseFloat(row["Amount"] || 0);
                if (!uniqueInvoices.has(invNum)) {
                    uniqueInvoices.set(invNum, amt);
                    grandTotal += amt;
                }
            }
        });

        if (uniqueInvoices.size === 0) return returnWithAmounts ? "" : "No Invoices Found";

        // Format the output
        if (returnWithAmounts) { // This acts as your "Exceptions" function
            let resultArr = [];
            uniqueInvoices.forEach((amount, invNumber) => {
                resultArr.push(`${invNumber} - $${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
            });
            return `${resultArr.join(", ")} :   Total = $${grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        } else { // Standard CreateInvoiceList output
            return Array.from(uniqueInvoices.keys()).join(", ");
        }
    },

    // --- 5. Spell Number (Number to Words) ---
    // (This remains entirely math-based, no header changes needed)
    spellNumber: function(numString) {
        const num = parseFloat(String(numString).replace(/,/g, ''));
        if (isNaN(num)) return "";

        const dollars = Math.floor(num);
        const cents = Math.round((num - dollars) * 100);
        const centStr = ` And ${String(cents).padStart(2, '0')}/100`;

        if (dollars === 0) return `Zero${centStr}`;
        if (dollars === 1) return `One${centStr}`;

        const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
        const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
        const scales = ['', 'Thousand', 'Million', 'Billion', 'Trillion'];

        function convertGroup(n) {
            let str = '';
            if (n > 99) {
                str += ones[Math.floor(n / 100)] + ' Hundred ';
                n %= 100;
            }
            if (n > 19) {
                str += tens[Math.floor(n / 10)] + ' ';
                n %= 10;
            }
            if (n > 0) {
                str += ones[n] + ' ';
            }
            return str.trim();
        }

        let wordStr = '';
        let scaleIdx = 0;
        let tempDollars = dollars;

        while (tempDollars > 0) {
            let group = tempDollars % 1000;
            if (group > 0) {
                let groupStr = convertGroup(group);
                wordStr = groupStr + (scales[scaleIdx] ? ' ' + scales[scaleIdx] + ' ' : '') + wordStr;
            }
            tempDollars = Math.floor(tempDollars / 1000);
            scaleIdx++;
        }

        return wordStr.trim() + centStr;
    }
};
