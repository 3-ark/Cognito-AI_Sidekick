import { useEffect, useState, useRef, useCallback } from 'react';
import { toast, Toaster } from 'react-hot-toast';
import localforage from 'localforage';
import { TooltipProvider } from "@/components/ui/tooltip"; // Keep TooltipProvider as it wraps the whole component
import { cn } from "@/src/background/util";

import { useChatTitle } from './hooks/useChatTitle';
import useSendMessage from './hooks/useSendMessage';
import { useUpdateModels } from './hooks/useUpdateModels';
import { Background } from './Background';
import { ChatHistory, ChatMessage, MessageTurn } from './ChatHistory';
import { useConfig } from './ConfigContext';
import type { Config, ChatMode, ChatStatus } from '../types/config';
import { Header } from './Header';
import { Input } from './Input';
import { Messages } from './Messages';
import { downloadImage, downloadJson, downloadText, downloadMarkdown } from '../background/messageUtils';
import { Settings } from './Settings';
// import storage from '../background/storageUtil'; // No longer directly used
import { clearPageContextFromStorage } from './utils/storageUtils';
import { ActionButtons } from './components/ActionButtons';
import { PageActionButtons } from './components/PageActionButtons';
import { WebSearchModeButtons } from './components/WebSearchModeButtons';
import { injectBridge } from './utils/contentExtraction';
import ChannelNames from '../types/ChannelNames';
import { useAddToNote } from './hooks/useAddToNote';
import { NoteSystemView } from './NoteSystemView';
import { Note } from '../types/noteTypes';

const generateChatId = () => `chat_${Math.random().toString(16).slice(2)}`;

const Cognito = () => {
  const [turns, setTurns] = useState<MessageTurn[]>([]);
  const [message, setMessage] = useState('');
  const [chatId, setChatId] = useState(generateChatId());
  const [webContent, setWebContent] = useState('');
  const [pageContent, setPageContent] = useState('');
  const [isLoading, setLoading] = useState(false);
  const [settingsMode, setSettingsMode] = useState(false);
  const [historyMode, setHistoryMode] = useState(false);
  const { config, updateConfig } = useConfig();
  const [noteSystemMode, setNoteSystemMode] = useState(false);
  const [currentTabInfo, setCurrentTabInfo] = useState<{ id: number | null, url: string }>({ id: null, url: '' });

  const containerRef = useRef<HTMLDivElement>(null);
  const lastInjectedRef = useRef<{ id: number | null, url: string }>({ id: null, url: '' });

  const [isPageActionsHovering, setIsPageActionsHovering] = useState(false);
  const [isWebSearchHovering, setIsWebSearchHovering] = useState(false);
  const [chatStatus, setChatStatus] = useState<ChatStatus>('idle');
  const [triggerNoteCreation, setTriggerNoteCreation] = useState(false);
  const [triggerImportNoteFlow, setTriggerImportNoteFlow] = useState(false);
  const [selectedNotesForContext, setSelectedNotesForContext] = useState<Note[]>([]);

  const toastIdRef = useRef<string | null>(null);
  useEffect(() => {
    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current) {
        containerRef.current.style.minHeight = '100dvh';
        requestAnimationFrame(() => {
          if (containerRef.current) {
            containerRef.current.style.minHeight = '';
          }
        });
      }
    });
    if (containerRef.current) resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (config?.chatMode !== 'page') return;

    const checkAndInject = async () => {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!tab?.id || !tab.url) return;

      if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:')) {
          if (lastInjectedRef.current.id !== tab.id || lastInjectedRef.current.url !== tab.url) {
              await clearPageContextFromStorage();
          }
          lastInjectedRef.current = { id: tab.id, url: tab.url };
          setCurrentTabInfo({ id: tab.id, url: tab.url });
          return;
      }

      if (tab.id !== lastInjectedRef.current.id || tab.url !== lastInjectedRef.current.url) {
        lastInjectedRef.current = { id: tab.id, url: tab.url };
        setCurrentTabInfo({ id: tab.id, url: tab.url });
        await injectBridge();
      } else {
      }
    };

    checkAndInject();

    const handleTabActivated = (activeInfo: chrome.tabs.TabActiveInfo) => {
      chrome.tabs.get(activeInfo.tabId, (tab) => {
        if (chrome.runtime.lastError) {
          console.warn(`[Cognito ] Error getting tab info on activation: ${chrome.runtime.lastError.message}`);
          return;
        }
        checkAndInject();
      });
    };

    const handleTabUpdated = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
      if (tab.active && (changeInfo.status === 'complete' || (changeInfo.url && tab.status === 'complete'))) {
         checkAndInject();
      }
    };

    chrome.tabs.onActivated.addListener(handleTabActivated);
    chrome.tabs.onUpdated.addListener(handleTabUpdated);

    return () => {
      chrome.tabs.onActivated.removeListener(handleTabActivated);
      chrome.tabs.onUpdated.removeListener(handleTabUpdated);
      lastInjectedRef.current = { id: null, url: '' };
    };
  }, [config?.chatMode]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {

      if (settingsMode || historyMode || noteSystemMode) {
        return;
      }

      if (event.ctrlKey && event.key.toLowerCase() === 'm') {
        event.preventDefault();
        const currentMode = config?.chatMode;
        let toastMessage = '';

        if (currentMode === 'web') {
          updateConfig({ chatMode: undefined });
          toastMessage = 'Switched to Chat Mode';
        } else if (currentMode === 'page') {
          updateConfig({ chatMode: 'web' });
          toastMessage = 'Switched to Web Mode';
        } else {
          updateConfig({ chatMode: 'page' });
          toastMessage = 'Switched to Page Mode';
        }

        if (toastIdRef.current) {
          toast.dismiss(toastIdRef.current);
        }
        toastIdRef.current = toast(toastMessage);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [config?.chatMode, updateConfig, settingsMode, historyMode]);

  useEffect(() => {
    const messageListener = (message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void): boolean | undefined => {
      if (message.type === "ACTIVATE_NOTE_SYSTEM_VIEW") {
        console.log('[Cognito.tsx] Received ACTIVATE_NOTE_SYSTEM_VIEW. Switching to Note System mode.');
        setSettingsMode(false);
        setHistoryMode(false);
        setNoteSystemMode(true);
        
        sendResponse({ status: "ACTIVATING_NOTE_SYSTEM_VIEW_ACK" });
        return true;
      }
      return false;
    };

    chrome.runtime.onMessage.addListener(messageListener);
    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, [setSettingsMode, setHistoryMode, setNoteSystemMode]);
  
  const { appendToNote } = useAddToNote();

  useEffect(() => {
    const port = chrome.runtime.connect({ name: ChannelNames.SidePanelPort });

    const messageListener = (message: any) => {
      if (message.type === "ADD_SELECTION_TO_NOTE" && message.payload) {
        appendToNote(message.payload);
      }
    };

    port.onMessage.addListener(messageListener);

    port.postMessage({ type: 'init' });

    return () => {
      port.onMessage.removeListener(messageListener);
      port.disconnect();
    };
  }, [appendToNote]);

  const handleImportNoteRequest = () => {
    setNoteSystemMode(true); 
    setTriggerImportNoteFlow(true);
  };

  const handleImportTriggered = () => {
    setTriggerImportNoteFlow(false);
  };

  const { chatTitle, setChatTitle } = useChatTitle(isLoading, turns, message);
  const { onSend, onStop } = useSendMessage(
    isLoading,
    message,
    turns,
    webContent,
    config,
    selectedNotesForContext,
    setTurns,
    setMessage,
    setWebContent,
    setPageContent,
    setLoading,
    setChatStatus
  );
  useUpdateModels();

  const reset = () => {
    setTurns([]);
    setPageContent('');
    setWebContent('');
    setLoading(false);
    updateConfig({ chatMode: undefined, computeLevel: 'low' });
    setChatStatus('idle');    
    setMessage('');
    setChatTitle('');
    setChatId(generateChatId());
    setHistoryMode(false);
    setSettingsMode(false); 
    setNoteSystemMode(false);
    setSelectedNotesForContext([]); // Clear selected notes on reset
    if (containerRef.current) {
        containerRef.current.scrollTop = 0;
    }
  };

  const onReload = () => {
    setTurns(prevTurns => {
      if (prevTurns.length < 2) return prevTurns;
      const last = prevTurns[prevTurns.length - 1];
      const secondLast = prevTurns[prevTurns.length - 2];
      if (last.role === 'assistant' && secondLast.role === 'user') {
        setMessage(secondLast.content);
        return prevTurns.slice(0, -2);
      }
      return prevTurns;
    });
    setLoading(false);
    setChatStatus('idle');
  };

  const loadChat = (chat: ChatMessage) => {
    setChatTitle(chat.title || '');
    setTurns(chat.turns);
    setChatId(chat.id);
    setHistoryMode(false);
    setChatStatus('idle');
    setSettingsMode(false);

    updateConfig({
      useNote: chat.useNoteActive ?? false,
      selectedModel: chat.model || config.selectedModel,
      chatMode: chat.chatMode === 'page' || chat.chatMode === 'web' ? chat.chatMode : undefined, // Ensure valid chatMode
      webMode: chat.webMode || config.webMode,
    });

    if (chat.chatMode !== 'page') {
      await clearPageContextFromStorage();
      lastInjectedRef.current = { id: null, url: '' };
    }
  }

  const deleteAll = async () => {
    try {
        const keys = await localforage.keys();
        const chatKeys = keys.filter(key => key.startsWith('chat_'));
        if (chatKeys.length === 0 && turns.length === 0) return;
        await Promise.all(chatKeys.map(key => localforage.removeItem(key)));
        toast.success("Deleted all chats");
        reset();
    } catch (error) {
        console.error("[Cognito] Error deleting all chats:", error);
        toast.error("Failed to delete chats");
    }
  };

  useEffect(() => {
    if (turns.length > 0 && !historyMode && !settingsMode && !noteSystemMode) {
      const savedChat: ChatMessage = {
        id: chatId,
        title: chatTitle || `Chat ${new Date(Date.now()).toLocaleString()}`,
        turns,
        last_updated: Date.now(),
        model: config?.selectedModel,
        chatMode: config?.chatMode, 
        webMode: config?.chatMode === 'web' ? config.webMode : undefined,
        useNoteActive: config?.useNote,
        noteContentUsed: config?.useNote ? config.noteContent : undefined,
      };
      localforage.setItem(chatId, savedChat).catch(err => {
        console.error(`[Cognito ] Error saving chat ${chatId}:`, err);
      });
    }
  }, [chatId, turns, chatTitle, config?.selectedModel, config?.chatMode, config?.webMode, config?.useNote, config?.noteContent, historyMode, settingsMode]);

   useEffect(() => {
    if (chatStatus === 'done' || chatStatus === 'idle') {
      const timer = setTimeout(() => {
        setChatStatus('idle');
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [chatStatus]);

  useEffect(() => {
    let cancelled = false;

    const handlePanelOpen = async () => {
      if (cancelled) return;
      reset();

      try {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (!cancelled && tab?.id && tab.url) {
            setCurrentTabInfo({ id: tab.id, url: tab.url });

            if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:')) {
                await clearPageContextFromStorage();
                lastInjectedRef.current = { id: null, url: '' };
            } else {
            }
        } else if (!cancelled) {
            lastInjectedRef.current = { id: null, url: '' };
            setCurrentTabInfo({ id: null, url: '' });
            await clearPageContextFromStorage();
        }
      } catch (error) {
        if (!cancelled) {
        console.error("[Cognito - Revised] Error during panel open tab check:", error);
          lastInjectedRef.current = { id: null, url: '' };
          setCurrentTabInfo({ id: null, url: '' });
          await clearPageContextFromStorage();
      }
    }
  }

    handlePanelOpen();

    return () => {
      cancelled = true;
      clearPageContextFromStorage();
      reset();
      lastInjectedRef.current = { id: null, url: '' };
    };
  }, []);

  const handleNoteModalOpened = useCallback(() => {
    setTriggerNoteCreation(false);
  }, []);

  const handleEditTurn = (index: number, newContent: string) => {
    setTurns(prevTurns => {
      const updatedTurns = [...prevTurns];
      if (updatedTurns[index]) {
        updatedTurns[index] = { ...updatedTurns[index], content: newContent };
      }
      return updatedTurns;
    });
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div
        ref={containerRef}
        className={cn(
          "w-full h-dvh p-0 overflow-hidden",
          "flex flex-col bg-[var(--bg)]"
        )}
      >
          <Header
            chatTitle={chatTitle}
            deleteAll={deleteAll}
            downloadImage={() => downloadImage(turns)}
            downloadJson={() => downloadJson(turns)}
            downloadText={() => downloadText(turns)}
            downloadMarkdown={() => downloadMarkdown(turns)}
            historyMode={historyMode}
            reset={reset}
            setHistoryMode={setHistoryMode}
            setSettingsMode={setSettingsMode}
            settingsMode={settingsMode}
            noteSystemMode={noteSystemMode}
            onAddNewNoteRequest={() => {
              setNoteSystemMode(true);
              setTriggerNoteCreation(true);
            }}
            onImportNoteRequest={handleImportNoteRequest}
            setNoteSystemMode={setNoteSystemMode}
            chatMode={(config?.chatMode as ChatMode) || 'chat'}
            chatStatus={chatStatus}
          />
        <div className="flex flex-col flex-1 min-h-0 no-scrollbar overflow-y-auto relative">
          {settingsMode && (
            <Settings />
          )}

          {!settingsMode && historyMode && !noteSystemMode && (
            <ChatHistory
              className="flex-1 w-full min-h-0"
              loadChat={loadChat}
              onDeleteAll={deleteAll}
            />
          )}

          {!settingsMode && !historyMode && noteSystemMode && (
            <NoteSystemView
              triggerOpenCreateModal={triggerNoteCreation}
              onModalOpened={handleNoteModalOpened}
              triggerImportNoteFlow={triggerImportNoteFlow}
              onImportTriggered={handleImportTriggered}
            />
          )}

          {!settingsMode && !historyMode && !noteSystemMode && (
            <div className="flex flex-col flex-1 min-h-0 relative">
                  <Messages
                    isLoading={isLoading}
                    turns={turns}
                    settingsMode={settingsMode}
                    onReload={onReload}
                    onEditTurn={handleEditTurn}
                  />
            {turns.length === 0 && !config?.chatMode && config && (
              <ActionButtons config={config} updateConfig={updateConfig} />
            )}
            {config?.chatMode === "page" && (
              <PageActionButtons
                onSend={onSend}
                isPageActionsHovering={isPageActionsHovering}
                setIsPageActionsHovering={setIsPageActionsHovering}
              />
            )}
            {config?.chatMode === "web" && config && (
              <WebSearchModeButtons
                config={config}
                updateConfig={updateConfig}
                isWebSearchHovering={isWebSearchHovering}
                setIsWebSearchHovering={setIsWebSearchHovering}
              />
            )}
            </div>
          )}
        </div>
        {!settingsMode && !historyMode && !noteSystemMode && (
          <div className="p-2 relative z-[10]">
            <Input
              isLoading={isLoading}
              message={message}
              setMessage={setMessage}
              onSend={async () => {
                await onSend(message); 
                setSelectedNotesForContext([]); 
              }}
              onStopRequest={onStop}
              selectedNotesForContext={selectedNotesForContext}
              setSelectedNotesForContext={setSelectedNotesForContext}
            />
          </div>
        )}

        {config?.backgroundImage ? <Background /> : null}
        <Toaster
          containerStyle={{
            borderRadius: 16,
            bottom: '60px',
          }}
          toastOptions={{
            duration: 2000,
            position: "bottom-center",
            style: {
              background: 'var(--bg)',
              color: 'var(--text)',
              fontSize: "1rem",
              border: '1px solid var(--text)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            },
            success: {
              duration: 2000,
              style: {
                background: 'var(--bg)',
                color: 'var(--text)',
                fontSize: "1.25rem"
              }
            }
          }}
        />
      </div>
    </TooltipProvider>
  );
};


export default Cognito;