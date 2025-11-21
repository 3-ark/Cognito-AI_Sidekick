import { getCurrentTab, injectContentScript } from './util';
import buildStoreWithDefaults from 'src/state/store';
import storage from './storageUtil';
import ChannelNames from '../types/ChannelNames';
import { bridge } from '../utils/html';

import { 
    deleteNoteFromSystem, 
    deleteNotesFromSystem, // Added
    exportNotesToObsidianMD, // Added
    getAllNotesFromSystem, 
    getNoteByIdFromSystem,
    saveNoteInSystem,
} from './noteStorage';

// NOTE_STORAGE_PREFIX and CHAT_STORAGE_PREFIX might not be needed directly here anymore for search result hydration
// as hydrateChunkSearchResults handles fetching original docs based on chunk.originalDocId and chunk.originalDocType

import {
    deleteAllChatData,
    deleteChatMessage,
    deleteConversation,
    getAllConversations,
    getChatMessagesForConversation,
    getConversation,
    saveChatMessage,
    saveConversation,
} from './chatHistoryStorage';
import { buildAllEmbeddings, updateEmbeddings } from './embeddingManager';
import { handleBuildAllEmbeddingsRequest } from './handlers';
import { getSearchService } from './searchUtils';

buildStoreWithDefaults({ channelName: ChannelNames.ContentPort });

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(console.error);

const pendingPageContentPayloads = new Map<number, { title: string; content: string; url?: string }>();

const ADD_TO_NOTE_MENU_ID = "CognitoAddToNoteSelection";
const ADD_PAGE_TO_NOTE_SYSTEM_MENU_ID = "CognitoAddPageToNoteSystem";
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

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-floating-button') {
    const storedConfig = await storage.getItem('config');
    if (storedConfig) {
      const config = JSON.parse(storedConfig);
      config.showFloatingButton = !config.showFloatingButton;
      await storage.setItem('config', JSON.stringify(config));
    }
  } else if (command === 'open-floating-button') {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0] && tabs[0].id) {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'OPEN_FLOATING_WINDOW' });
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

const runMigrations = async () => {
  console.log('[Migrations] Running data migrations...');
  try {
    const allConversations = await getAllConversations();
    let updatedCount = 0;

    for (const conversation of allConversations) {
      if (conversation.model && conversation.model.startsWith('groq_') && conversation.model.includes('/')) {
        const newModelId = conversation.model.replace(/^groq_/, '');
        console.log(`[Migrations] Updating conversation ${conversation.id}: model from '${conversation.model}' to '${newModelId}'`);
        await saveConversation({ ...conversation, model: newModelId });
        updatedCount++;
      }
    }

    if (updatedCount > 0) {
      console.log(`[Migrations] Successfully updated ${updatedCount} conversations.`);
    } else {
      console.log('[Migrations] No conversations needed updates.');
    }
  } catch (error) {
    console.error('[Migrations] Failed to run migrations:', error);
  }
};

chrome.runtime.onInstalled.addListener((details) => {
  // Run migrations on install or update
  if (details.reason === 'install' || details.reason === 'update') {
    runMigrations();
  }

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
      chrome.tabs.sendMessage(tabId, message, response => {
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
        payload: info.selectionText.trim(),
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
                    files: ['assets/vendor-content.js', contentScriptFile],
                });
                console.log(`[Background] Content script injection/execution of 'assets/vendor-content.js, ${contentScriptFile}' ensured for tab ${currentTabId}.`);
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
              .then(response => {
                if (response && response.success) {
                    console.log(`[Background] Received defuddled content for tab ${currentTabId}. Storing it.`);
                    pendingPageContentPayloads.set(currentTabId, {
 title: response.title, content: response.content, url: response.url, 
});
                } else {
                    console.warn(`[Background] Failed to defuddle page content for tab ${currentTabId}. Response:`, response);
                    const errorMessage = response?.error || "Unknown error processing page content.";

                    pendingPageContentPayloads.set(currentTabId, {
 title: "Error", content: errorMessage, url: tab?.url, 
});
                }
              })
              .catch(error => {
                console.error(`[Background] Error sending/receiving DEFUDDLE_PAGE_CONTENT for tab ${currentTabId} after retries:`, error.message);
                pendingPageContentPayloads.set(currentTabId, {
 title: "Error", content: `Failed to get page content: ${error.message}. The page might be protected or need a reload.`, url: tab?.url, 
});
              })
              .finally(() => {
                console.log(`[Background] Requesting side panel to switch to Note System View for tab ${currentTabId}.`);
                sendMessageToSidePanelWithRetry({
                    type: "ACTIVATE_NOTE_SYSTEM_VIEW",
                    payload: { tabId: currentTabId },
                })
                .then(activationResponse => {
                    console.log(`[Background] Side panel acknowledged ACTIVATE_NOTE_SYSTEM_VIEW. Response:`, activationResponse);
                })
                .catch(err => {
                    console.error(`[Background] Error sending ACTIVATE_NOTE_SYSTEM_VIEW to side panel after retries: ${err}`);
                });

                processingAddPageActions.delete(currentTabId);
                console.log(`[Background] Cleared processing flag for tab ${currentTabId} after DEFUDDLE_PAGE_CONTENT attempt.`);
              });
        } catch (error: any) {
            console.error(`[Background] Error during '${ADD_PAGE_TO_NOTE_SYSTEM_MENU_ID}' main execution for tab ${currentTabId}:`, error.message, error.stack);

            if (chrome.notifications) {
                 chrome.notifications.create("CognitoMainActionError_" + Date.now(), {
                    type: 'basic',
                    iconUrl: chrome.runtime.getURL('icons/icon48.png'),
                    title: 'Cognito Action Error',
                    message: `Could not process page: ${error.message}. Try reloading the page or the extension.`,
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
      chrome.runtime.sendMessage(messageToSidePanel, response => {
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

    port.onMessage.addListener(async msg => {
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
    return true; // Still return true as a best practice for onMessage listeners
  }

  // SEARCH_NOTES_REQUEST handler
  if (message.type === ChannelNames.SEARCH_NOTES_REQUEST) {
    const { query, topK } = message.payload;

    (async () => {
      try {
        const searchService = await getSearchService();
        const searchResults = await searchService.searchItems(query, topK);
        
        console.log(`[Search Handler] Sending ${searchResults.length} hydrated results for query "${query}"`);
        sendResponse({ success: true, results: searchResults });
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
        payload: messagePayload,
      }, response => {
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
        saveAs: true,
      }, downloadId => {
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
        sendResponse({ success: false, error: 'No content provided for saving note.' });
    }

    return true; // Indicates that sendResponse will be called asynchronously
  }  

  // GET_ALL_NOTES_REQUEST handler
  if (message.type === ChannelNames.GET_ALL_NOTES_REQUEST) {
    (async () => {
      try {
        const notes = await getAllNotesFromSystem();

        sendResponse({ success: true, notes });
      } catch (error: any) {
        console.error('[Background] Error getting all notes:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  if (message.type === ChannelNames.OPEN_TAB) {
    const { url } = message.payload;
    (async () => {
      try {
        await chrome.tabs.create({ url });
        sendResponse({ success: true });
      } catch (error: any) {
        console.error('[Background] Error opening new tab:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  // DELETE_CHAT_REQUEST handler
  if (message.type === ChannelNames.DELETE_CHAT_REQUEST && message.payload && message.payload.chatId) {
    const { chatId } = message.payload; // This is now conversationId

    (async () => {
      try {
        await deleteConversation(chatId); // This deletes the conversation and all its messages
        console.log('[Background] Conversation deleted:', chatId);
        sendResponse({ success: true });
      } catch (error: any) {
        console.error(`[Background] Error deleting conversation ${chatId}:`, error);
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  // DELETE_ALL_CHATS_REQUEST handler
  if (message.type === ChannelNames.DELETE_ALL_CHATS_REQUEST) {
    (async () => {
      try {
        await deleteAllChatData(); // From chatHistoryStorage.ts
        // The search index is updated within deleteAllChatData, but a full rebuild ensures consistency.
        const searchService = await getSearchService();
        await searchService.indexAllFullRebuild();
        console.log('[Background] All chats deleted from storage and index fully rebuilt.');
        sendResponse({ success: true });
      } catch (error: any) {
        console.error('[Background] Error deleting all chats:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  // SAVE_CHAT_REQUEST handler
  if (message.type === ChannelNames.SAVE_CHAT_REQUEST && message.payload) {
    const { conversation, message: messageData, messages: messagesData } = message.payload;

    (async () => {
      try {
        // Ensure the search service is initialized before saving messages that might be indexed.
        await getSearchService();
        const savedConversation = await saveConversation(conversation);
        const savedMessages = [];

        if (messagesData && Array.isArray(messagesData)) {
          for (const message of messagesData) {
            const messageToSave = { ...message, conversationId: savedConversation.id };
            const savedMessage = await saveChatMessage(messageToSave);
            savedMessages.push(savedMessage);
          }
          console.log(`[Background] Batch of ${savedMessages.length} messages saved for conversation ${savedConversation.id}`);
        } else if (messageData) {
          const messageToSave = { ...messageData, conversationId: savedConversation.id };
          const savedMessage = await saveChatMessage(messageToSave);
          savedMessages.push(savedMessage);
          console.log(`[Background] Message ${savedMessage.id} saved in conversation ${savedConversation.id} and indexed.`);
        }

        sendResponse({
          success: true,
          conversation: savedConversation,
          message: savedMessages.length === 1 ? savedMessages[0] : null,
          messages: savedMessages,
        });
      } catch (error: any) {
        console.error('[Background] Error saving chat message(s) or conversation:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  // SAVE_NOTE_REQUEST handler
  if (message.type === ChannelNames.SAVE_NOTE_REQUEST && message.payload) {
    const noteData = message.payload;

    (async () => {
      try {
        const savedNote = await saveNoteInSystem(noteData);
        const searchService = await getSearchService();
        await searchService.indexSingleNote(savedNote); // Index after successful save
        console.log('[Background] Note saved and indexed:', savedNote.id);
        sendResponse({ success: true, note: savedNote });
      } catch (error: any) {
        console.error('[Background] Error saving note:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  // DELETE_NOTE_REQUEST handler
  if (message.type === ChannelNames.DELETE_NOTE_REQUEST && message.payload) {
    const { noteId, noteIds } = message.payload;

    (async () => {
      try {
        const searchService = await getSearchService();
        if (noteId) {
          await deleteNoteFromSystem(noteId);
          await searchService.removeItemFromIndex(noteId);
          console.log('[Background] Note deleted and de-indexed:', noteId);
        } else if (noteIds && Array.isArray(noteIds)) {
          await deleteNotesFromSystem(noteIds); // This function in noteStorage should ideally handle multiple removals

          for (const id of noteIds) {
            await searchService.removeItemFromIndex(id);
          }

          console.log('[Background] Multiple notes deleted and de-indexed:', noteIds);
        } else {
          throw new Error("Invalid payload for DELETE_NOTE_REQUEST: requires noteId or noteIds.");
        }

        sendResponse({ success: true });
      } catch (error: any) {
        console.error('[Background] Error deleting note(s):', error);
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  // GET_CHAT_MESSAGES_REQUEST handler
  if (message.type === ChannelNames.GET_CHAT_MESSAGES_REQUEST && message.payload && message.payload.conversationId) {
    const { conversationId } = message.payload;

    (async () => {
      try {
        const messages = await getChatMessagesForConversation(conversationId);

        sendResponse({ success: true, messages });
      } catch (error: any) {
        console.error(`[Background] Error getting messages for conversation ${conversationId}:`, error);
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  // DELETE_CHAT_MESSAGE_REQUEST handler
  if (message.type === ChannelNames.DELETE_CHAT_MESSAGE_REQUEST && message.payload && message.payload.messageId) {
    const { messageId } = message.payload;

    (async () => {
      try {
        await deleteChatMessage(messageId);
        sendResponse({ success: true });
      } catch (error: any) {
        console.error(`[Background] Error deleting message ${messageId}:`, error);
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  // EXPORT_NOTES_REQUEST handler
  if (message.type === ChannelNames.EXPORT_NOTES_REQUEST && message.payload) {
    const { noteIds } = message.payload;

    (async () => {
      try {
        if (!noteIds || !Array.isArray(noteIds) || noteIds.length === 0) {
          throw new Error("Invalid payload for EXPORT_NOTES_REQUEST: requires a non-empty array of noteIds.");
        }

        const result = await exportNotesToObsidianMD(noteIds);

        console.log('[Background] Notes export process completed.');
        sendResponse({ success: true, result });
      } catch (error: any) {
        console.error('[Background] Error exporting notes:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  if (message.type === 'GET_NOTE_BY_ID_REQUEST') {
    const { noteId } = message.payload;

    (async () => {
      try {
        const note = await getNoteByIdFromSystem(noteId);

        if (note) {
          sendResponse({ success: true, note });
        } else {
          sendResponse({ success: false, error: 'Note not found.' });
        }
      } catch (error: any) {
        console.error('[Background] Error getting note by ID:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  if (message.type === 'OPEN_NOTE_IN_NEW_TAB') {
    const { note } = message.payload;

    (async () => {
      try {
        const url = chrome.runtime.getURL('note.html');
        const tab = await chrome.tabs.create({ url: 'about:blank' });

        if (tab.id) {
            const finalUrl = `${url}?noteId=${note.id}&tabId=${tab.id}`;

            await chrome.tabs.update(tab.id, { url: finalUrl });
        }

        sendResponse({ success: true });
      } catch (error: any) {
        console.error('[Background] Error opening note in new tab:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  if (message.type === 'TRIGGER_AI_EDIT_WITH_PROMPT') {
    // This message comes from the side panel and is intended for a specific note page.
    // We rebroadcast it with a new type to all extension pages.
    // The note pages will filter based on the tabId in the payload.
    chrome.runtime.sendMessage({
      type: 'TRIGGER_AI_EDIT_ON_NOTE_PAGE',
      payload: message.payload, // Forward the original payload which contains tabId and prompt
    });
    sendResponse({ success: true, message: "Broadcast initiated." });

    return true;
  }

  if (message.type === ChannelNames.BUILD_ALL_EMBEDDINGS_REQUEST) {
    handleBuildAllEmbeddingsRequest(getSearchService, sendResponse);
    return true;
  }

  if (message.type === 'UPDATE_EMBEDDINGS_REQUEST') {
    (async () => {
      try {
        await updateEmbeddings();
        sendResponse({ success: true });
      } catch (error: any) {
        console.error('[Background] Error updating embeddings:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  // It's important to return false or undefined for messages that are not handled.
  // The 'return true' at the end was causing the "message channel closed" error for unhandled messages.
  if (message.type === ChannelNames.GET_NOTE_REQUEST) {
    const { noteId } = message.payload;
    (async () => {
      try {
        const note = await getNoteByIdFromSystem(noteId);
        if (note) {
          sendResponse({ success: true, note });
        } else {
          sendResponse({ success: false, error: 'Note not found.' });
        }
      } catch (error: any) {
        console.error('[Background] Error getting note by ID:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.type === ChannelNames.GET_CONVERSATION_REQUEST) {
    const { conversationId } = message.payload;
    (async () => {
      try {
        const conversation = await getConversation(conversationId);
        if (conversation) {
          sendResponse({ success: true, conversation });
        } else {
          sendResponse({ success: false, error: 'Conversation not found.' });
        }
      } catch (error: any) {
        console.error('[Background] Error getting conversation by ID:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.type === 'BROWSE_PAGE') {
    const { url } = message.payload;

    if (!url || typeof url !== 'string') {
      sendResponse({ success: false, error: 'Invalid or missing URL.' });
      return true;
    }

    (async () => {
      let tabId: number | undefined;
      try {
        const tab = await chrome.tabs.create({ url, active: false });
        tabId = tab.id;

        if (!tabId) {
          throw new Error("Failed to create tab.");
        }

        await new Promise<void>((resolve, reject) => {
          const listener = (updatedTabId: number, changeInfo: chrome.tabs.OnUpdatedInfo) => {
            if (updatedTabId === tabId && changeInfo.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              resolve();
            }
          };
          chrome.tabs.onUpdated.addListener(listener);
        });

        const finalTab = await chrome.tabs.get(tabId) as chrome.tabs.Tab & { mimeType?: string };
        const isPdf = finalTab.mimeType === 'application/pdf' || finalTab.url?.toLowerCase().endsWith('.pdf'); // Check mimeType if available

        if (isPdf && url) { // Ensure url is not undefined for extractTextFromPdf
          const { extractTextFromPdf } = await import('../utils/pdf');
          const content = await extractTextFromPdf(url);
          sendResponse({ success: true, content });
        } else {
          const results = await chrome.scripting.executeScript({
            target: { tabId: tabId! },
            func: bridge,
          });
          if (results && results[0] && typeof results[0].result === 'string') {
            const result = JSON.parse(results[0].result);
            sendResponse({ success: true, content: result.text });
          } else {
            throw new Error('Failed to retrieve content from page. It might be protected or inaccessible.');
          }
        }
      } catch (error: any) {
        sendResponse({ success: false, error: error.message });
      } finally {
        if (tabId) {
          try {
            await chrome.tabs.remove(tabId);
          } catch (e) {
            console.error(`Failed to remove tab ${tabId} in finally block:`, e);
          }
        }
      }
    })();
    return true;
  }
});
