document.getElementById('openSidePanel').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    chrome.sidePanel.open({ windowId: tab.windowId });
  }
  window.close();
});

document.getElementById('openDashboard').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://deepseek-ai-en24.onrender.com' });
  window.close();
});
