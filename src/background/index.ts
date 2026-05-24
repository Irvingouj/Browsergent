/** Background service worker: routes messages and injects content script. */

import type { BrowserCommand, BrowserResult } from "../types/browser";

const CONTENT_SCRIPT_PATH = "content-script.js";

const injectedTabs = new Set<number>();

async function ensureContentScript(tabId: number): Promise<void> {
  if (injectedTabs.has(tabId)) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [CONTENT_SCRIPT_PATH],
    });
    injectedTabs.add(tabId);
  } catch {
    // Tab may not support scripting; will fail gracefully
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    injectedTabs.delete(tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  injectedTabs.delete(tabId);
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  await chrome.sidePanel.open({ tabId: tab.id });
});

interface WorkerToBackgroundMsg {
  type: "browserCommand";
  command: BrowserCommand;
}

interface CommandResponse {
  type: "commandResult";
  result: BrowserResult;
}

chrome.runtime.onMessage.addListener(
  (message: WorkerToBackgroundMsg, _sender, sendResponse) => {
    if (message.type !== "browserCommand") return false;

    handleBrowserCommand(message.command)
      .then(sendResponse)
      .catch((err: Error) => {
        const result: CommandResponse = {
          type: "commandResult",
          result: {
            ok: false,
            error: err.message,
            code: "E_UNKNOWN" as const,
          },
        };
        sendResponse(result);
      });

    return true;
  }
);

async function handleBrowserCommand(
  command: BrowserCommand,
): Promise<CommandResponse> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return {
      type: "commandResult",
      result: { ok: false, error: "No active tab", code: "E_PERMISSION" },
    };
  }

  if (command.kind === "page.goto") {
    await chrome.tabs.update(tab.id, { url: command.url });
    return {
      type: "commandResult",
      result: { ok: true, value: { navigated: true } },
    };
  }

  if (command.kind === "page.back") {
    await chrome.tabs.goBack(tab.id);
    return {
      type: "commandResult",
      result: { ok: true, value: { navigated: true } },
    };
  }

  if (command.kind === "page.forward") {
    await chrome.tabs.goForward(tab.id);
    return {
      type: "commandResult",
      result: { ok: true, value: { navigated: true } },
    };
  }

  if (command.kind === "page.reload") {
    await chrome.tabs.reload(tab.id);
    return {
      type: "commandResult",
      result: { ok: true, value: { navigated: true } },
    };
  }

  await ensureContentScript(tab.id);

  return new Promise<CommandResponse>((resolve) => {
    chrome.tabs.sendMessage(
      tab.id!,
      { type: "executeCommand", command },
      (response: CommandResponse) => {
        if (chrome.runtime.lastError) {
          resolve({
            type: "commandResult",
            result: {
              ok: false,
              error: chrome.runtime.lastError.message ?? "Content script error",
              code: "E_PERMISSION",
            },
          });
          return;
        }
        resolve(response);
      },
    );
  });
}
