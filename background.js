// background.js – Service Worker for Style Spy (Manifest V3)
// Handles tab queries and scripting injection requests from the popup.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getActiveTab') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
        return;
      }
      if (!tabs || tabs.length === 0) {
        sendResponse({ error: 'No active tab found.' });
        return;
      }
      sendResponse({ tab: tabs[0] });
    });
    return true; // Keep message channel open for async response
  }

  if (message.action === 'analyzeTab') {
    const tabId = message.tabId;

    // Inject content script and trigger analysis
    chrome.scripting.executeScript(
      {
        target: { tabId: tabId },
        files: ['content.js']
      },
      (injectionResults) => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: chrome.runtime.lastError.message });
          return;
        }

        // After injection, send a message to the content script to extract styles
        chrome.tabs.sendMessage(tabId, { action: 'extractStyles' }, (response) => {
          if (chrome.runtime.lastError) {
            sendResponse({ error: chrome.runtime.lastError.message });
            return;
          }
          sendResponse(response);
        });
      }
    );
    return true; // Keep message channel open for async response
  }
});
