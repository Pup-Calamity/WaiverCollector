// dataLoader.js

async function loadDataset() {
    try {
        // 1. Use the global dirHandle to search
        let waiverFileHandle = await findExcelFile(window.Workspace.dirHandle, "Vendor_Waivers");
        
        // 2. The Manual Fallback
        if (!waiverFileHandle) {
            console.warn("File not found automatically. Prompting user...");
            
            // This forces a popup asking the user to manually find the missing file
            const [manualHandle] = await window.showOpenFilePicker({
                types: [{
                    description: 'Excel Spreadsheets',
                    accept: {'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx']}
                }],
                excludeAcceptAllOption: true,
                multiple: false
            });
            
            // Reassign the handle to the one they just picked
            waiverFileHandle = manualHandle; 
        }

        const requiredHeaders = ["Vendor Name", "Contract Number", "Amount"];
        
        // 3. Save the result directly into your global appData hub
        window.Workspace.appData.waivers = await extractAndValidateData(waiverFileHandle, requiredHeaders);
        
        console.log("Waivers loaded successfully!", window.Workspace.appData.waivers);

    } catch (error) {
        // If they click "Cancel" on the manual popup, it throws an AbortError. We can ignore it safely.
        if (error.name !== 'AbortError') {
            console.error("Data loading failed:", error.message);
            alert("Could not load dataset: " + error.message);
        }
    }
}
