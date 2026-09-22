// js/tools/waiverTool.js

// --- Waiver Key Generator ---
function generateWaiverKey(jobId, vendorId, month, year, typePrefix = "") {
    const jId = String(jobId).trim();
    const vId = String(vendorId).trim();
    const m = String(month).trim();
    const y = String(year).trim();
    
    // typePrefix allows us to generate two unique keys if a vendor gets both a Cond and Uncond waiver
    const baseKey = `${jId}${vId}${m}${y}${typePrefix}`;
    const existingWaivers = window.Workspace.appData.waivers || [];
    
    const matchingCount = existingWaivers.filter(w => {
        return String(w["Waiver ID"]).startsWith(baseKey);
    }).length;
    
    const nextNumber = matchingCount + 1;
    return `${baseKey}-${nextNumber}`;
}

// --- Data Preparation Engine ---
function prepareNewWaiver(jobId, vendorId, targetMonth, targetYear, customThroughPeriod, customDueDate, waiverType) {
    const typePrefix = waiverType.includes("Unconditional") ? "U" : "C";
    return {
        "Waiver ID": generateWaiverKey(jobId, vendorId, targetMonth, targetYear, typePrefix), 
        "Job ID": jobId,
        "Vendor ID": vendorId,
        "Month": targetMonth,
        "Year": targetYear,
        "Due Date": customDueDate || "",              
        "Through Period": customThroughPeriod || "", 
        "Status": "Pending"
    };
}

// --- Helper to Calculate Dates Based on Rule ---
function calculatePeriodDates(targetMonth, targetYear, ruleType, throughDayStr) {
    const rule = String(ruleType).trim().toLowerCase();
    const throughDay = parseInt(throughDayStr) || 31;
    
    let mathMonth = parseInt(targetMonth) - 1; 
    let mathYear = parseInt(targetYear);

    if (rule === "trailing") {
        mathMonth -= 1; 
        if (mathMonth < 0) { mathMonth = 11; mathYear -= 1; }
    }

    const startDay = new Date(mathYear, mathMonth, 1);
    const lastDayOfMathMonth = new Date(mathYear, mathMonth + 1, 0).getDate();
    const actualThroughDay = Math.min(throughDay, lastDayOfMathMonth);
    const endingDay = new Date(mathYear, mathMonth, actualThroughDay);

    return { startDay, endingDay };
}


// --- Pre-Flight Validator ---
async function validateWaiverRun(targetMonth, targetYear, vendorList, jobId, isFinal) {
    const appData = window.Workspace.appData;
    let errorLog = [];
    let validVendors = [];

    const jobNotesData = appData.jobNotes || [];
    const jobSettings = jobNotesData.find(j => String(j["Job ID"]).trim().toLowerCase() === String(jobId).trim().toLowerCase()) || {};

    const condRule = String(jobSettings["Conditional"] || "").trim();
    const uncondRule = String(jobSettings["Unconditional"] || "").trim();
    const throughDayStr = jobSettings["Through Day"];

    for (const vendorId of vendorList) {
        const vendor = String(vendorId).trim();
        const job = String(jobId).trim();
        
        let requiredTemplates = []; // Array to hold 1 or 2 templates

        if (isFinal) {
            const finalTemp = WaiverMath.getEmailInfo(job, vendor, "Final Template");
            if (!finalTemp) {
                errorLog.push(`- ${vendor}: Missing 'Final Template' in Contract Info.`);
            } else {
                requiredTemplates.push({ type: "Final", name: finalTemp, rule: "Same Month" });
            }
        } else {
            // Check Conditional
            if (condRule) {
                const condTemp = WaiverMath.getEmailInfo(job, vendor, "Conditional Template");
                if (!condTemp) errorLog.push(`- ${vendor}: Job requires Conditional, but missing 'Conditional Template' in Contract Info.`);
                else requiredTemplates.push({ type: "Conditional", name: condTemp, rule: condRule });
            }
            // Check Unconditional
            if (uncondRule) {
                const uncondTemp = WaiverMath.getEmailInfo(job, vendor, "Unconditional Template");
                if (!uncondTemp) errorLog.push(`- ${vendor}: Job requires Unconditional, but missing 'Unconditional Template' in Contract Info.`);
                else requiredTemplates.push({ type: "Unconditional", name: uncondTemp, rule: uncondRule });
            }
            
            if (requiredTemplates.length === 0) {
                // If both are blank, it skips silently (no waiver needed based on Job Notes)
                continue; 
            }
        }

        // Validate all required templates exist in the Master Template List
        for (const req of requiredTemplates) {
            const templateExists = appData.templateList.some(t => String(t["Template Name"] || '').trim().toLowerCase() === req.name.toLowerCase());
            if (!templateExists) {
                errorLog.push(`- ${vendor}: Template '${req.name}' not found in Master Template List.`);
            }
        }

        // If no errors for this vendor, add them to the queue
        if (errorLog.filter(e => e.includes(vendor)).length === 0) {
            validVendors.push({ vendorId: vendor, templatesToRun: requiredTemplates });
        }
    }

    return {
        passed: errorLog.length === 0,
        errors: errorLog,
        validVendors: validVendors
    };
}


// --- Master Batch Processor ---
window.batchProcessWaivers = async function(jobId, vendorList, targetMonth, targetYear, isFinal, isManualAmount) {
    const logMsg = (msg, isError = false) => {
        console.log(`[Waiver Engine] ${isError ? '❌' : '✅'} ${msg}`);
    };

    logMsg(`Starting batch process for Job ${jobId} (${vendorList.length} vendors)...`);

    const jobNotesData = window.Workspace.appData.jobNotes || [];
    const jobSettings = jobNotesData.find(j => String(j["Job ID"]).trim().toLowerCase() === String(jobId).trim().toLowerCase()) || {};
    
    const throughDay = jobSettings["Through Day"] || 31;
    const dueDay = parseInt(jobSettings["Due Day"]) || 15;
    const jobAllowsSkipZero = String(jobSettings["Skip Zero"] || "").trim().toLowerCase() === "yes";
    
    // Shared Due Date
    const dueDate = new Date(targetYear, parseInt(targetMonth), dueDay);

    // --- 1. Pre-Flight Validation ---
    const validationReport = await validateWaiverRun(targetMonth, targetYear, vendorList, jobId, isFinal);
    
    if (!validationReport.passed) {
        alert("Pre-Check Failed! Please fix the following issues:\n\n" + validationReport.errors.join("\n"));
        return;
    }

    const templatesDir = await window.Workspace.dirHandle.getDirectoryHandle('Templates', { create: true });
    const emailsDir = await window.Workspace.dirHandle.getDirectoryHandle('Generated_Emails', { create: true });
    const waiversFileHandle = await getFileByPath(window.Workspace.dirHandle, window.WORKSPACE_FILE_PATHS.waivers);

    let successCount = 0;
    let newWaiverRecords = [];

    // --- 2. Vendor Processing Loop ---
    for (const vendor of validationReport.validVendors) {
        const vendorId = vendor.vendorId;
        
        const isManualOnly = String(WaiverMath.getEmailInfo(jobId, vendorId, "Manual Only")).trim().toLowerCase();
        if (isManualOnly === "yes" || isManualOnly === "true") {
            logMsg(`Skipping ${vendorId} - Contract is marked as 'Manual Only'.`);
            continue;
        }

        let generatedPdfHandles = []; // Holds the file handles to attach to the email
        let vendorEmailBody = "";

        // Loop through the 1 or 2 templates required for this vendor
        for (const templateData of vendor.templatesToRun) {
            const { type: waiverType, name: templateName, rule: timingRule } = templateData;
            
            // Calculate specific dates for THIS template (Trailing vs Same Month)
            const { startDay, endingDay } = calculatePeriodDates(targetMonth, targetYear, timingRule, throughDay);

            let finalAmount = WaiverMath.getAmount(jobId, vendorId, startDay, endingDay, isFinal, "<>");

            // Skip Zero Logic
            if (parseFloat(finalAmount.replace(/,/g, '')) <= 0 && jobAllowsSkipZero) {
                logMsg(`Vendor ${vendorId} has $0 balance for ${waiverType}. Skipping.`);
                const skippedRecord = prepareNewWaiver(jobId, vendorId, targetMonth, targetYear, endingDay.toLocaleDateString(), dueDate.toLocaleDateString(), waiverType);
                skippedRecord["Status"] = "Received"; 
                skippedRecord["Received Date"] = new Date().toLocaleDateString();
                skippedRecord["Sent Date"] = new Date().toLocaleDateString();
                skippedRecord["Notes"] = `Auto-cleared: $0 balance for ${waiverType} period.`;
                newWaiverRecords.push(skippedRecord);
                continue; 
            }

            if (isManualAmount) {
                const manualInput = prompt(`Enter Manual Amount for Job: ${jobId} | Vendor: ${vendorId}\nWaiver: ${waiverType}\nCalculated: $${finalAmount}`, finalAmount);
                if (manualInput === null) continue; 
                finalAmount = manualInput;
            }

            try {
                // Construct Payload
                const vendorName = WaiverMath.getEmailInfo(jobId, vendorId, "Vendor Name");
                const jobName = WaiverMath.getEmailInfo(jobId, vendorId, "Job Name");
                
                const jobData = window.Workspace.appData.jobInfo.find(j => String(j["Job ID"]).trim().toLowerCase() === String(jobId).trim().toLowerCase()) || {};
                const burgName = String(jobData["BURG Name"] || "").trim();

                let ouName = "Lithko Contracting LLC";
                if (burgName === "Lithko TX" || burgName === "Austin") ouName = "Lithko TX";
                if (burgName === "UCS COLUMBUS") ouName = "Unlimited Contracting Solutions";
                if (burgName === "FRONTLINE BURG") ouName = "Frontline Concrete Contracting";
                if (burgName === "PIKUS BURG") ouName = "Pikus Concrete Contracting";
                if (burgName === "Full-Tilt Burg") ouName = "Full Tilt Contracting, LLC";

                const jobAddress = WaiverMath.getEmailInfo(jobId, vendorId, "Job Address");
                const jobCity = WaiverMath.getEmailInfo(jobId, vendorId, "Job City");
                const jobState = WaiverMath.getEmailInfo(jobId, vendorId, "Job State");
                const jobZip = WaiverMath.getEmailInfo(jobId, vendorId, "Job Zip");
                
                const contractAmount = parseFloat(WaiverMath.getEmailInfo(jobId, vendorId, "Contract Amount").replace(/,/g, '')) || 0;
                const paidThruEnd = parseFloat(WaiverMath.getPaidThru(jobId, vendorId, endingDay, isFinal, "<>V").replace(/,/g, '')) || 0;
                const paidThruStart = parseFloat(WaiverMath.getPaidThru(jobId, vendorId, startDay, isFinal, "<>V").replace(/,/g, '')) || 0;
                
                let remainingBalance = contractAmount - paidThruEnd;
                if (remainingBalance < 0) remainingBalance = 0;

                const { startDay: prevStartDay, endingDay: prevEndDay } = calculatePeriodDates(targetMonth, targetYear, "trailing", throughDay);
                const prevAmount = WaiverMath.getAmount(jobId, vendorId, prevStartDay, prevEndDay, isFinal, "<>V");

                const clearedPaidAmount = WaiverMath.getAmount(jobId, vendorId, startDay, endingDay, isFinal, "C");
                const pendingUnpaidAmount = WaiverMath.getAmount(jobId, vendorId, startDay, endingDay, isFinal, "<>C");

                const mappingData = {
                    "amount": finalAmount,
                    "amountWords": WaiverMath.spellNumber(finalAmount),
                    "previousperiod": prevAmount,
                    "previousperiodWords": WaiverMath.spellNumber(prevAmount),
                    "ContractPaid": paidThruStart.toLocaleString('en-US', { minimumFractionDigits: 2 }),
                    "conPaidWords": WaiverMath.spellNumber(paidThruStart),
                    "Cumulative": paidThruEnd.toLocaleString('en-US', { minimumFractionDigits: 2 }),
                    "CumulativeWords": WaiverMath.spellNumber(paidThruEnd),
                    "paidAmount": clearedPaidAmount,
                    "paidAmountWords": WaiverMath.spellNumber(clearedPaidAmount),
                    "unpaidAmount": pendingUnpaidAmount,
                    "unpaidAmountWords": WaiverMath.spellNumber(pendingUnpaidAmount),
                    "contractAmount": contractAmount.toLocaleString('en-US', { minimumFractionDigits: 2 }),
                    "remainingBalance": remainingBalance.toLocaleString('en-US', { minimumFractionDigits: 2 }),

                    "OUName": ouName,
                    "subcontractor": vendorName,
                    "subcontractorAddress": WaiverMath.getEmailInfo(jobId, vendorId, "Vendor Address"),
                    "owner": WaiverMath.getEmailInfo(jobId, vendorId, "Owner"),
                    "GCName": WaiverMath.getEmailInfo(jobId, vendorId, "GC Name"),
                    "GCNumber": WaiverMath.getEmailInfo(jobId, vendorId, "GC Number"),
                    
                    "project": jobName,
                    "projNum": jobId,
                    "projectAddress": `${jobAddress}, ${jobCity}, ${jobState} ${jobZip}`,
                    "addressOnly": jobAddress,
                    "city": jobCity,
                    "state": jobState,
                    "zip": jobZip,
                    "county": WaiverMath.getEmailInfo(jobId, vendorId, "Job County"),
                    "SubcontractScope": WaiverMath.getEmailInfo(jobId, vendorId, "Subcontract Description"),
                    "ContractDate": WaiverMath.getEmailInfo(jobId, vendorId, "ContractDate"),

                    "startdate": startDay.toLocaleDateString(),
                    "throughDate": endingDay.toLocaleDateString(),
                    "paidThruDate": new Date(startDay.getTime() - 86400000).toLocaleDateString(), 
                    "day": endingDay.getDate().toString(),
                    "month": endingDay.toLocaleString('default', { month: 'long' }),
                    "year": endingDay.getFullYear().toString(),
                    "dueDate": dueDate.toLocaleDateString(),
                    "firstDate": WaiverMath.getFirstDate(jobId, vendorId),
                    
                    "invoices": WaiverMath.getInvoiceList(jobId, vendorId, startDay, endingDay, isFinal),
                    "PrevInvoices": WaiverMath.getInvoiceList(jobId, vendorId, prevStartDay, prevEndDay, isFinal),
                    "exceptions": WaiverMath.getExceptions(jobId, vendorId, startDay, endingDay, isFinal),

                    "barcode": `${jobId} ${vendorId.padStart(10, '0')} ${endingDay.toLocaleDateString('en-US', {month: '2-digit', year: '2-digit'}).replace('/', '')} |${endingDay.toLocaleDateString('en-US', {month: '2-digit'})}`
                };

                // Stamp PDF
                const pdfFileHandle = await templatesDir.getFileHandle(`${templateName}.pdf`);
                const pdfFile = await pdfFileHandle.getFile();
                const pdfBuffer = await pdfFile.arrayBuffer();

                const configFileHandle = await templatesDir.getFileHandle(`${templateName}_Config.json`);
                const configFile = await configFileHandle.getFile();
                const configJson = JSON.parse(await configFile.text());

                const newPdfBytes = await stampWaiverWithConfig(pdfBuffer, mappingData, configJson);
                
                const typeLabel = waiverType === "Final" ? "FINAL" : (waiverType === "Conditional" ? "COND" : "UNCOND");
                const safePdfName = `${jobId}_${vendorId}_${targetMonth}-${targetYear}_${typeLabel}.pdf`;
                
                const outFolder = await window.Workspace.dirHandle.getDirectoryHandle("Generated_Waivers", { create: true });
                const outPdfHandle = await outFolder.getFileHandle(safePdfName, { create: true });
                const writablePdf = await outPdfHandle.createWritable();
                await writablePdf.write(newPdfBytes);
                await writablePdf.close();

                generatedPdfHandles.push(outPdfHandle); // Store for the email

                // Update Memory Tracker
                const newRecord = prepareNewWaiver(jobId, vendorId, targetMonth, targetYear, endingDay.toLocaleDateString(), dueDate.toLocaleDateString(), waiverType);
                newRecord["Sent Date"] = new Date().toLocaleDateString();
                newRecord["Status"] = "Sent";
                newWaiverRecords.push(newRecord);

                vendorEmailBody += `<p>• ${waiverType} Waiver for period ending ${endingDay.toLocaleDateString()}.</p>`;
                successCount++;

            } catch (error) {
                logMsg(`Error processing ${waiverType} for ${vendorId}: ${error.message}`, true);
            }
        }

        // Generate the Combined Email Draft
        if (generatedPdfHandles.length > 0) {
            const vendorEmail = WaiverMath.getEmailInfo(jobId, vendorId, "Region Email");
            const vendorName = WaiverMath.getEmailInfo(jobId, vendorId, "Vendor Name");
            
            const emailBody = `
                <div style="font-family: Calibri, sans-serif; font-size: 11pt; color: #333;">
                    <p>Hello ${vendorName},</p>
                    <p>Please review and sign the attached Lien Waiver(s) for Job ${jobId}:</p>
                    ${vendorEmailBody}
                    <p>Please return by <strong>${dueDate.toLocaleDateString()}</strong> to ensure timely processing.</p>
                    <p>Thank you,</p>
                </div>
                ${typeof getEmailSignature === 'function' ? getEmailSignature() : ''}
            `;
            const emailSubject = `Lien Waiver Required: Job ${jobId} - ${targetMonth}/${targetYear}`;
            await generateEmailFile(emailsDir, `Draft_${jobId}_${vendorId}_${targetMonth}-${targetYear}.eml`, vendorEmail, "", emailSubject, emailBody, generatedPdfHandles);
            logMsg(`Successfully drafted email with ${generatedPdfHandles.length} attachments for ${vendorId}.`);
        }
    }

    // --- 3. Batch Update Excel ---
    if (newWaiverRecords.length > 0) {
        logMsg("Updating Master Tracker...");
        await UpdateExcel(waiversFileHandle, newWaiverRecords, "Waiver ID", "Waivers");
        
        if (!window.Workspace.appData.waivers) window.Workspace.appData.waivers = [];
        window.Workspace.appData.waivers.push(...newWaiverRecords);
        
        if (typeof window.renderWaiverTable === "function") window.renderWaiverTable();
    }

    alert(`Batch complete! Successfully generated ${successCount} waivers and drafted emails.`);
};
