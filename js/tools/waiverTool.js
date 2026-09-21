// js/tools/waiverTool.js

// --- Waiver Key Generator ---
function generateWaiverKey(jobId, vendorId, month, year) {
    const jId = String(jobId).trim();
    const vId = String(vendorId).trim();
    const m = String(month).trim();
    const y = String(year).trim();
    
    const baseKey = `${jId}${vId}${m}${y}`;
    const existingWaivers = window.Workspace.appData.waivers || [];
    
    const matchingCount = existingWaivers.filter(w => {
        return String(w["Job ID"]).trim() === jId &&
               String(w["Vendor ID"]).trim() === vId &&
               String(w["Month"]).trim() === m &&
               String(w["Year"]).trim() === y;
    }).length;
    
    const nextNumber = matchingCount + 1;
    return `${baseKey}${nextNumber}`;
}

// --- Data Preparation Engine ---
function prepareNewWaiver(jobId, vendorId, targetMonth, targetYear, customThroughPeriod = null, customDueDate = null) {
    const jobNotesData = window.Workspace.appData.jobNotes || [];
    const jobSettings = jobNotesData.find(j => String(j["Job ID"]).trim().toLowerCase() === String(jobId).trim().toLowerCase());
    
    const dueDayOffset = jobSettings ? jobSettings["Due Day"] : null;
    const throughDay = jobSettings ? jobSettings["Through Day"] : null;

    // Ensure calculateWaiverDates is globally available from helpers.js
    let finalThroughPeriod = customThroughPeriod;
    let finalDueDate = customDueDate;

    if (typeof calculateWaiverDates === "function" && (!customThroughPeriod || !customDueDate)) {
        const timing = calculateWaiverDates(targetMonth, targetYear, dueDayOffset, throughDay);
        if (!customThroughPeriod) finalThroughPeriod = timing.throughPeriod;
        if (!customDueDate) finalDueDate = timing.dueDate;
    }

    return {
        "Waiver ID": generateWaiverKey(jobId, vendorId, targetMonth, targetYear), 
        "Job ID": jobId,
        "Vendor ID": vendorId,
        "Month": targetMonth,
        "Year": targetYear,
        "Due Date": finalDueDate || "",              
        "Through Period": finalThroughPeriod || "", 
        "Status": "Pending"
    };
}


// --- Pre-Flight Validator ---
async function validateWaiverRun(targetMonth, vendorList, jobId, startDay, endingDay, isFinal, skipZero) {
    const appData = window.Workspace.appData;
    let errorLog = [];
    let skippedCount = 0;
    let validVendors = [];

    // Find the Job Settings to determine which templates to use
    const jobNotesData = appData.jobNotes || [];
    const jobSettings = jobNotesData.find(j => String(j["Job ID"]).trim().toLowerCase() === String(jobId).trim().toLowerCase()) || {};

    for (const vendorId of vendorList) {
        const vendor = String(vendorId).trim();
        const job = String(jobId).trim();
        const searchKey = `${job}${vendor}`.toLowerCase();

        // 1. Check Amount (Using WaiverMath utility!)
        const vendorAmountStr = WaiverMath.getAmount(job, vendor, startDay, endingDay, isFinal, "<>");
        const vendorAmount = parseFloat(vendorAmountStr.replace(/,/g, ''));
        
        if (vendorAmount <= 0) {
            if (skipZero) {
                skippedCount++;
                continue; 
            }
        }

        // 2. Check Email Setup 
        const hasEmailSetup = appData.contractInfo.some(row => {
            const rowJob = String(row["Job ID"] || '').trim().toLowerCase();
            const rowVendor = String(row["Vendor ID"] || '').trim().toLowerCase();
            return (rowJob + rowVendor) === searchKey;
        });

        if (!hasEmailSetup) {
            errorLog.push(`- ${vendor}: Missing Contract/Email Information setup.`);
        }

        // 3. Check Template Setup
        let targetTemplateName = "";
        if (isFinal) {
            targetTemplateName = String(jobSettings["Final Template"] || "").trim();
        } else {
            const unpaidAmount = parseFloat(WaiverMath.getUnpaidRetention(job, vendor).replace(/,/g, ''));
            targetTemplateName = unpaidAmount > 0 
                ? String(jobSettings["Conditional Template"] || "").trim() 
                : String(jobSettings["Unconditional Template"] || "").trim();
        }

        if (!targetTemplateName) {
            errorLog.push(`- ${vendor}: Missing Template assignment in Job Notes.`);
        } else {
            // Verify the template actually exists in the Template List
            const templateExists = appData.templateList.some(t => 
                String(t["Template Name"] || '').trim().toLowerCase() === targetTemplateName.toLowerCase()
            );

            if (!templateExists) {
                errorLog.push(`- ${vendor}: Template '${targetTemplateName}' not found in Master Template List.`);
            } else {
                validVendors.push({ vendorId: vendor, templateName: targetTemplateName, amount: vendorAmountStr });
            }
        }
    }

    return {
        passed: errorLog.length === 0,
        errors: errorLog,
        skipped: skippedCount,
        validVendors: validVendors,
        totalAttempted: vendorList.length
    };
}


// --- Master Batch Processor ---
window.batchProcessWaivers = async function(jobId, vendorList, targetMonth, targetYear, isFinal, isManualAmount) {
    const logMsg = (msg, isError = false) => {
        console.log(`[Waiver Engine] ${isError ? '❌' : '✅'} ${msg}`);
    };

    logMsg(`Starting batch process for Job ${jobId} (${vendorList.length} vendors)...`);

    // --- 1. Gather Job Rules & Calculate Dates ---
    const jobNotesData = window.Workspace.appData.jobNotes || [];
    const jobSettings = jobNotesData.find(j => String(j["Job ID"]).trim().toLowerCase() === String(jobId).trim().toLowerCase()) || {};
    
    const billingType = String(jobSettings["Billing Type"] || "Same Month").trim();
    const throughDay = parseInt(jobSettings["Through Day"]) || 31;
    const dueDay = parseInt(jobSettings["Due Day"]) || 15;
    const jobAllowsSkipZero = String(jobSettings["Skip Zero"] || "").trim().toLowerCase() === "yes";

    let mathMonth = parseInt(targetMonth) - 1; 
    let mathYear = parseInt(targetYear);

    if (billingType.toLowerCase() === "trailing") {
        mathMonth -= 1; 
        if (mathMonth < 0) {
            mathMonth = 11;
            mathYear -= 1;
        }
    }

    const startDay = new Date(mathYear, mathMonth, 1);
    const lastDayOfMathMonth = new Date(mathYear, mathMonth + 1, 0).getDate();
    const actualThroughDay = Math.min(throughDay, lastDayOfMathMonth);
    const endingDay = new Date(mathYear, mathMonth, actualThroughDay);
    const dueDate = new Date(targetYear, parseInt(targetMonth), dueDay);

    logMsg(`Calculated Period: ${startDay.toLocaleDateString()} to ${endingDay.toLocaleDateString()} (${billingType})`);

    // --- 2. Pre-Flight Validation ---
    const validationReport = await validateWaiverRun(targetMonth, vendorList, jobId, startDay, endingDay, isFinal, jobAllowsSkipZero);
    
    if (!validationReport.passed) {
        alert("Pre-Check Failed! Please fix the following issues:\n\n" + validationReport.errors.join("\n"));
        return;
    }

    const templatesDir = await window.Workspace.dirHandle.getDirectoryHandle('Templates', { create: true });
    const emailsDir = await window.Workspace.dirHandle.getDirectoryHandle('Generated_Emails', { create: true });
    const waiversFileHandle = await getFileByPath(window.Workspace.dirHandle, window.WORKSPACE_FILE_PATHS.waivers);

    let successCount = 0;
    let newWaiverRecords = [];

    // --- 3. Vendor Processing Loop ---
    for (const vendor of validationReport.validVendors) {
        const vendorId = vendor.vendorId;
        const templateName = vendor.templateName;
        
        // Exclude manual only
        const isManualOnly = String(WaiverMath.getEmailInfo(jobId, vendorId, "Manual Only")).trim().toLowerCase();
        if (isManualOnly === "yes" || isManualOnly === "true") {
            logMsg(`Skipping ${vendorId} - Contract is marked as 'Manual Only'.`);
            continue;
        }

        let finalAmount = vendor.amount;

        // Skip Zero Logic
        if (parseFloat(finalAmount.replace(/,/g, '')) <= 0 && jobAllowsSkipZero) {
            logMsg(`Vendor ${vendorId} has $0 balance. Auto-logging as not needed.`);
            const skippedRecord = prepareNewWaiver(jobId, vendorId, targetMonth, targetYear, endingDay.toLocaleDateString(), dueDate.toLocaleDateString());
            skippedRecord["Status"] = "Received"; 
            skippedRecord["Received Date"] = new Date().toLocaleDateString();
            skippedRecord["Sent Date"] = new Date().toLocaleDateString();
            skippedRecord["Notes"] = "Auto-cleared: $0 balance for period.";
            newWaiverRecords.push(skippedRecord);
            continue; 
        }

        // Manual Amounts Prompt
        if (isManualAmount) {
            const manualInput = prompt(`Enter Manual Amount for Job: ${jobId} | Vendor: ${vendorId}\nCalculated Amount: $${finalAmount}`, finalAmount);
            if (manualInput === null) {
                logMsg(`User cancelled processing for ${vendorId}.`);
                continue; 
            }
            finalAmount = manualInput;
        }

        try {
            // Load PDF and Config
            const pdfFileHandle = await templatesDir.getFileHandle(`${templateName}.pdf`);
            const pdfFile = await pdfFileHandle.getFile();
            const pdfBuffer = await pdfFile.arrayBuffer();

            const configFileHandle = await templatesDir.getFileHandle(`${templateName}_Config.json`);
            const configFile = await configFileHandle.getFile();
            const configJson = JSON.parse(await configFile.text());

            const vendorEmail = WaiverMath.getEmailInfo(jobId, vendorId, "Region Email");
            const vendorName = WaiverMath.getEmailInfo(jobId, vendorId, "Vendor Name");
            
            const mappingData = {
                "vendorName": vendorName,
                "amount": finalAmount,
                "spelledAmount": WaiverMath.spellNumber(finalAmount),
                "jobId": jobId,
                "month": targetMonth,
                "year": targetYear,
                "dueDate": dueDate.toLocaleDateString(),
                "throughDate": endingDay.toLocaleDateString()
            };

            // Stamp PDF
            const newPdfBytes = await stampWaiverWithConfig(pdfBuffer, mappingData, configJson);
            const safePdfName = `${jobId}_${vendorId}_${targetMonth}-${targetYear}_Waiver.pdf`;
            const outFolder = await window.Workspace.dirHandle.getDirectoryHandle("Generated_Waivers", { create: true });
            const outPdfHandle = await outFolder.getFileHandle(safePdfName, { create: true });
            const writablePdf = await outPdfHandle.createWritable();
            await writablePdf.write(newPdfBytes);
            await writablePdf.close();

            // Generate Email Draft
            const emailBody = `
                <div style="font-family: Calibri, sans-serif; font-size: 11pt; color: #333;">
                    <p>Hello ${vendorName},</p>
                    <p>Please review and sign the attached Lien Waiver for Job ${jobId} for the period ending ${endingDay.toLocaleDateString()}.</p>
                    <p>Please return this by <strong>${dueDate.toLocaleDateString()}</strong> to ensure timely processing.</p>
                    <p>Thank you,</p>
                </div>
                ${typeof getEmailSignature === 'function' ? getEmailSignature() : ''}
            `;
            const emailSubject = `Lien Waiver Required: Job ${jobId} - ${targetMonth}/${targetYear}`;
            await generateEmailFile(emailsDir, `Draft_${safePdfName}`, vendorEmail, "", emailSubject, emailBody, [outPdfHandle]);

            // Update Memory
            const newRecord = prepareNewWaiver(jobId, vendorId, targetMonth, targetYear, endingDay.toLocaleDateString(), dueDate.toLocaleDateString());
            newRecord["Sent Date"] = new Date().toLocaleDateString();
            newRecord["Status"] = "Sent";
            newWaiverRecords.push(newRecord);

            successCount++;
            logMsg(`Successfully processed ${vendorId}.`);

        } catch (error) {
            logMsg(`Error processing ${vendorId}: ${error.message}`, true);
        }
    }

    // --- 4. Batch Update Excel ---
    if (newWaiverRecords.length > 0) {
        logMsg("Updating Master Tracker...");
        await UpdateExcel(waiversFileHandle, newWaiverRecords, "Waiver ID", "Waivers");
        
        if (!window.Workspace.appData.waivers) window.Workspace.appData.waivers = [];
        window.Workspace.appData.waivers.push(...newWaiverRecords);
        
        if (typeof window.renderWaiverTable === "function") window.renderWaiverTable();
    }

    alert(`Batch complete! Successfully generated ${successCount} waivers and drafted emails.`);
};
