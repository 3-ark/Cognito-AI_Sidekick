import { getCurrentTab, injectContentScript } from 'src/background/util';
import buildStoreWithDefaults from 'src/state/store';
import storage from 'src/background/storageUtil';
import ChannelNames from '../types/ChannelNames'; 
import MessageType from '../types/ChannelNames'; 
import { 
    getAllNotesFromSystem, 
    saveNoteInSystem, 
    deleteNoteFromSystem, 
    deleteAllNotesFromSystem, 
    getNoteByIdFromSystem 
} from './noteStorage';
import { 
    search, 
    engineInitializationPromise, 
    HydratedSearchResultItem, 
    indexSingleNote, 
    removeNoteFromIndex, 
    indexNotes, // This is indexAllFullRebuild
    indexSingleChatMessage,
    removeChatMessageFromIndex,
    indexChatMessages // Specific re-indexer for chats
} from './searchUtils';
import { Note, NOTE_STORAGE_PREFIX, NoteWithEmbedding } from '../types/noteTypes'; // Import NOTE_STORAGE_PREFIX
import { 
    getChatMessageById, 
    CHAT_STORAGE_PREFIX, 
    saveChatMessage, 
    deleteChatMessage, 
    deleteAllChatMessages,
    getAllChatMessages as storageGetAllChats // Alias to avoid conflict if any
} from './chatHistoryStorage'; 

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
  title: "Add to Cognito Memory Note",
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
      title: "Add to Cognito Memory Note",
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
  // Ensure the message structure is what you expect
  if (!message || !message.type) {
    // console.warn('Received message without type:', message); // This can be noisy
    return true; // Still return true as a best practice for onMessage listeners
  }

  // SEARCH_NOTES_REQUEST handler
  if (message.type === MessageType.SEARCH_NOTES_REQUEST) {
    const { query, topK } = message.payload;
    (async () => {
      try {
        await engineInitializationPromise; // Ensure engine is ready
        const rawResults = await search(query, topK);
        const hydratedResults: HydratedSearchResultItem[] = [];

        for (const [id, score] of rawResults) {
          if (id.startsWith(NOTE_STORAGE_PREFIX)) {
            const note = await getNoteByIdFromSystem(id);
            if (note) {
              hydratedResults.push({
                id: note.id,
                type: 'note',
                title: note.title || 'Untitled Note',
                score: score,
                content: note.content || '',
                note: note,
              });
            }
          } else if (id.startsWith(CHAT_STORAGE_PREFIX)) {
            const chat = await getChatMessageById(id);
            if (chat) {
              hydratedResults.push({
                id: chat.id,
                type: 'chat',
                title: chat.title || `Chat from ${new Date(chat.last_updated).toLocaleDateString()}`,
                score: score,
                content: chat.turns.map(t => t.content).join('\n'), // Concatenate turns for snippet/content
                chat: chat,
              });
            }
          } else {
            console.warn(`[Search Handler] Unknown item type for ID: ${id}`);
          }
        }
        sendResponse({ success: true, results: hydratedResults });
      } catch (error: any) {
        console.error('[Search Handler] Error during search:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Indicates asynchronous response, as we are using async/await inside
  }

  if (message.type === 'SIDE_PANEL_READY') {
    const tabId = message.tabId;

    if (!tabId) {
      console.error('[Background] SIDE_PANEL_READY received, but tabId is missing in the message payload.');
      sendResponse({ status: "error", message: "Missing tabId" });
      return false; // Return false as we are not handling this message asynchronously if tabId is missing
    }
    console.log(`[Background] SIDE_PANEL_READY received for tab ${tabId}.`);

    if (pendingPageContentPayloads.has(tabId)) {
      const payloadFromPending = pendingPageContentPayloads.get(tabId)!;
      const messageTypeToDispatch = payloadFromPending.title === "Error" ? "ERROR_OCCURRED" : "CREATE_NOTE_FROM_PAGE_CONTENT";
      const messagePayload = payloadFromPending.title === "Error" ? payloadFromPending.content : payloadFromPending;

      console.log(`[Background] Found pending payload for tab ${tabId}. Sending ${messageTypeToDispatch} to the extension runtime.`);

      chrome.runtime.sendMessage({
        type: messageTypeToDispatch,
        payload: messagePayload
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error(`[Background] Error sending ${messageTypeToDispatch} to runtime. Side panel might not be ready. Error:`, chrome.runtime.lastError.message);
        } else {
          console.log(`[Background] Side panel acknowledged receipt of ${messageTypeToDispatch}. Response:`, response);
        }
      });

      pendingPageContentPayloads.delete(tabId);
      sendResponse({ status: "Payload delivery initiated via runtime message." });

    } else {
      console.log(`[Background] SIDE_PANEL_READY received for tab ${tabId}, but no pending payload was found. This is normal if the user opened the panel manually.`);
      sendResponse({ status: "Ready signal received, no pending action." });
    }
    return true; // Indicates that sendResponse will be called asynchronously
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
    return true; // Indicates that sendResponse will be called asynchronously
  }
  // It's important to return true from the event listener if you want to send a response asynchronously.
  // If multiple handlers could potentially handle a message, ensure only one calls sendResponse or structure carefully.
  // If no specific handler matches and you don't intend to send a response, you can omit returning true.
  // However, to be safe and avoid "The message port closed before a response was received" errors,
  // it's often recommended to return true if any path might call sendResponse asynchronously.
  return true; 
});

// TEMPORARY DEBUGGING - REMOVE LATER
import { search as debugSearchUtil } from './searchUtils';
(globalThis as any).performBgSearch = async (query: string) => {
  console.log(`[DEBUG] Performing background search for: "${query}"`);
  await engineInitializationPromise; // Make sure engine is ready
  const rawResults = await debugSearchUtil(query, 10);
  console.log('[DEBUG] Raw Results:', rawResults);
  // Optional: Add hydration here if you want to see full objects
  const hydrated = [];
  for (const [id, score] of rawResults) {
    if (id.startsWith('cognito_note_')) { // Use your actual NOTE_STORAGE_PREFIX
      const note = await getNoteByIdFromSystem(id);
      if (note) hydrated.push({type: 'note', score, ...note});
    }
    // Add chat hydration if you want here too
  }
  console.log('[DEBUG] Hydrated Results:', hydrated);
  return hydrated;
};
// Exporting functions for external use
export {};
