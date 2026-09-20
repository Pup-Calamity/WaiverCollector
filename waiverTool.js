// waiverTool.js

// --- Navigation ---
document.getElementById('launchWaiverToolBtn').addEventListener('click', () => {
    switchView('waiverToolView');
    renderWaiverTable(); // We will build this next!
});

document.getElementById('backToHubBtn').addEventListener('click', () => {
    switchView('processingWorkspace');
});
