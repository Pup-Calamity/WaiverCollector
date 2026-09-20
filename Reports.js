async function batchProcessInvoicesEmail(targetMonth, targetYear) {
    const waivers = window.Workspace.appData.waivers;
    const invoices = window.Workspace.appData.invInProcessing;

    if (!waivers || !invoices) {
        alert("Missing data in memory hub!");
        return;
    }

    // 1. Create or open a folder specifically for these email drafts
    const emailFolderHandle = await window.Workspace.dirHandle.getDirectoryHandle("Generated_Emails", { create: true });

    const targetWaivers = waivers.filter(w => w["Month"] == targetMonth && w["Year"] == targetYear);
    let count = 0;

    // 2. Loop through and process
    for (const waiver of targetWaivers) {
        const jobId = String(waiver["Job ID"]).trim();
        const vendorId = String(waiver["Vendor ID"]).trim();

        // Find matching invoices
        const matchingInvoices = invoices.filter(inv => 
            String(inv["jobid"]).trim().toLowerCase() === jobId.toLowerCase() &&
            String(inv["vendorid"]).trim().toLowerCase() === vendorId.toLowerCase()
        );

        if (matchingInvoices.length > 0) {
            
            // Build the HTML Table
            let invoiceRowsHtml = "";
            matchingInvoices.forEach(inv => {
                const formattedAmount = Number(inv["Amount"]).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
                invoiceRowsHtml += `
                    <tr>
                        <td style="padding: 5px; border: 1px solid #ccc;">${inv["invoicenumb"] || ''}</td>
                        <td style="padding: 5px; border: 1px solid #ccc;">${inv["invoicedate (Day-Month-Year)"] || ''}</td>
                        <td style="padding: 5px; border: 1px solid #ccc;">${formattedAmount}</td>
                    </tr>`;
            });

            // Put it into the main HTML body
            const htmlBody = `
                <div style="font-family: Calibri, sans-serif; font-size: 11pt;">
                    <p>Hello,</p>
                    <p>We are processing billing for <strong>Job: ${jobId}</strong>.</p>
                    <p>Please provide a waiver for ${targetMonth}/${targetYear} to release the following invoices:</p>
                    <table style="border-collapse: collapse; width: 100%; max-width: 500px; margin: 15px 0;">
                        <tr style="background: #eee; text-align: left;">
                            <th style="padding: 5px; border: 1px solid #ccc;">Invoice #</th>
                            <th style="padding: 5px; border: 1px solid #ccc;">Date</th>
                            <th style="padding: 5px; border: 1px solid #ccc;">Amount</th>
                        </tr>
                        ${invoiceRowsHtml}
                    </table>
                    <p>Thank you,</p>
                </div>`;

            // Define the email parameters
            const fileName = `WaiverRequest_${jobId}_${vendorId}`;
            const toEmail = "vendor@example.com"; // You can map this dynamically from your vendorInfo sheet!
            const ccEmail = "manager@yourcompany.com";
            const subject = `Action Required: Lien Waiver for ${jobId}`;

            // Call the generic generator we just built
            await generateEmailFile(emailFolderHandle, fileName, toEmail, ccEmail, subject, htmlBody);
            count++;
        }
    }

    alert(`Successfully generated ${count} email drafts in the Generated_Emails folder!`);
}
