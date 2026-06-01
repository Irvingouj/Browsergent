/**
 * Background service worker.
 *
 * Browser command routing is handled by extension-js's runner directly
 * from the side panel main thread.
 * This service worker only handles side panel opening and tab tracking.
 */

chrome.tabs.onUpdated.addListener((_tabId, _changeInfo, _tab) => {
	// Tab state changes — kept for future use (e.g., badge updates)
});

chrome.action.onClicked.addListener(async (tab) => {
	if (!tab.id) return;
	await chrome.sidePanel.open({ tabId: tab.id });
});
