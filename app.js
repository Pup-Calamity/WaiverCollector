import { extractVendorData } from './dataParser.js';
import { stampWaiverWithConfig } from './pdfEngine.js';
import { initTemplateEditor } from './templateEditor.js';
import { generateEmlBlob } from './emailEngine.js';

// Global state to hold the directory connection
let dirHandle;

// 1. Connect Folder & Initialize Systems
document.getElementById('folderBtn').addEventListener('click', async () => {
    try {
        dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        document.getElementById('output').textContent = `Connected to: ${dirHandle.name}\nReady for operations.`;

        // Pass the directory handle to the visual editor so it can save JSON maps
        initTemplateEditor(dirHandle);

        // Enable the main processing button
        document.getElementById('readExcelBtn').disabled = false;
    } catch (error) {
        console.error(error);
        document.getElementById('output').textContent = "Folder connection failed.";
    }
});

// 2. The Main Processing Pipeline
document.getElementById('readExcelBtn').addEventListener('click', async () => {
    try {
        const outputDiv = document.getElementById('output');
        outputDiv.textContent = "Processing pipeline started...\n";

        // A. Define Target (In the final UI, these come from your search boxes)
        const targetJob = "12345";
        const targetVendor = "Acme Concrete";

        // B. Extract Data from Local Excel
        const excelFileHandle = await dirHandle.getFileHandle('Invoices.xlsx', { create: false });
        const excelFile = await excelFileHandle.getFile();
        const excelBuffer = await excelFile.arrayBuffer();

        const vendorData = await extractVendorData(excelBuffer, targetJob, targetVendor);
        outputDiv.textContent += `Data extracted for ${vendorData.vendorName}.\n`;

        // C. Load PDF Template and JSON Config from the /Templates subfolder
        const templatesDir = await dirHandle.getDirectoryHandle('Templates');
        
        // Ensure these exact file names exist in your Templates folder for testing
        const pdfHandle = await templatesDir.getFileHandle('WaiverTemplate.pdf');
        const pdfFile = await pdfHandle.getFile();
        const pdfBuffer = await pdfFile.arrayBuffer();

        const configHandle = await templatesDir.getFileHandle('WaiverTemplate_Config.json');
        const configFile = await configHandle.getFile();
        const configText = await configFile.text();
        const configJson = JSON.parse(configText);

        // D. Stamp the PDF using the mapped coordinates
        const stampedPdfBytes = await stampWaiverWithConfig(pdfBuffer, vendorData, configJson);

        // E. Save the Finished PDF back to the main directory
        const saveFileName = `${vendorData.vendorName}_Waiver.pdf`;
        const newFileHandle = await dirHandle.getFileHandle(saveFileName, { create: true });
        const writable = await newFileHandle.createWritable();
        await writable.write(stampedPdfBytes);
        await writable.close();

        outputDiv.textContent += `Success! Stamped and saved as ${saveFileName}.`;
        
        // 1. Prepare the email contents
        const emailConfig = {
            to: "vendor.contact@example.com",
            cc: "altmanb@lithko.com",
            subject: `Monthly Waiver Request - ${vendorData.projectName}`,
            bodyHTML: `<span style="font-size: 16px; font-family: sans-serif;">
                           Hello,<br><br>
                           Could you please process the attached waiver as soon as you can? 
                           We are expecting the waivers returned shortly.<br><br>
                           Thank you
                       </span>`
        };
        
        // 2. Generate the .eml file blob, passing in the stampedPdfBytes we already made
        const emlBlob = generateEmlBlob(emailConfig, stampedPdfBytes, saveFileName);
        
        // 3. Save the .eml file to the local directory
        const emlFileName = `${vendorData.vendorName}_Waiver_Draft.eml`;
        const emlFileHandle = await dirHandle.getFileHandle(emlFileName, { create: true });
        const emlWritable = await emlFileHandle.createWritable();
        await emlWritable.write(emlBlob);
        await emlWritable.close();
        
        outputDiv.textContent += `\nDraft email saved as ${emlFileName}. Double-click to open in Outlook!`;

    } catch (error) {
        console.error(error);
        document.getElementById('output').textContent += `\nError: ${error.message}`;
    }
});
