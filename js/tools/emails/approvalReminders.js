// js/tools/emails/approvalReminders.js

// --- Report: Approval Reminders (Grouped by Job) ---
async function batchProcessApprovalReminders(targetMonth, targetYear, logMsg) {
    const waivers = window.Workspace.appData.waivers;
    const invInProcessing = window.Workspace.appData.invInProcessing;
    const jobInfo = window.Workspace.appData.jobInfo;
    const openAR = window.Workspace.appData.openAR;

    if (!waivers || !invInProcessing || !jobInfo || !openAR) {
        logMsg("❌ Missing required data! Please hit 'Sync Data'.", true);
        return;
    }

    const emailFolderHandle = await window.Workspace.dirHandle.getDirectoryHandle("Generated_Emails", { create: true });
    
    const targetWaivers = waivers.filter(w => {
        const rowMonth = parseInt(w["Month"]);
        const rowYear = parseInt(w["Year"]);
        const filterMonth = parseInt(targetMonth);
        const filterYear = parseInt(targetYear);
        
        if (isNaN(rowMonth) || isNaN(rowYear) || isNaN(filterMonth) || isNaN(filterYear)) return false; 

        return (rowMonth === filterMonth) && (rowYear === filterYear);
    });
    
    logMsg(`🔍 Found ${targetWaivers.length} waivers for ${targetMonth}/${targetYear}. Scanning for stuck invoices...`);
    if (targetWaivers.length === 0) return;

    const uniqueJobs = [...new Set(targetWaivers.map(w => String(w["Job ID"] || '').trim().toLowerCase()))].filter(Boolean);
    let emailCount = 0;

    for (const jobId of uniqueJobs) {
        
        const jobWaivers = targetWaivers.filter(w => String(w["Job ID"] || '').trim().toLowerCase() === jobId);
        const vendorIds = jobWaivers.map(w => String(w["Vendor ID"] || '').trim().toLowerCase());
        const displayJobId = String(jobWaivers[0]["Job ID"] || '').trim();

        const matchingInvoices = invInProcessing.filter(inv => {
            const invJob = String(inv["jobid"] || '').trim().toLowerCase();
            const invVendor = String(inv["vendorid"] || '').trim().toLowerCase();
            const invQueue = String(inv["Queue"] || '').trim().toLowerCase();
            
            return (invJob === jobId && vendorIds.includes(invVendor) && invQueue.includes("approval")); 
        });

        if (matchingInvoices.length > 0) {
            
            const jobData = jobInfo.find(j => String(j["Job ID"]).trim().toLowerCase() === jobId) || {};
            const burgName = jobData ? jobData["BURG Name"] : "";
            const pcName = jobData["Project Manager"] || 'Unknown PC';
            const omName = jobData["Project Controller"] || 'Unknown OM';
            const jobName = jobData["Job Name"] || '';

            const pcEmail = await getEmployeeEmail(pcName, logMsg);
            const omEmail = await getEmployeeEmail(omName, logMsg);
            const toEmail = [pcEmail, omEmail].filter(Boolean).join("; ");
            const ccEmail = getBurgEmail(burgName, "Billing Coordinator");

            const jobAR = openAR.filter(ar => String(ar["Job Number"]).trim().toLowerCase() === jobId);
            let amountOpen = 0;
            let invAge = 0;
            
            jobAR.forEach(ar => {
                amountOpen += parseFloat(ar["Invoice $ Due"]) || 0; 
                const currentAge = parseInt(ar["Aging"]) || 0;
                if (currentAge > invAge) invAge = currentAge;
            });

            const formattedAmountOpen = amountOpen.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

            let invoiceRowsHtml = "";
            matchingInvoices.forEach(inv => {
                const formattedAmount = Number(inv["Amount"]).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
                invoiceRowsHtml += `
                    <tr>
                        <td style="padding: 4px; border: 1px solid #ccc;">${pcName} / ${omName}</td>
                        <td style="padding: 4px; border: 1px solid #ccc;">${displayJobId}</td>
                        <td style="padding: 4px; border: 1px solid #ccc;">${inv["invoicenumb"] || ''}</td>
                        <td style="padding: 4px; border: 1px solid #ccc;">${inv["vendorid"] || ''}</td>
                        <td style="padding: 4px; border: 1px solid #ccc;">${inv["vendorname"] || ''}</td>
                        <td style="padding: 4px; border: 1px solid #ccc;">${inv["invoicedate (Day-Month-Year)"] || ''}</td>
                        <td style="padding: 4px; border: 1px solid #ccc;">${formattedAmount}</td>
                        <td style="padding: 4px; border: 1px solid #ccc;">${inv["Aging"] || '0'}</td>
                    </tr>`;
            });

            const htmlBody = `
                <div style="font-family: Calibri, sans-serif; font-size: 11pt; color: #333;">
                    <p><span style="background-color: #dcfce7; padding: 3px;"><strong>NOTE:</strong> This notification DOES NOT indicate whether your project has been funded, or that the vendor is refusing to sign a waiver. This is to be used as a tool to draw awareness to potential issues that may hold up our payment.</span></p>
                    <p>Hello,</p>
                    <p>The following ${targetMonth}/${targetYear} invoices may prevent the collection of waivers needed to receive payment of <strong>${formattedAmountOpen}</strong> for the Pay App, which is currently <strong>${invAge} days old</strong>.</p>
                    <p style="color: #b91c1c;"><strong>If this is more than 30 days old, it is very important to resolve the issues as quickly as possible.</strong></p>
                    <ul style="margin-bottom: 20px;">
                        <li>If you do not believe the issue can be resolved soon, but you feel you can have the vendor sign a waiver without the invoices being resolved, please respond to this email letting us know and we can CC you on the email when the waiver is sent.</li>
                        <li>Also note that invoices need to be approved by end of day the day before the payment day of your burg. If you are approving invoices on this list, please <strong>Reply ALL</strong> to this email to ensure they can get selected.</li>
                    </ul>
                    <table style="border-collapse: collapse; width: 100%; margin: 15px 0; font-size: 10pt;">
                        <thead>
                            <tr style="background-color: #f3f4f6; text-align: left;">
                                <th style="padding: 4px; border: 1px solid #ccc;">PC/OM</th>
                                <th style="padding: 4px; border: 1px solid #ccc;">Job ID</th>
                                <th style="padding: 4px; border: 1px solid #ccc;">Invoice Number</th>
                                <th style="padding: 4px; border: 1px solid #ccc;">Vendor ID</th>
                                <th style="padding: 4px; border: 1px solid #ccc;">Vendor Name</th>
                                <th style="padding: 4px; border: 1px solid #ccc;">Invoice Date</th>
                                <th style="padding: 4px; border: 1px solid #ccc;">Amount</th>
                                <th style="padding: 4px; border: 1px solid #ccc;">Days in Queue</th>
                            </tr>
                        </thead>
                        <tbody>${invoiceRowsHtml}</tbody>
                    </table>
                    <p>Thank you,</p>
                    <p>Accounts Payable Team</p>
                </div>
            `;

            const fileName = `ApprovalReminder_${displayJobId}`; 
            const subject = `NOTIFICATION: Potential Payment Delay for ${displayJobId} - ${jobName}`;

            const success = await generateEmailFile(emailFolderHandle, fileName, toEmail, ccEmail, subject, htmlBody);
            
            if (success) {
                logMsg(`✉️ Generated Reminder: ${fileName}.eml`);
                emailCount++;
            }
        }
    }

    logMsg(`✅ Batch Complete! Generated ${emailCount} Approval Reminders.`);
}
