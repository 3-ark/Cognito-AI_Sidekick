import { getCurrentTab, injectContentScript } from 'src/background/util';
import buildStoreWithDefaults from 'src/state/store';
import storage from 'src/background/storageUtil';
import ChannelNames from '../types/ChannelNames'; 
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
    rebuildFullIndex,
    indexSingleChatMessage,
    removeChatMessageFromIndex,
} from './searchUtils';
import { configureEmbeddingService, ensureEmbeddingServiceConfigured } from './embeddingUtils';
import { Note, NoteWithEmbedding } from '../types/noteTypes';
import { EmbeddingModelConfig, Config } from 'src/types/config'; // Added import for Config
import { 
    getChatMessageById, 
    CHAT_STORAGE_PREFIX, 
    saveChatMessage, 
    deleteChatMessage, 
    deleteAllChatMessages,
    getAllChatMessages as storageGetAllChats // Alias to avoid conflict if any
} from './chatHistoryStorage'; 
import { getHybridRankedChunks, formatResultsForLLM } from './retrieverUtils'; 
import { NOTE_STORAGE_PREFIX } from './noteStorage';
import { rebuildAllEmbeddings, updateMissingEmbeddings } from './ragOperations';
import { MCPClient } from './mcp-client';

const initiallyIndexedChatsInSession = new Set<string>();
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

    const handleTabActivated = async (activeInfo: chrome.tabs.OnActivatedInfo) => {
      const tab = await chrome.tabs.get(activeInfo.tabId);
      if (tab?.url && !tab.url.startsWith('chrome')) {
        injectContentScript(activeInfo.tabId);
      }
    };

    const handleTabUpdated = async (tabId: number, changeInfo: chrome.tabs.OnUpdatedInfo, tab: chrome.tabs.Tab) => {
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
  if (message.type === 'SEARCH_NOTES_REQUEST') {
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
      const filename = `note_${new Date().toISOString().replace(/[:.]/g, '-')}.md`;
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

  // SAVE_NOTE_REQUEST handler
  if (message.type === 'SAVE_NOTE_REQUEST' && message.payload) {
    (async () => {
      try {
        const noteToSave = message.payload;
        // Ensure content is present, as saveNoteInSystem expects it.
        // Title is made optional by saveNoteInSystem if content exists.
        if (typeof noteToSave.content !== 'string') {
            throw new Error("Note content is missing or not a string.");
        }
        const savedNote = await saveNoteInSystem(noteToSave);
        await indexSingleNote(savedNote); 
        sendResponse({ success: true, note: savedNote, warning: null }); // Added warning: null for consistency
      } catch (error: any) {
        console.error('[Background] Error saving or indexing note:', error);
        // Check if it's a custom error object with a 'warning' property, otherwise default
        const warningMessage = typeof error === 'object' && error !== null && 'warning' in error ? error.warning as string : null;
        sendResponse({ success: false, error: error.message, warning: warningMessage });
      }
    })();
    return true; // Indicates asynchronous response
  }

  // GET_HYBRID_SEARCH_RESULTS handler
  if (message.type === 'GET_HYBRID_SEARCH_RESULTS' && message.payload) {
    const { query } = message.payload;
    (async () => {
      try {
        const configStr: string | null = await storage.getItem('config');
        const config: Config | null = configStr ? JSON.parse(configStr) : null;

        if (!config) {
          throw new Error("Configuration not found. Cannot perform hybrid search.");
        }

        const hybridChunks = await getHybridRankedChunks(query, config);
        
        sendResponse({ success: true, results: hybridChunks });

      } catch (error: any) {
        console.error('[Background] Error getting hybrid search results:', error);
        sendResponse({ success: false, error: error.message, results: [] });
      }
    })();
    return true;
  }

  // SAVE_CHAT_REQUEST handler
  if (message.type === 'SAVE_CHAT_REQUEST' && message.payload) {
    (async () => {
      try {
        const chatToSave = message.payload;
          if (!chatToSave.id) { // Ensure chatToSave has an id
            console.error('[Background] Chat to save has no ID. Skipping save/index.', chatToSave);
            sendResponse({ success: false, error: "Chat has no ID.", chat: null });
            return;
          }
          // It's okay to save a chat with no turns to localforage (e.g., if user clears input and it triggers a save)
          // but we won't try to index it if there are no turns.
          
          // Always save to localforage for persistence
          const savedChat = await saveChatMessage(chatToSave);
          let indexedInThisCall = false;

          // Conditionally index in BM25 only if it's the first time seeing this chat ID in this session
          // AND there are turns to index.
          if (savedChat.turns && savedChat.turns.length > 0 && !initiallyIndexedChatsInSession.has(savedChat.id)) {
            console.log(`[Background] Chat ${savedChat.id} is new to this session or needs initial indexing (has turns). Indexing...`);
            await indexSingleChatMessage(savedChat);
            initiallyIndexedChatsInSession.add(savedChat.id);
            indexedInThisCall = true;
            console.log(`[Background] Chat ${savedChat.id} marked as initially indexed for this session.`);
          } else if (initiallyIndexedChatsInSession.has(savedChat.id)) {
            // console.log(`[Background] Chat ${savedChat.id} already initially indexed. Skipping BM25 re-index for this save.`);
          } else if (!savedChat.turns || savedChat.turns.length === 0) {
            // console.log(`[Background] Chat ${savedChat.id} has no turns. Skipping initial indexing.`);
          }
          
          sendResponse({ success: true, chat: savedChat, indexed: indexedInThisCall });
        } catch (error: any) {
          console.error('[Background] Error saving or conditionally indexing chat:', error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true; // Indicates asynchronous response
  }

  // REBUILD_ALL_EMBEDDINGS_REQUEST handler
  if (message.type === 'REBUILD_ALL_EMBEDDINGS_REQUEST') {
    (async () => {
      try {
        console.log("[Background] Received REBUILD_ALL_EMBEDDINGS_REQUEST.");
        const details = await rebuildAllEmbeddings();
        // The rebuildAllEmbeddings function now updates the config internally.
        sendResponse({ success: true, details });
      } catch (error: any) {
        console.error('[Background] Error during full embeddings rebuild:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Indicates asynchronous response
  }

  // UPDATE_MISSING_EMBEDDINGS_REQUEST handler
  if (message.type === 'UPDATE_MISSING_EMBEDDINGS_REQUEST') {
    (async () => {
      try {
        console.log("[Background] Received UPDATE_MISSING_EMBEDDINGS_REQUEST.");
        const details = await updateMissingEmbeddings();
        // The updateMissingEmbeddings function now updates the config internally.
        sendResponse({ success: true, details });
      } catch (error: any) {
        console.error('[Background] Error during update of missing embeddings:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Indicates asynchronous response
  }

  // REBUILD_BM25_INDEX_REQUEST handler
  if (message.type === 'REBUILD_BM25_INDEX_REQUEST') {
    (async () => {
        try {
            console.log("[Background] Received REBUILD_BM25_INDEX_REQUEST.");
            await rebuildFullIndex(); // This is the existing function for BM25 full rebuild

            // Update timestamp in config for BM25
            const configStr: string | null = await storage.getItem('config');
            let config: Config = configStr ? JSON.parse(configStr) : {};
            config = {
                ...config,
                rag: {
                    ...config.rag,
                    bm25LastRebuild: new Date().toLocaleString(),
                },
            };
            await storage.setItem('config', JSON.stringify(config));

            sendResponse({ success: true, message: "BM25 index rebuild completed and timestamp updated." });
        } catch (error: any) {
            console.error('[Background] Error during BM25 index rebuild:', error);
            sendResponse({ success: false, error: error.message });
        }
    })();
    return true; // Indicates asynchronous response
  }

  // --- MCP Handlers ---
  if (message.type === 'MCP_LIST_TOOLS') {
    (async () => {
      try {
        if (Object.keys(mcpClients).length === 0) {
          sendResponse([]); // Send empty array if no clients are connected
          return;
        }

        const allToolsPromises = Object.entries(mcpClients).map(async ([url, serverInfo]) => {
          try {
            const tools = await serverInfo.client.listTools();
            // Tag each tool with its source server info.
            return tools.map(tool => ({
              ...tool,
              serverName: serverInfo.name,
              serverUrl: url,
            }));
          } catch (error) {
            console.error(`[MCP] Failed to list tools for ${serverInfo.name} (${url}):`, error);
            return []; // Return empty array for this server on error
          }
        });

        const allToolsArrays = await Promise.all(allToolsPromises);
        const flatToolList = allToolsArrays.flat();
        sendResponse(flatToolList);

      } catch (error) {
        console.error('[MCP] Error aggregating tools from servers:', error);
        sendResponse([]); // Send empty array on general failure
      }
    })();
    return true; // Indicates asynchronous response
  }

  if (message.type === 'MCP_CALL_TOOL') {
    (async () => {
      const { toolName, args, serverUrl } = message.payload;
      const serverInfo = mcpClients[serverUrl];

      if (!serverInfo) {
        sendResponse({ success: false, error: `No active MCP connection for server URL: ${serverUrl}` });
        return;
      }

      const result = await serverInfo.client.callTool({ name: toolName, arguments: args });
      sendResponse(result);
    })();
    return true; // Indicates asynchronous response
  }
});

// --- Message Handler for Settings Search ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PERFORM_SETTINGS_SEARCH') {
    const { query } = message.payload;
    (async () => {
      try {
        const configStr: string | null = await storage.getItem('config');
        const config: Config | null = configStr ? JSON.parse(configStr) : null;

        if (!config) {
          // Try to load embedding model config directly if main config is missing RAG settings
          // This is a fallback, ideally config.rag should be populated
          const embeddingConfigResult = await chrome.storage.local.get('embeddingModelConfig');
          const embeddingModelConfig = embeddingConfigResult.embeddingModelConfig as EmbeddingModelConfig;

          if (embeddingModelConfig && embeddingModelConfig.apiUrl && embeddingModelConfig.modelId) {
             // Ensure embedding service is configured if it wasn't already
            await ensureEmbeddingServiceConfigured(); // Wait for it to be ready
          }
          // If embeddingModelConfig is missing/incomplete, the ensureEmbeddingServiceConfigured() will throw an error.
          // So, no need for an explicit throw here.
        } else if (config.rag?.embedding_model) { // Check if embedding_model is set in RAG config
            // The embedding service configuration should be handled by loadAndConfigureEmbeddingService based on stored config,
            // which is called on startup and on config changes. So, we just need to ensure it's ready.
            await ensureEmbeddingServiceConfigured(); // Wait for it
        } else {
          // Fallback: ensure service is configured, relying on loadAndConfigureEmbeddingService having run
          await ensureEmbeddingServiceConfigured();
        }
        
        // Log the config being used by getHybridRankedChunks
        const currentGlobalConfigStr: string | null = await storage.getItem('config');
        const currentGlobalConfig: Config | null = currentGlobalConfigStr ? JSON.parse(currentGlobalConfigStr) : null;
        if (!currentGlobalConfig) {
            throw new Error("Global configuration not found right before search. This is unexpected.");
        }


        console.log(`[Background - PERFORM_SETTINGS_SEARCH] Performing hybrid search for query: "${query}" with current global config RAG settings:`, currentGlobalConfig.rag);
        const hybridChunks = await getHybridRankedChunks(query, currentGlobalConfig);
        
        sendResponse({ success: true, results: hybridChunks });
      } catch (error: any) {
        console.error('[Background - PERFORM_SETTINGS_SEARCH] Error getting hybrid search results:', error);
        sendResponse({ success: false, error: error.message, results: [] });
      }
    })();
    return true; // Indicates asynchronous response
  }
});


// --- MCP Client Initialization ---
let mcpClients: { [url: string]: { client: MCPClient; name: string } } = {};

const connectToMCPServers = async () => {
  const storedValue = await storage.getItem('mcpServers');
  let storedServers: { name: string; url: string }[] = [];

  if (storedValue) {
    try {
      // Handle data that might be a string or already an object/array
      const parsed = typeof storedValue === 'string' ? JSON.parse(storedValue) : storedValue;
      if (Array.isArray(parsed)) {
        storedServers = parsed;
      }
    } catch (e) {
      console.error("[MCP] Failed to parse servers from storage, resetting. Error:", e);
    }
  }

  const connectedServerURIs = Object.keys(mcpClients);

  const serversToConnect = storedServers.filter(server => server && server.url && !connectedServerURIs.includes(server.url));
  const serversToDisconnect = connectedServerURIs.filter(uri => !storedServers.some(server => server && server.url === uri));

  for (const server of serversToConnect) {
    const mcp = new MCPClient(server);
    await mcp.connect();
    mcpClients[server.url] = { client: mcp, name: server.name };
    console.log(`[MCP] Connected to server: ${server.name} at ${server.url}`);
  }

  for (const uri of serversToDisconnect) {
    if (mcpClients[uri]) {
      mcpClients[uri].client.disconnect();
      delete mcpClients[uri];
      console.log(`[MCP] Disconnected from server at ${uri}`);
    }
  }
};


// --- Embedding Model Configuration ---

// Function to load and apply embedding configuration
const loadAndConfigureEmbeddingService = () => {
  chrome.storage.local.get('embeddingModelConfig', (result) => {
    if (result.embeddingModelConfig) {
      const config = result.embeddingModelConfig as EmbeddingModelConfig;
      if (config.apiUrl && config.modelId) {
        console.log('[Background] Loading embedding model configuration:', config);
        configureEmbeddingService(config.apiUrl, config.modelId, config.apiKey);
      } else {
        console.warn('[Background] Loaded embeddingModelConfig is incomplete. Embedding service not configured.', config);
      }
    } else {
      console.log('[Background] No embeddingModelConfig found in storage. Embedding service will use defaults or remain unconfigured until set.');
      // Optionally, configure with default values if desired
      // configureEmbeddingService('DEFAULT_API_URL', 'DEFAULT_MODEL_ID'); 
    }
  });
};

// Load configuration on startup
loadAndConfigureEmbeddingService();
connectToMCPServers();

chrome.runtime.onStartup.addListener(() => {
    connectToMCPServers();
});

// Listen for changes in storage
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.embeddingModelConfig) {
    console.log('[Background] embeddingModelConfig changed in storage.');
    const newConfig = changes.embeddingModelConfig.newValue as EmbeddingModelConfig | undefined;
    if (newConfig && newConfig.apiUrl && newConfig.modelId) {
      console.log('[Background] Applying new embedding model configuration:', newConfig);
      configureEmbeddingService(newConfig.apiUrl, newConfig.modelId, newConfig.apiKey);
    } else if (newConfig) {
        console.warn('[Background] New embeddingModelConfig is incomplete. Embedding service not reconfigured.', newConfig);
    } else {
      console.log('[Background] embeddingModelConfig was removed or cleared. Embedding service may need manual reconfiguration or revert to defaults.');
      // Optionally, clear configuration or set to defaults
      // configureEmbeddingService('', ''); // Example of clearing
    }
    if (namespace === 'local' && changes.mcpServers) {
        console.log("[MCP] mcpServers changed, reconnecting...");
        connectToMCPServers();
    }
  }
});
