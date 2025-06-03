import { getCurrentTab, injectContentScript } from 'src/background/util';
import buildStoreWithDefaults from 'src/state/store';
import storage from 'src/background/storageUtil';
import ChannelNames from '../types/ChannelNames';

buildStoreWithDefaults({ channelName: ChannelNames.ContentPort });

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(console.error);

const ADD_TO_NOTE_MENU_ID = "cognitoAddToNoteSelection";
let sidePanelPortGlobal: chrome.runtime.Port | null = null;

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.remove(ADD_TO_NOTE_MENU_ID, () => {
    if (chrome.runtime.lastError) {
    }
    chrome.contextMenus.create({
      id: ADD_TO_NOTE_MENU_ID,
      title: "Add to Cognito Note",
      contexts: ["selection"],
      enabled: false,
    }, () => {
      if (chrome.runtime.lastError) {
        console.error("Error creating context menu:", chrome.runtime.lastError.message);
      } else {
        console.log("Context menu 'Add to Cognito Note' created (initially disabled).");
      }
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === ADD_TO_NOTE_MENU_ID && sidePanelPortGlobal) {
    if (info.selectionText) {
      console.log("Context menu 'Add to Cognito Note' clicked. Sending text to side panel.");
      sidePanelPortGlobal.postMessage({
        type: "ADD_SELECTION_TO_NOTE",
        payload: info.selectionText.trim()
      });
    } else {
      console.warn("Context menu 'Add to Cognito Note' clicked, but no selectionText found.");
    }
  }
});

chrome.runtime.onConnect.addListener(port => {
  if (port.name === ChannelNames.SidePanelPort) {
    console.log("SidePanel connected. Enabling 'Add to Note' context menu.");
    sidePanelPortGlobal = port;
    chrome.contextMenus.update(ADD_TO_NOTE_MENU_ID, { enabled: true }, () => {
      if (chrome.runtime.lastError) {
        console.error("Error enabling context menu:", chrome.runtime.lastError.message);
      }
    });

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
      console.log("SidePanel disconnected. Disabling 'Add to Note' context menu.");
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
  if (message.type === 'GET_PAGE_CONTENT') {
    sendResponse({
      title: document?.title || '',
      text: document?.body?.innerText?.replace(/\s\s+/g, ' ') || '',
      html: document?.body?.innerHTML || ''
    });
  }
  return true;
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'SAVE_NOTE_TO_FILE' && request.payload) {
    const { content } = request.payload;
    if (content) {
      const filename = `cognito_note_${new Date().toISOString().replace(/[:.]/g, '-')}.md`;

      const dataUrl = `data:text/plain;charset=utf-8,${encodeURIComponent(content)}`;

      chrome.downloads.download({
        url: dataUrl,
        filename: filename,
        saveAs: true
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error('Download failed:', chrome.runtime.lastError);
        } else if (downloadId) {
          console.log('Download started with ID:', downloadId);
        }
      });
    }
  }
  return true;
});

export {};
