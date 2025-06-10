import { getCurrentTab, injectContentScript } from 'src/background/util';
import buildStoreWithDefaults from 'src/state/store';
import storage from 'src/background/storageUtil';
import ChannelNames from '../types/ChannelNames';

buildStoreWithDefaults({ channelName: ChannelNames.ContentPort });

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(console.error);

const pendingPageContentPayloads = new Map<number, { title: string; content: string; url?: string }>();

const ADD_TO_NOTE_MENU_ID = "cognitoAddToNoteSelection";
const ADD_PAGE_TO_NOTE_SYSTEM_MENU_ID = "cognitoAddPageToNoteSystem";
const processingAddPageActions = new Set<number>();

chrome.contextMenus.create({
  id: ADD_TO_NOTE_MENU_ID,
  title: "Add to Cognito Note",
  contexts: ["selection"],
  enabled: false,
}, () => {
  if (chrome.runtime.lastError) {
    const knownMessages = ['duplicate id ' + ADD_TO_NOTE_MENU_ID, 'item already exists'];
    if (!knownMessages.some(msg => chrome.runtime.lastError?.message?.includes(msg))) {
      console.warn(`Initial attempt to create context menu '${ADD_TO_NOTE_MENU_ID}' encountered an issue: ${chrome.runtime.lastError.message}`);
    }
  }
});
chrome.contextMenus.create({
  id: ADD_PAGE_TO_NOTE_SYSTEM_MENU_ID,
  title: "Add Page to Cognito Note System",
  contexts: ["page"],
  enabled: true,
}, () => {
  if (chrome.runtime.lastError) {
    const knownMessages = ['duplicate id ' + ADD_PAGE_TO_NOTE_SYSTEM_MENU_ID, 'item already exists'];
    if (!knownMessages.some(msg => chrome.runtime.lastError?.message?.includes(msg))) {
      console.warn(`Initial attempt to create context menu '${ADD_PAGE_TO_NOTE_SYSTEM_MENU_ID}' encountered an issue: ${chrome.runtime.lastError.message}`);
    }
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.remove(ADD_TO_NOTE_MENU_ID, () => {
    if (chrome.runtime.lastError && 
        !chrome.runtime.lastError.message?.includes("No such context menu") &&
        !chrome.runtime.lastError.message?.includes("Cannot find menu item")) {
      console.warn(`Error removing context menu '${ADD_TO_NOTE_MENU_ID}' during onInstalled: ${chrome.runtime.lastError.message}`);
    }
    chrome.contextMenus.create({
      id: ADD_TO_NOTE_MENU_ID,
      title: "Add to Cognito Note",
      contexts: ["selection"],
      enabled: false,
    }, () => {
      if (chrome.runtime.lastError) 
        console.error(`Error creating/recreating context menu '${ADD_TO_NOTE_MENU_ID}' in onInstalled: ${chrome.runtime.lastError.message}`);
    });
  });

  chrome.contextMenus.remove(ADD_PAGE_TO_NOTE_SYSTEM_MENU_ID, () => {
    if (chrome.runtime.lastError &&
        !chrome.runtime.lastError.message?.includes("No such context menu") &&
        !chrome.runtime.lastError.message?.includes("Cannot find menu item")) {
      console.warn(`Error removing context menu '${ADD_PAGE_TO_NOTE_SYSTEM_MENU_ID}' during onInstalled: ${chrome.runtime.lastError.message}`);
    }
    chrome.contextMenus.create({
      id: ADD_PAGE_TO_NOTE_SYSTEM_MENU_ID,
      title: "Add Page to Cognito Note System",
      contexts: ["page"],
      enabled: true,
    }, () => { if (chrome.runtime.lastError) console.error(`Error creating/recreating context menu '${ADD_PAGE_TO_NOTE_SYSTEM_MENU_ID}' in onInstalled: ${chrome.runtime.lastError.message}`); });
  });
});

const sendMessageToContentScriptWithRetry = (tabId: number, message: any, maxRetries = 4, retryDelay = 300): Promise<any> => {
  return new Promise((resolve, reject) => {
    let attempt = 0;
    const trySend = () => {
      attempt++;
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          const errorMessage = chrome.runtime.lastError.message || "Unknown error";
          if (attempt < maxRetries && (errorMessage.includes("Could not establish connection") || errorMessage.includes("Receiving end does not exist"))) {
            console.warn(`[Background] Attempt ${attempt}/${maxRetries} to send message to content script in tab ${tabId} failed: ${errorMessage}. Retrying in ${retryDelay}ms...`);
            setTimeout(trySend, retryDelay);
          } else {
            console.error(`[Background] Failed to send message to content script in tab ${tabId} after ${attempt} attempts: ${errorMessage}`);
            reject(chrome.runtime.lastError);
          }
        } else {
          resolve(response);
        }
      });
    };
    trySend();
  });
};

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === ADD_TO_NOTE_MENU_ID && sidePanelPortGlobal) {
    if (info.selectionText) {
      sidePanelPortGlobal.postMessage({
        type: "ADD_SELECTION_TO_NOTE",
        payload: info.selectionText.trim()
      });
    } else {
      console.warn("Context menu 'Add to Cognito Note' clicked, but no selectionText found.");
    }
  } else if (info.menuItemId === ADD_PAGE_TO_NOTE_SYSTEM_MENU_ID && tab?.id) {
    const currentTabId = tab.id;

    if (processingAddPageActions.has(currentTabId)) {
        console.warn(`[Background] Action ${ADD_PAGE_TO_NOTE_SYSTEM_MENU_ID} is already in progress for tab ${currentTabId}. Ignoring duplicate request.`);
        return;
    }
    processingAddPageActions.add(currentTabId);
    console.log(`[Background] Started processing ${ADD_PAGE_TO_NOTE_SYSTEM_MENU_ID} for tab ${currentTabId}.`);

    (async () => {
        try {
            console.log(`[Background] Action: ${ADD_PAGE_TO_NOTE_SYSTEM_MENU_ID}. Attempting to open side panel for tab ${currentTabId}.`);
            await chrome.sidePanel.open({ tabId: currentTabId });
            console.log(`[Background] Side panel open command issued for tab ${currentTabId}.`);

            const contentScriptFile = 'content.js';
            let scriptInjectedOrEnsured = false;
            try {
                console.log(`[Background] Ensuring content script ('${contentScriptFile}') is active in tab ${currentTabId}.`);
                await chrome.scripting.executeScript({
                    target: { tabId: currentTabId },
                    files: [contentScriptFile],
                });
                console.log(`[Background] Content script injection/execution of '${contentScriptFile}' ensured for tab ${currentTabId}.`);
                scriptInjectedOrEnsured = true;
              } catch (e: any) {
                if (e.message?.includes('already injected')) {
                    console.warn(`[Background] Content script already present in tab ${currentTabId}.`);
                    scriptInjectedOrEnsured = true;
                  } else {
                    console.error(`[Background] Failed to inject content script '${contentScriptFile}' into tab ${currentTabId}:`, e);
                    pendingPageContentPayloads.set(currentTabId, { title: "Error", content: "Failed to prepare page for content extraction." });
                    processingAddPageActions.delete(currentTabId);
                    console.log(`[Background] Cleared processing flag for tab ${currentTabId} due to content script injection error.`);
                    return; 
                }
            }

            if (!scriptInjectedOrEnsured) {
                console.error(`[Background] Content script was not ensured for tab ${currentTabId}. Aborting.`);
                processingAddPageActions.delete(currentTabId);
                return;
            }

            console.log(`[Background] Sending DEFUDDLE_PAGE_CONTENT to content script in tab ${currentTabId}.`);
            sendMessageToContentScriptWithRetry(currentTabId, { type: "DEFUDDLE_PAGE_CONTENT" })
              .then((response) => {
                if (response && response.success) {
                    console.log(`[Background] Received defuddled content for tab ${currentTabId}. Storing it.`);
                    pendingPageContentPayloads.set(currentTabId, { title: response.title, content: response.content, url: response.url });
                } else {
                    console.warn(`[Background] Failed to defuddle page content for tab ${currentTabId}. Response:`, response);
                    const errorMessage = response?.error || "Unknown error processing page content.";
                    pendingPageContentPayloads.set(currentTabId, { title: "Error", content: errorMessage, url: tab?.url });
                }
              })
              .catch((error) => {
                console.error(`[Background] Error sending/receiving DEFUDDLE_PAGE_CONTENT for tab ${currentTabId} after retries:`, error.message);
                pendingPageContentPayloads.set(currentTabId, { title: "Error", content: `Failed to get page content: ${error.message}. The page might be protected or need a reload.`, url: tab?.url });
              })
              .finally(() => {
                console.log(`[Background] Requesting side panel to switch to Note System View for tab ${currentTabId}.`);
                chrome.runtime.sendMessage({
                    type: "ACTIVATE_NOTE_SYSTEM_VIEW",
                    payload: { tabId: currentTabId }
                }, (activationResponse) => {
                    if (chrome.runtime.lastError) {
                        console.error(`[Background] Error sending ACTIVATE_NOTE_SYSTEM_VIEW to side panel: ${chrome.runtime.lastError.message}`);
                    } else {
                        console.log(`[Background] Side panel acknowledged ACTIVATE_NOTE_SYSTEM_VIEW. Response:`, activationResponse);
                    }
                });

                processingAddPageActions.delete(currentTabId);
                console.log(`[Background] Cleared processing flag for tab ${currentTabId} after DEFUDDLE_PAGE_CONTENT attempt.`);
              });
        } catch (error: any) {
            console.error(`[Background] Error during '${ADD_PAGE_TO_NOTE_SYSTEM_MENU_ID}' main execution for tab ${currentTabId}:`, error.message, error.stack);
            if (chrome.notifications) {
                 chrome.notifications.create("cognitoMainActionError_" + Date.now(), {
                    type: 'basic',
                    iconUrl: chrome.runtime.getURL('icons/icon48.png'),
                    title: 'Cognito Action Error',
                    message: `Could not process page: ${error.message}. Try reloading the page or the extension.`
                });
            }
            processingAddPageActions.delete(currentTabId);
            console.log(`[Background] Cleared processing flag for tab ${currentTabId} due to main execution error.`);
        }
    })();
  }
});

const sendMessageToSidePanelWithRetry = (messageToSidePanel: any): Promise<any> => {
  const MAX_RETRIES = 4;
  const RETRY_DELAY_MS = 350;

  return new Promise((resolve, reject) => {
    let attempt = 0;
    const trySendMessage = () => {
      attempt++;
      chrome.runtime.sendMessage(messageToSidePanel, (response) => {
        if (chrome.runtime.lastError) {
          const errorMessage = chrome.runtime.lastError.message || "Unknown error";

          if (attempt < MAX_RETRIES &&
              (errorMessage.includes("Could not establish connection") ||
               errorMessage.includes("The message port closed before a response was received"))) {
            setTimeout(trySendMessage, RETRY_DELAY_MS);
          } else {
            reject(errorMessage);
          }
        } else {
          resolve(response);
        }
      });
    };
    setTimeout(trySendMessage, RETRY_DELAY_MS / 2);
  });
};

let sidePanelPortGlobal: chrome.runtime.Port | null = null;

chrome.runtime.onConnect.addListener(port => {
  if (port.name === ChannelNames.SidePanelPort) {
    sidePanelPortGlobal = port;
    setTimeout(() => {
      chrome.contextMenus.update(ADD_TO_NOTE_MENU_ID, { enabled: true }, () => {
        if (chrome.runtime.lastError) {
          console.error("Error enabling context menu (after timeout):", chrome.runtime.lastError.message);
        }
      });
    }, 0);

    let tabListenersActive = false;

    const handleTabActivated = async (activeInfo: chrome.tabs.TabActiveInfo) => {
      const tab = await chrome.tabs.get(activeInfo.tabId);
      if (tab?.url && !tab.url.startsWith('chrome')) {
        injectContentScript(activeInfo.tabId);
      }
    };

    const handleTabUpdated = async (tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
      if (tab?.url && changeInfo.status === 'complete' && !tab.url.startsWith('chrome')) {
        injectContentScript(tabId);
      }
    };

    port.onMessage.addListener(async (msg) => {
      if (msg.type === 'init') {
        const tab = await getCurrentTab();
        if (tab?.id && tab.url && !tab.url.startsWith('chrome')) {
          injectContentScript(tab.id);
        }

        if (!tabListenersActive) {
          chrome.tabs.onActivated.addListener(handleTabActivated);
          chrome.tabs.onUpdated.addListener(handleTabUpdated);
          tabListenersActive = true;
        }
      }
    });

    port.onDisconnect.addListener(() => {
      chrome.contextMenus.update(ADD_TO_NOTE_MENU_ID, { enabled: false }, () => {
        if (chrome.runtime.lastError) {
          console.warn("Error disabling context menu:", chrome.runtime.lastError.message);
        }
      });
      if (sidePanelPortGlobal === port) {
        sidePanelPortGlobal = null;
      }

      if (tabListenersActive) {
        chrome.tabs.onActivated.removeListener(handleTabActivated);
        chrome.tabs.onUpdated.removeListener(handleTabUpdated);
        tabListenersActive = false;
      }
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SIDE_PANEL_READY') {
    const tabId = message.tabId;

    if (!tabId) {
      console.error('[Background] SIDE_PANEL_READY received, but tabId is missing in the message payload.');
      sendResponse({ status: "error", message: "Missing tabId" });
      return false;
    }
    console.log(`[Background] SIDE_PANEL_READY received for tab ${tabId}.`);

    if (pendingPageContentPayloads.has(tabId)) {
      const payloadFromPending = pendingPageContentPayloads.get(tabId)!;
      const messageType = payloadFromPending.title === "Error" ? "ERROR_OCCURRED" : "CREATE_NOTE_FROM_PAGE_CONTENT";
      const messagePayload = payloadFromPending.title === "Error" ? payloadFromPending.content : payloadFromPending;

      console.log(`[Background] Found pending payload for tab ${tabId}. Sending ${messageType} to the extension runtime.`);

      chrome.runtime.sendMessage({
        type: messageType,
        payload: messagePayload
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error(`[Background] Error sending ${messageType} to runtime. Side panel might not be ready. Error:`, chrome.runtime.lastError.message);
        } else {
          console.log(`[Background] Side panel acknowledged receipt of ${messageType}. Response:`, response);
        }
      });

      pendingPageContentPayloads.delete(tabId);
      sendResponse({ status: "Payload delivery initiated via runtime message." });

    } else {
      console.log(`[Background] SIDE_PANEL_READY received for tab ${tabId}, but no pending payload was found. This is normal if the user opened the panel manually.`);
      sendResponse({ status: "Ready signal received, no pending action." });
    }
    return true;
  }

  if (message.type === 'SAVE_NOTE_TO_FILE' && message.payload) {
    const { content } = message.payload;
    if (content) {
      const filename = `cognito_note_${new Date().toISOString().replace(/[:.]/g, '-')}.md`;
      const dataUrl = `data:text/markdown;charset=utf-8,${encodeURIComponent(content)}`;
      chrome.downloads.download({
        url: dataUrl,
        filename: filename,
        saveAs: true
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error('Download failed:', chrome.runtime.lastError);
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else if (downloadId) {
          console.log('Download started with ID:', downloadId);
          sendResponse({ success: true, downloadId });
         } else {
           console.warn('Download did not start, downloadId is undefined.');
           sendResponse({ success: false, error: 'Download did not start (downloadId undefined).' });
        }
      });
    } else {
        sendResponse({ success: false, error: 'No content provided for saving note.'});
    }
    return true;
  }
  return true;
});

export {};