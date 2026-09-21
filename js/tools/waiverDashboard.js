// js/tools/waiverDashboard.js

const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

window.addEventListener('DOMContentLoaded', () => {
    
    // UI Navigation Hooks
    const launchBtn = document.getElementById('launchDashboardBtn'); // Assuming you add a button on your Hub
    if (launchBtn) {
        launchBtn.addEventListener('click', () => {
            if (!window.Workspace.appData.waivers) return alert("Please sync data first.");
            switchView('waiverDashboardView');
            populateYearFilter();
            renderWaiverTable();
        });
    }

    const backBtn = document.getElementById('backToHubFromDashboardBtn');
    if (backBtn) backBtn.addEventListener('click', () => switchView('processingWorkspace'));

    // Filter Listeners (Trigger live updates)
    document.getElementById('dashboardSearch').addEventListener('input', renderWaiverTable);
    document.getElementById('dashboardMonth').addEventListener('change', renderWaiverTable);
    document.getElementById('dashboardYear').addEventListener('change', renderWaiverTable);

    // Modal Close
    document.getElementById('closeNotesModalBtn').addEventListener('click', () => {
        document.getElementById('readNotesModal').close();
    });
});

// --- Dynamic Year Dropdown ---
function populateYearFilter() {
    const waivers = window.Workspace.appData.waivers || [];
    const yearSelect = document.getElementById('dashboardYear');
    
    // Extract unique years from the dataset, sort descending
    const uniqueYears = [...new Set(waivers.map(w => String(w["Year"]).trim()))].filter(y => y && y !== "undefined");
    uniqueYears.sort((a, b) => b - a);

    // Keep the "All Years" option, then append dynamic years
    yearSelect.innerHTML = '<option value="">All Years</option>';
    uniqueYears.forEach(year => {
        const opt = document.createElement('option');
        opt.value = year;
        opt.textContent = year;
        yearSelect.appendChild(opt);
    });
}

// --- Master Table Renderer ---
window.renderWaiverTable = function() {
    const waivers = window.Workspace.appData.waivers || [];
    const tbody = document.getElementById('waiverTableBody');
    
    const searchVal = document.getElementById('dashboardSearch').value.toLowerCase();
    const monthVal = document.getElementById('dashboardMonth').value;
    const yearVal = document.getElementById('dashboardYear').value;

    tbody.innerHTML = "";

    // Sort waivers newest first based on Action Date (or fallback to ID)
    const sortedWaivers = [...waivers].reverse(); 

    let matchCount = 0;

    for (const row of sortedWaivers) {
        const jobId = String(row["Job ID"] || "").trim();
        const vendorId = String(row["Vendor ID"] || "").trim();
        const customerId = String(row["Customer ID"] || "").trim();
        
        // Smart Lookup: Fetch names from ContractInfo or default to "Unknown"
        const jobName = WaiverMath.getEmailInfo(jobId, vendorId, "Job Name") || "Unknown Job";
        const vendorName = WaiverMath.getEmailInfo(jobId, vendorId, "Vendor Name") || "Unknown Vendor";

        // 1. FILTER: Month & Year
        if (monthVal && String(row["Month"]).trim() !== monthVal) continue;
        if (yearVal && String(row["Year"]).trim() !== yearVal) continue;

        // 2. FILTER: Search Bar (Checks IDs and Names)
        const searchString = `${jobId} ${jobName} ${vendorId} ${vendorName} ${customerId}`.toLowerCase();
        if (searchVal && !searchString.includes(searchVal)) continue;

        matchCount++;
        if (matchCount > 200) break; // Limit to 200 rows for DOM performance

        // 3. Format Status Color Bubble
        const status = String(row["Status"] || "").trim();
        let statusStyle = "background: #e2e8f0; color: #475569;"; // Default gray
        if (status.toLowerCase() === "ready") statusStyle = "background: #dbeafe; color: #1d4ed8;";
        if (status.toLowerCase() === "sent") statusStyle = "background: #fef9c3; color: #854d0e;";
        if (status.toLowerCase() === "received" || status.toLowerCase() === "paid") statusStyle = "background: #dcfce7; color: #15803d;";
        if (status.toLowerCase().includes("held")) statusStyle = "background: #fee2e2; color: #b91c1c;";

        // 4. Convert Month Number to Name
        const monthNum = parseInt(row["Month"]);
        const displayMonth = !isNaN(monthNum) && monthNum >= 1 && monthNum <= 12 ? monthNames[monthNum] : row["Month"];

        const tr = document.createElement('tr');
        tr.style.borderBottom = "1px solid var(--border-color)";
        
        tr.innerHTML = `
            <td style="padding: 12px;"><strong>${row["Waiver ID"] || ""}</strong></td>
            <td style="padding: 12px;">
                <div style="font-weight: bold;">${jobId}</div>
                <div style="font-size: 0.85em; color: var(--text-muted);">${jobName}</div>
            </td>
            <td style="padding: 12px;">
                <div style="font-weight: bold;">${vendorId}</div>
                <div style="font-size: 0.85em; color: var(--text-muted);">${vendorName}</div>
            </td>
            <td style="padding: 12px;">${displayMonth}</td>
            <td style="padding: 12px;">
                <span style="padding: 4px 8px; border-radius: 12px; font-size: 0.85em; font-weight: bold; ${statusStyle}">${status}</span>
            </td>
            <td style="padding: 12px;">${row["Sent Date"] || "-"}</td>
            <td style="padding: 12px;">${row["Received Date"] || "-"}</td>
            <td style="padding: 12px;">${row["Action Date"] || "-"}</td>
            <td style="padding: 12px; text-align: center;">
                <button class="icon-btn read-notes-btn" style="background: transparent; font-size: 1.2em; border: none; cursor: pointer;">📝</button>
            </td>
        `;

        // Bind the Notes Modal payload
        const notesBtn = tr.querySelector('.read-notes-btn');
        const rawNotes = row["Notes"] || "No notes available.";
        notesBtn.addEventListener('click', () => {
            document.getElementById('notesModalContent').textContent = rawNotes;
            document.getElementById('readNotesModal').showModal();
        });

        tbody.appendChild(tr);
    }

    if (matchCount === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="padding: 20px; text-align: center; color: var(--text-muted);">No waivers found matching these filters.</td></tr>`;
    }
};
