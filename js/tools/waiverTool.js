// js/tools/waiverTool.js

// --- Waiver Key Generator ---
function generateWaiverKey(jobId, vendorId, month, year, typePrefix = "") {
    const jId = String(jobId).trim();
    const vId = String(vendorId).trim();
    const m = String(month).trim();
    const y = String(year).trim();
    
    const baseKey = `${jId}${vId}${m}${y}${typePrefix}`;
    const existingWaivers = window.Workspace.appData.waivers || [];
    
    const matchingCount = existingWaivers.filter(w => {
        return String(w["Waiver ID"]).startsWith(baseKey);
    }).length;
    
    const nextNumber = matchingCount + 1;
    return `${baseKey}-${nextNumber}`;
}

// --- Data Preparation Engine ---
function prepareNewWaiver(jobId, vendorId, targetMonth, targetYear, customThroughPeriod, customDueDate, waiverType, waiverMonthInt) {
    const typePrefix = waiverType === "Final" ? "F" : (waiverType === "Conditional" ? "C" : "U");
    
    return {
        "Waiver ID": generateWaiverKey(jobId, vendorId, targetMonth, targetYear, typePrefix), 
        "Job ID": jobId,
        "Vendor ID": vendorId,
        "Month": targetMonth,
        "Year": targetYear,
        "Waiver Month": waiverMonthInt || "",        
        "Through Period": customThroughPeriod || "", 
        "Status": "Pending",
        "Sent Date": "", 
        "Due Date": customDueDate || "", 
        "Original Send Date": "",
        "Action Date": "",
        "Times Sent": 0,
        "Last Updated": "",
        "Updated By": "",
        "Notes": ""
    };
}

// --- Helper to Calculate Dates Based on Rule ---
function calculatePeriodDates(targetMonth, targetYear, ruleType, throughDayStr) {
    let rule = String(ruleType).trim().toLowerCase();
    if (rule === "") rule = "trailing";
    
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

    const waiverMonthInt = mathMonth + 1;

    return { startDay, endingDay, waiverMonthInt };
}


// --- Pre-Flight Validator (Waiver ID Driven) ---
async function validateWaiverRun(waiverIds, isFinal = false) {
    const appData = window.Workspace.appData;
    let errorLog = [];
    let validRecords = [];

    const allWaivers = appData.waivers || [];
    const jobNotesData = appData.jobNotes || [];
    const contractInfoData = appData.contractInfo || [];

    const templatesDir = await window.Workspace.dirHandle.getDirectoryHandle('Templates', { create: true });

    for (const waiverId of waiverIds) {
        const record = allWaivers.find(w => String(w["Waiver ID"]).trim() === String(waiverId).trim());
        
        if (!record) {
            errorLog.push(`- Waiver ID '${waiverId}': Not found in Master Tracker.`);
            continue;
        }

        const jobId = String(record["Job ID"]).trim();
        const vendorId = String(record["Vendor ID"]).trim();
        
        const jobSettings = jobNotesData.find(j => String(j["Job ID"]).trim().toLowerCase() === jobId.toLowerCase()) || {};
        const condRule = String(jobSettings["Conditional"] || "").trim();
        const uncondRule = String(jobSettings["Unconditional"] || "").trim();

        let requiredTemplates = [];

        if (isFinal) {
            const finalTemp = WaiverMath.getEmailInfo(jobId, vendorId, "Final Template");
            if (!finalTemp) errorLog.push(`- Job ${jobId} / Vendor ${vendorId}: Missing 'Final Template'.`);
            else requiredTemplates.push({ type: "Final", name: finalTemp, rule: "Same Month" });
        } else {
            if (condRule) {
                const condTemp = WaiverMath.getEmailInfo(jobId, vendorId, "Conditional Template");
                if (condTemp) requiredTemplates.push({ type: "Conditional", name: condTemp, rule: condRule });
            }
            if (uncondRule) {
                const uncondTemp = WaiverMath.getEmailInfo(jobId, vendorId, "Unconditional Template");
                if (uncondTemp) requiredTemplates.push({ type: "Unconditional", name: uncondTemp, rule: uncondRule });
            }

            if (requiredTemplates.length === 0) {
                errorLog.push(`- Job ${jobId} / Vendor ${vendorId}: No active template rules (Trailing/Same Month) found in Job Notes.`);
            }
        }

        const hasEmailSetup = contractInfoData.some(row => 
            String(row["Job ID"] || '').trim().toLowerCase() === jobId.toLowerCase() &&
            String(row["Vendor ID"] || '').trim().toLowerCase() === vendorId.toLowerCase()
        );

        if (!hasEmailSetup) errorLog.push(`- Job ${jobId} / Vendor ${vendorId}: Missing Contract/Email setup.`);

        for (const req of requiredTemplates) {
            let pdfExists = true, jsonExists = true;
            try { await templatesDir.getFileHandle(`${req.name}.pdf`); } catch { pdfExists = false; }
            try { await templatesDir.getFileHandle(`${req.name}_Config.json`); } catch { jsonExists = false; }

            if (!pdfExists || !jsonExists) {
                errorLog.push(`- Missing files for template '${req.name}' in Templates folder.`);
            }
        }

        if (errorLog.filter(e => e.includes(waiverId)).length === 0) {
            validRecords.push({ waiverId, record, requiredTemplates });
        }
    }

    return {
        passed: errorLog.length === 0,
        errors: errorLog,
        validRecords: validRecords
    };
}


// --- Master Batch Processor ---
window.batchProcessWaivers = async function(waiverIds, isFinal = false, isManualAmount = false) {
    const logMsg = (msg, isError = false) => console.log(`[Waiver Engine] ${isError ? '❌' : '✅'} ${msg}`);

    if (!Array.isArray(waiverIds) || waiverIds.length === 0) return alert("No waivers selected.");

    const validationReport = await validateWaiverRun(waiverIds, isFinal);
    if (!validationReport.passed) {
        alert("Pre-Check Failed! Please fix the following issues:\n\n" + validationReport.errors.join("\n"));
        return;
    }

    const templatesDir = await window.Workspace.dirHandle.getDirectoryHandle('Templates', { create: true });
    const emailsDir = await window.Workspace.dirHandle.getDirectoryHandle('Generated_Emails', { create: true });
    const waiversFileHandle = await getFileByPath(window.Workspace.dirHandle, window.WORKSPACE_FILE_PATHS.waivers);

    let successCount = 0;
    let skippedZeroCount = 0;
    let recordsToUpdate = []; 

    for (const item of validationReport.validRecords) {
        const { waiverId, record, requiredTemplates } = item;
        const jobId = String(record["Job ID"]).trim();
        const vendorId = String(record["Vendor ID"]).trim();
        const targetMonth = String(record["Month"]).trim();
        const targetYear = String(record["Year"]).trim();

        const jobSettings = window.Workspace.appData.jobNotes?.find(j => String(j["Job ID"]).trim().toLowerCase() === jobId.toLowerCase()) || {};
        
        const throughDay = jobSettings["Through Day"] || 31;
        const dueDay = parseInt(jobSettings["Due Day"]) || 15;
        const jobAllowsSkipZero = String(jobSettings["Skip Zero"] || "").trim().toLowerCase() === "yes";
        const dueDate = new Date(parseInt(targetYear), parseInt(targetMonth) - 1, dueDay);

        const isManualOnly = String(WaiverMath.getEmailInfo(jobId, vendorId, "Manual Only")).trim().toLowerCase();
        if (isManualOnly === "yes" || isManualOnly === "true") continue;

        let generatedPdfHandles = []; 
        let vendorEmailBody = "";

        for (const templateData of requiredTemplates) {
            const { type: waiverType, name: templateName, rule: timingRule } = templateData;
            
            const { startDay, endingDay, waiverMonthInt } = calculatePeriodDates(targetMonth, targetYear, timingRule, throughDay);
            const periodString = `${startDay.toLocaleDateString()} to ${endingDay.toLocaleDateString()}`;

            let finalAmount = WaiverMath.getAmount(jobId, vendorId, startDay, endingDay, isFinal, "<>");

            // 1. SKIP ZERO LOGIC
            if (parseFloat(finalAmount.replace(/,/g, '')) <= 0 && jobAllowsSkipZero) {
                logMsg(`Vendor ${vendorId} has $0 balance. Auto-clearing.`);
                record["Status"] = "Received"; 
                record["Received Date"] = new Date().toLocaleDateString();
                record["Sent Date"] = new Date().toLocaleDateString();
                record["Notes"] = `Auto-cleared: $0 balance for ${waiverType} period.`;
                recordsToUpdate.push(record);
                skippedZeroCount++;
                continue; 
            }

            if (isManualAmount) {
                const manualInput = prompt(`Enter Amount for Job: ${jobId} | Vendor: ${vendorId}\nCalculated: $${finalAmount}`, finalAmount);
                if (manualInput === null) continue; 
                finalAmount = manualInput;
            }

            try {
                const vendorName = WaiverMath.getEmailInfo(jobId, vendorId, "Vendor Name");
                const jobName = WaiverMath.getEmailInfo(jobId, vendorId, "Job Name");
                
                const jobData = window.Workspace.appData.jobInfo.find(j => String(j["Job ID"]).trim().toLowerCase() === jobId.toLowerCase()) || {};
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

                const pdfFileHandle = await templatesDir.getFileHandle(`${templateName}.pdf`);
                const pdfFile = await pdfFileHandle.getFile();
                const pdfBuffer = await pdfFile.arrayBuffer();

                const configFileHandle = await templatesDir.getFileHandle(`${templateName}_Config.json`);
                const configFile = await configFileHandle.getFile();
                const configJson = JSON.parse(await configFile.text());

                const newPdfBytes = await stampWaiverWithConfig(pdfBuffer, mappingData, configJson);
                const typeLabel = waiverType === "Final" ? "FINAL" : (waiverType === "Conditional" ? "COND" : "UNCOND");
                
                // 2. SANITIZE FILE NAME (Removes slashes/commas from weird vendor names that crash OS saves)
                const cleanVendorName = vendorName.replace(/[^a-zA-Z0-9 -]/g, "").trim() || vendorId;
                const safePdfName = `${jobId}_${cleanVendorName}_${targetMonth}-${targetYear}_${typeLabel}_req.pdf`;
                
                const waiversBase = await window.Workspace.dirHandle.getDirectoryHandle("Waivers", { create: true });
                const jobFolder = await waiversBase.getDirectoryHandle(jobId, { create: true });
                const monthStr = String(targetMonth).padStart(2, '0');
                const periodFolder = await jobFolder.getDirectoryHandle(`${monthStr}-${targetYear}`, { create: true });
                
                const outPdfHandle = await periodFolder.getFileHandle(safePdfName, { create: true });
                const writablePdf = await outPdfHandle.createWritable();
                await writablePdf.write(newPdfBytes);
                await writablePdf.close();

                generatedPdfHandles.push(outPdfHandle); 

                const today = new Date();
                const todayStr = today.toLocaleDateString();
                const actionDate = new Date();
                actionDate.setDate(actionDate.getDate() + 3);
                
                const currentUser = window.Workspace?.currentUser?.name || localStorage.getItem('currentUser') || "System";
                
                if (!record["Original Send Date"] || String(record["Original Send Date"]).trim() === "") {
                    record["Original Send Date"] = todayStr;
                }

                let currentTimesSent = parseInt(record["Times Sent"]);
                if (isNaN(currentTimesSent)) currentTimesSent = 0;
                
                record["Waiver Month"] = waiverMonthInt;
                record["Times Sent"] = currentTimesSent + 1;
                record["Last Updated"] = `${todayStr} ${today.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
                record["Updated By"] = currentUser;
                record["Action Date"] = actionDate.toLocaleDateString();
                record["Sent Date"] = todayStr; 
                record["Status"] = "Sent";
                record["Through Period"] = periodString; 
                record["Due Date"] = dueDate.toLocaleDateString();
                
                recordsToUpdate.push(record);
                vendorEmailBody += `<p>• ${waiverType} Waiver for period ending ${endingDay.toLocaleDateString()}.</p>`;
                successCount++;
                
            } catch (error) {
                // 3. EXPLICIT ERROR ALERT (So it doesn't fail quietly!)
                alert(`CRITICAL ERROR saving PDF for Vendor ${vendorId}:\n\n${error.message}`);
                logMsg(`Error processing ${waiverType} for ${vendorId}: ${error.message}`, true);
            }
        }

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
        }
    }

    if (recordsToUpdate.length > 0) {
        logMsg("Updating Master Tracker across all modified rows...");
        await UpdateExcel(waiversFileHandle, recordsToUpdate, "Waiver ID", "Waivers");
        if (typeof window.renderWaiverTable === "function") window.renderWaiverTable();
    }

    alert(`Batch Complete!\n\nPDFs Generated: ${successCount}\nAuto-Cleared ($0 Balance): ${skippedZeroCount}`);
};