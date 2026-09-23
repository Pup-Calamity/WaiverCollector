// js/tools/waiverTool.js

// ==========================================
// 1. SHARED UTILITIES & ROUTING MODULE
// ==========================================

// Completely stripped of C/U/F prefixes. 1 Row = 1 Draw.
function generateWaiverKey(jobId, vendorId, month, year) {
    const baseKey = `${String(jobId).trim()}${String(vendorId).trim()}${String(month).trim()}${String(year).trim()}`;
    const matchingCount = (window.Workspace.appData.waivers || []).filter(w => String(w["Waiver ID"]).startsWith(baseKey)).length;
    return `${baseKey}-${matchingCount + 1}`;
}

function calculatePeriodDates(targetMonth, targetYear, ruleType, throughDayStr) {
    let rule = String(ruleType).trim().toLowerCase() || "trailing";
    const throughDay = parseInt(throughDayStr) || 31;
    let mathMonth = parseInt(targetMonth) - 1; 
    let mathYear = parseInt(targetYear);

    if (rule === "trailing") {
        mathMonth -= 1; 
        if (mathMonth < 0) { mathMonth = 11; mathYear -= 1; }
    }

    const startDay = new Date(mathYear, mathMonth, 1);
    const lastDayOfMathMonth = new Date(mathYear, mathMonth + 1, 0).getDate();
    const endingDay = new Date(mathYear, mathMonth, Math.min(throughDay, lastDayOfMathMonth));

    return { startDay, endingDay, waiverMonthInt: mathMonth + 1 };
}

// Single source of truth for folder names and file names
function getWaiverRoutingInfo(jobId, vendorId, targetMonth, targetYear, endingDay, typeLabel) {
    let vendorName = vendorId;
    try { vendorName = WaiverMath.getEmailInfo(jobId, vendorId, "Vendor Name") || vendorId; } catch(e) {}
    
    // Sanitize string to prevent OS save crashes
    const cleanVendorName = vendorName.replace(/[^a-zA-Z0-9 -]/g, "").trim() || vendorId;
    
    // Format dates for file naming
    const waiverYear = String(endingDay.getFullYear()).slice(-2);
    const formattedWaiverMonth = String(endingDay.getMonth() + 1).padStart(2, '0');    
    const folderMonth = String(targetMonth).padStart(2, '0');
    
    const periodFolderName = `${folderMonth}-${targetYear}`;
    
    // Creates the base name: JobID-MMYY_VendorName
    const baseFileName = `${jobId}-${formattedWaiverMonth}${waiverYear}_${cleanVendorName}`;

    return {
        vendorName,
        periodFolderName,
        reqFileName: `${baseFileName}_${typeLabel}_req.pdf`,
        recFileName: `${baseFileName}_${typeLabel}_rec.pdf`,
        emailFileName: baseFileName // Just the base name, omitting TYPE and req!
    };
}


// ==========================================
// 2. DATA PREP & VALIDATION
// ==========================================

function prepareNewWaiver(jobId, vendorId, targetMonth, targetYear, customThroughPeriod, customDueDate, waiverMonthInt) {
    return {
        "Waiver ID": generateWaiverKey(jobId, vendorId, targetMonth, targetYear), 
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
        if (!record) { errorLog.push(`- Waiver ID '${waiverId}': Not found.`); continue; }

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
            if (requiredTemplates.length === 0) errorLog.push(`- Job ${jobId} / Vendor ${vendorId}: No active template rules.`);
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
            if (!pdfExists || !jsonExists) errorLog.push(`- Missing files for template '${req.name}'.`);
        }

        if (errorLog.filter(e => e.includes(waiverId)).length === 0) validRecords.push({ waiverId, record, requiredTemplates });
    }
    return { passed: errorLog.length === 0, errors: errorLog, validRecords };
}


// ==========================================
// 3. CORE ENGINES
// ==========================================

// --- Engine A: Batch Processor (Generation) ---
// --- Engine A: Batch Processor (Generation) ---
window.batchProcessWaivers = async function(waiverIds, isFinal = false, isManualAmount = false) {
    const logMsg = (msg, isError = false) => console.log(`[Waiver Engine] ${isError ? '❌' : '✅'} ${msg}`);
    if (!Array.isArray(waiverIds) || waiverIds.length === 0) return alert("No waivers selected.");

    const validationReport = await validateWaiverRun(waiverIds, isFinal);
    if (!validationReport.passed) return alert("Pre-Check Failed:\n\n" + validationReport.errors.join("\n"));

    const templatesDir = await window.Workspace.dirHandle.getDirectoryHandle('Templates', { create: true });
    const emailsDir = await window.Workspace.dirHandle.getDirectoryHandle('Generated_Emails', { create: true });
    const waiversFileHandle = await getFileByPath(window.Workspace.dirHandle, window.WORKSPACE_FILE_PATHS.waivers);

    let successCount = 0, skippedZeroCount = 0, recordsToUpdate = []; 

    for (const item of validationReport.validRecords) {
        const { record, requiredTemplates } = item;
        const jobId = String(record["Job ID"]).trim();
        const vendorId = String(record["Vendor ID"]).trim();
        const targetMonth = String(record["Month"]).trim();
        const targetYear = String(record["Year"]).trim();

        const jobSettings = window.Workspace.appData.jobNotes?.find(j => String(j["Job ID"]).trim().toLowerCase() === jobId.toLowerCase()) || {};

        if (String(WaiverMath.getEmailInfo(jobId, vendorId, "Manual Only")).trim().toLowerCase() === "yes") continue;

        // --- NEW: The 48-hour urgency date (stamped on PDF and Email) ---
        const vendorDueDate = new Date();
        vendorDueDate.setDate(vendorDueDate.getDate() + 2);

        let generatedPdfHandles = [], vendorEmailBody = "", targetWaiverFolder = null; 
        let allZeroBalance = true; 
        
        // Track the official period details to stamp on the master row
        let finalPeriodString = "", finalWaiverMonthInt = "";

        // Loop over the templates (Creates 1 or 2 PDFs for this single row)
        for (const templateData of requiredTemplates) {
            const { type: waiverType, name: templateName, rule: timingRule } = templateData;
            const { startDay, endingDay, waiverMonthInt } = calculatePeriodDates(targetMonth, targetYear, timingRule, jobSettings["Through Day"] || 31);
            
            finalPeriodString = `${startDay.toLocaleDateString()} to ${endingDay.toLocaleDateString()}`;
            finalWaiverMonthInt = waiverMonthInt;

            let finalAmount = WaiverMath.getAmount(jobId, vendorId, startDay, endingDay, isFinal, "<>");

            // If ANY template has a balance, the row is not completely zero.
            if (parseFloat(finalAmount.replace(/,/g, '')) > 0 || String(jobSettings["Skip Zero"]).toLowerCase() !== "yes") {
                allZeroBalance = false;
            } else {
                continue; // Skip stamping this specific PDF if it's 0 and allowed
            }

            if (isManualAmount) {
                const manualInput = prompt(`Amount for Job: ${jobId} | Vendor: ${vendorId} (${waiverType})\nCalculated: $${finalAmount}`, finalAmount);
                if (manualInput !== null) finalAmount = manualInput;
            }

            try {
                const typeLabel = waiverType === "Final" ? "FINAL" : (waiverType === "Conditional" ? "COND" : "UNCOND");
                const routing = getWaiverRoutingInfo(jobId, vendorId, targetMonth, targetYear, endingDay, typeLabel);

                const contractAmount = parseFloat(WaiverMath.getEmailInfo(jobId, vendorId, "Contract Amount").replace(/,/g, '')) || 0;
                const paidThruEnd = parseFloat(WaiverMath.getPaidThru(jobId, vendorId, endingDay, isFinal, "<>V").replace(/,/g, '')) || 0;
                const paidThruStart = parseFloat(WaiverMath.getPaidThru(jobId, vendorId, startDay, isFinal, "<>V").replace(/,/g, '')) || 0;
                
                const { startDay: prevStartDay, endingDay: prevEndDay } = calculatePeriodDates(targetMonth, targetYear, "trailing", jobSettings["Through Day"] || 31);
                
                const mappingData = {
                    "amount": finalAmount, "amountWords": WaiverMath.spellNumber(finalAmount),
                    "previousperiod": WaiverMath.getAmount(jobId, vendorId, prevStartDay, prevEndDay, isFinal, "<>V"),
                    "previousperiodWords": WaiverMath.spellNumber(WaiverMath.getAmount(jobId, vendorId, prevStartDay, prevEndDay, isFinal, "<>V")),
                    "ContractPaid": paidThruStart.toLocaleString('en-US', { minimumFractionDigits: 2 }), "conPaidWords": WaiverMath.spellNumber(paidThruStart),
                    "Cumulative": paidThruEnd.toLocaleString('en-US', { minimumFractionDigits: 2 }), "CumulativeWords": WaiverMath.spellNumber(paidThruEnd),
                    "paidAmount": WaiverMath.getAmount(jobId, vendorId, startDay, endingDay, isFinal, "C"),
                    "unpaidAmount": WaiverMath.getAmount(jobId, vendorId, startDay, endingDay, isFinal, "<>C"),
                    "contractAmount": contractAmount.toLocaleString('en-US', { minimumFractionDigits: 2 }),
                    "remainingBalance": Math.max(0, contractAmount - paidThruEnd).toLocaleString('en-US', { minimumFractionDigits: 2 }),
                    "OUName": "Lithko Contracting LLC", 
                    "subcontractor": routing.vendorName,
                    "subcontractorAddress": WaiverMath.getEmailInfo(jobId, vendorId, "Vendor Address"),
                    "owner": WaiverMath.getEmailInfo(jobId, vendorId, "Owner"),
                    "GCName": WaiverMath.getEmailInfo(jobId, vendorId, "GC Name"),
                    "project": WaiverMath.getEmailInfo(jobId, vendorId, "Job Name"), "projNum": jobId,
                    "projectAddress": WaiverMath.getEmailInfo(jobId, vendorId, "Job Address"),
                    "startdate": startDay.toLocaleDateString(), "throughDate": endingDay.toLocaleDateString(),
                    "paidThruDate": new Date(startDay.getTime() - 86400000).toLocaleDateString(), 
                    "day": endingDay.getDate().toString(), "month": endingDay.toLocaleString('default', { month: 'long' }), "year": endingDay.getFullYear().toString(),
                    "dueDate": vendorDueDate.toLocaleDateString(), // <--- Uses 48-Hour Urgency Date here
                    "barcode": `${jobId} ${vendorId.padStart(10, '0')} ${endingDay.toLocaleDateString('en-US', {month: '2-digit', year: '2-digit'}).replace('/', '')} |${endingDay.toLocaleDateString('en-US', {month: '2-digit'})}`
                };

                const pdfBuffer = await (await templatesDir.getFileHandle(`${templateName}.pdf`)).getFile().then(f => f.arrayBuffer());
                const configJson = JSON.parse(await (await templatesDir.getFileHandle(`${templateName}_Config.json`)).getFile().then(f => f.text()));
                const newPdfBytes = await stampWaiverWithConfig(pdfBuffer, mappingData, configJson);
                
                const waiversBase = await window.Workspace.dirHandle.getDirectoryHandle("Waivers", { create: true });
                const jobFolder = await waiversBase.getDirectoryHandle(jobId, { create: true });
                targetWaiverFolder = await jobFolder.getDirectoryHandle(routing.periodFolderName, { create: true });
                
                const writablePdf = await (await targetWaiverFolder.getFileHandle(routing.reqFileName, { create: true })).createWritable();
                await writablePdf.write(newPdfBytes);
                await writablePdf.close();

                generatedPdfHandles.push(await targetWaiverFolder.getFileHandle(routing.reqFileName)); 
                vendorEmailBody += `<p>• ${waiverType} Waiver for period ending ${endingDay.toLocaleDateString()}.</p>`;
                
            } catch (error) {
                alert(`CRITICAL ERROR saving PDF for Vendor ${vendorId}:\n\n${error.message}`);
            }
        }

        // --- SINGLE ROW UPDATE ---
        const todayStr = new Date().toLocaleDateString();

        if (allZeroBalance) {
            Object.assign(record, { 
                "Status": "Received", "Received Date": todayStr, "Sent Date": todayStr, 
                "Through Period": finalPeriodString, "Waiver Month": finalWaiverMonthInt,
                "Notes": `Auto-cleared: $0 balance for period.`
                // Due Date intentionally omitted
            });
            recordsToUpdate.push(record);
            skippedZeroCount++;
        } 
        else if (generatedPdfHandles.length > 0) {
            const actionDate = new Date(); actionDate.setDate(actionDate.getDate() + 3);
            if (!record["Original Send Date"]?.trim()) record["Original Send Date"] = todayStr;
            
            Object.assign(record, {
                "Waiver Month": finalWaiverMonthInt,
                "Times Sent": (parseInt(record["Times Sent"]) || 0) + 1,
                "Last Updated": `${todayStr} ${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`,
                "Updated By": window.Workspace?.currentUser?.name || "System",
                "Action Date": actionDate.toLocaleDateString(),
                "Sent Date": todayStr, "Status": "Sent", "Through Period": finalPeriodString
                // Due Date intentionally omitted (Managed by Status Updater)
            });
            recordsToUpdate.push(record);
            successCount++;

            // Email Generation
            const vendorEmail = WaiverMath.getEmailInfo(jobId, vendorId, "Region Email");
            const vendorName = WaiverMath.getEmailInfo(jobId, vendorId, "Vendor Name");
            const emailFileName = getWaiverRoutingInfo(jobId, vendorId, targetMonth, targetYear, new Date(), "").emailFileName;
            
            const emailBody = `
                <div style="font-family: Calibri, sans-serif; font-size: 11pt; color: #333;">
                    <p>Hello ${vendorName},</p><p>Please review and sign the attached Lien Waiver(s):</p>
                    ${vendorEmailBody}<p>Please return by <strong>${vendorDueDate.toLocaleDateString()}</strong>.</p>
                </div>
                ${typeof getEmailSignature === 'function' ? getEmailSignature() : ''}
            `;
            const subject = `Lien Waiver Required: Job ${jobId} - ${targetMonth}/${targetYear}`;
            
            await generateEmailFile(emailsDir, emailFileName, vendorEmail, "", subject, emailBody, generatedPdfHandles);
            if (targetWaiverFolder) await generateEmailFile(targetWaiverFolder, emailFileName, vendorEmail, "", subject, emailBody, generatedPdfHandles);
        }
    }

    if (recordsToUpdate.length > 0) {
        await UpdateExcel(waiversFileHandle, recordsToUpdate, "Waiver ID", "Waivers");
        window.renderWaiverTable?.();
    }
    alert(`Batch Complete!\n\nDraws Processed: ${successCount}\nAuto-Cleared ($0 Balance): ${skippedZeroCount}`);
};


// --- Engine B: Return Processor (Gatekeeper) ---
window.processReturnedWaivers = async function(waiverIds) {
    if (!waiverIds?.length) return;
    
    // Validate the rows first to know exactly what PDFs the contract demands
    const validationReport = await validateWaiverRun(waiverIds); 
    let recordsToUpdate = [], count = 0;

    for (const item of validationReport.validRecords) {
        const { record, requiredTemplates } = item;
        const id = record["Waiver ID"];
        if (["received", "paid"].includes(String(record.Status).toLowerCase()) && !confirm(`Overwrite ${id}?`)) continue;

        const job = record["Job ID"], vendor = record["Vendor ID"];
        let allRequiredFilesFound = true;
        let finalVendorNameDisplay = vendor;

        // Loop through EVERY template required by the contract and demand its file
        for (const templateData of requiredTemplates) {
            const { type: waiverType, rule: timingRule } = templateData;
            
            const jobSettings = window.Workspace.appData.jobNotes?.find(j => String(j["Job ID"]).trim().toLowerCase() === job.toLowerCase()) || {};
            const { endingDay } = calculatePeriodDates(record["Month"], record["Year"], timingRule, jobSettings["Through Day"] || 31);
            const typeLabel = waiverType === "Final" ? "FINAL" : (waiverType === "Conditional" ? "COND" : "UNCOND");
            
            const routing = getWaiverRoutingInfo(job, vendor, record["Month"], record["Year"], endingDay, typeLabel);
            finalVendorNameDisplay = routing.vendorName;

            try {
                const dir = await (await (await window.Workspace.dirHandle.getDirectoryHandle("Waivers")).getDirectoryHandle(job)).getDirectoryHandle(routing.periodFolderName);
                
                while (true) {
                    try { 
                        await dir.getFileHandle(routing.recFileName); 
                        break; // Success! It found this specific required file.
                    } catch { 
                        if (!confirm(`Looking for ${waiverType} waiver...\n\nPlease place file here:\nWaivers \\ ${job} \\ ${routing.periodFolderName} \\\n\nName exactly: ${routing.recFileName}\n\nPress OK when ready, or Cancel to skip this vendor.`)) {
                            allRequiredFilesFound = false;
                            throw "skip"; 
                        }
                    }
                }
            } catch (e) { 
                if (e === "skip") break; // Breaks out of the template loop if they cancelled
                console.error(e); 
                allRequiredFilesFound = false;
            }
        }

        // Only update Excel if they successfully provided ALL required PDFs for the draw
        if (allRequiredFilesFound) {
            const date = prompt(`All waivers found! Received date for ${finalVendorNameDisplay}?`, new Date().toLocaleDateString());
            if (!date) continue;

            Object.assign(record, { 
                "Status": "Received", "Received Date": date, 
                "Last Updated": `${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`, 
                "Updated By": window.Workspace?.currentUser?.name || "System" 
            });
            
            recordsToUpdate.push(record);
            count++;
        }
    }

    if (recordsToUpdate.length) {
        await UpdateExcel(await getFileByPath(window.Workspace.dirHandle, window.WORKSPACE_FILE_PATHS.waivers), recordsToUpdate, "Waiver ID", "Waivers");
        window.renderWaiverTable?.();
        alert(`Successfully marked ${count} draw(s) as Received!`);
    }
};