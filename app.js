// app.js
import { stampWaiver } from './pdfEngine.js';

// Dummy data to test the stamp
const currentVendor = {
    projectName: "Red River Gorge Visitor Center",
    vendorName: "Acme Concrete",
    amount: "45,000.00"
};

document.getElementById('generatePdfBtn').addEventListener('click', async () => {
    try {
        // 1. Get the template from your connected local /Templates folder
        const templatesDir = await dirHandle.getDirectoryHandle('Templates');
        const templateFileHandle = await templatesDir.getFileHandle('Blank_Waiver.pdf');
        const file = await templateFileHandle.getFile();
        const arrayBuffer = await file.arrayBuffer();

        // 2. Pass the blank PDF and data to your new engine
        const stampedPdfBytes = await stampWaiver(arrayBuffer, currentVendor);

        // 3. Save the finished PDF back to the local folder
        const newFileHandle = await dirHandle.getFileHandle(`${currentVendor.vendorName}_Waiver.pdf`, { create: true });
        const writable = await newFileHandle.createWritable();
        await writable.write(stampedPdfBytes);
        await writable.close();

        console.log("Waiver stamped and saved successfully!");
    } catch (error) {
        console.error("Failed to generate PDF:", error);
    }
});
