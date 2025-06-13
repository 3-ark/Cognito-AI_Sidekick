import { useEffect, useState, useRef, useCallback } from 'react';
import { toast, Toaster } from 'react-hot-toast';
import localforage from 'localforage';
import { TbWorldSearch, TbBrowserPlus, TbApi } from "react-icons/tb";
import { BiBrain } from "react-icons/bi";
import { FaWikipediaW, FaGoogle, FaBrave } from "react-icons/fa6";
import { SiDuckduckgo } from "react-icons/si";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
import storage from '../background/storageUtil';
import ChannelNames from '../types/ChannelNames';
import { useAddToNote } from './hooks/useAddToNote';
import { NoteSystemView } from './NoteSystemView';

function bridge() {

    let title = '';
    let textContent = '';
    let htmlContent = '';
    let altTexts = '';
    let tableData = '';
    let metaDescription = '';
    let metaKeywords = '';

    try {
        title = document.title || '';

        const MAX_BODY_CHARS_FOR_DIRECT_EXTRACTION = 5_000_000; // Approx 5MB of text
        let bodyElement = document.body;

        if (document.body && document.body.innerHTML.length > MAX_BODY_CHARS_FOR_DIRECT_EXTRACTION) {
            console.warn(`[Cognito Bridge] Document body is very large (${document.body.innerHTML.length} chars). Attempting to use a cloned, simplified version for text extraction to improve performance/stability.`);

            const clonedBody = document.body.cloneNode(true) as HTMLElement;
            clonedBody.querySelectorAll('script, style, noscript, iframe, embed, object').forEach(el => el.remove());
            textContent = (clonedBody.textContent || '').replace(/\s\s+/g, ' ').trim();
            htmlContent = document.body.innerHTML.replace(/\s\s+/g, ' ');

        } else if (document.body) {
            textContent = (document.body.innerText || '').replace(/\s\s+/g, ' ').trim();
            htmlContent = (document.body.innerHTML || '').replace(/\s\s+/g, ' ');
        } else {
            console.warn('[Cognito Bridge] document.body is not available.');
        }

        altTexts = Array.from(document.images)
            .map(img => img.alt)
            .filter(alt => alt && alt.trim().length > 0)
            .join('. ');

        tableData = Array.from(document.querySelectorAll('table'))
            .map(table => (table.innerText || '').replace(/\s\s+/g, ' '))
            .join('\n');

        const descElement = document.querySelector('meta[name="description"]');
        metaDescription = descElement ? descElement.getAttribute('content') || '' : '';

        const keywordsElement = document.querySelector('meta[name="keywords"]');
        metaKeywords = keywordsElement ? keywordsElement.getAttribute('content') || '' : '';

    } catch (error) {
        console.error('[Cognito Bridge] Error during content extraction:', error);
        let errorMessage = 'Unknown extraction error';
        if (error instanceof Error) {
            errorMessage = error.message;
        } else if (typeof error === 'string') {
            errorMessage = error;
        }
        return JSON.stringify({
            error: `Extraction failed: ${errorMessage}`,
            title: document.title || 'Error extracting title',
            text: '', html: '', altTexts: '', tableData: '',
            meta: { description: '', keywords: '' }
        });
    }

    const MAX_OUTPUT_STRING_LENGTH = 10_000_000;
    
    let responseCandidate = {
        title,
        text: textContent,
        html: htmlContent,
        altTexts,
        tableData,
        meta: {
            description: metaDescription,
            keywords: metaKeywords
        }
    };

    if (JSON.stringify(responseCandidate).length > MAX_OUTPUT_STRING_LENGTH) {
        console.warn('[Cognito Bridge] Total extracted content is very large. Attempting to truncate.');
        const availableLength = MAX_OUTPUT_STRING_LENGTH - JSON.stringify({ ...responseCandidate, text: "", html: "" }).length;
        let remainingLength = availableLength;

        if (responseCandidate.text.length > remainingLength * 0.6) { 
            responseCandidate.text = responseCandidate.text.substring(0, Math.floor(remainingLength * 0.6)) + "... (truncated)";
        }
        remainingLength = availableLength - responseCandidate.text.length;

        if (responseCandidate.html.length > remainingLength * 0.8) {
             responseCandidate.html = responseCandidate.html.substring(0, Math.floor(remainingLength * 0.8)) + "... (truncated)";
        }
        console.warn('[Cognito Bridge] Content truncated. Final approx length:', JSON.stringify(responseCandidate).length);
    }


    return JSON.stringify(responseCandidate);
}

async function injectBridge() {
  const queryOptions = { active: true, lastFocusedWindow: true };
  const [tab] = await chrome.tabs.query(queryOptions);

  if (!tab?.id || tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://') || tab.url?.startsWith('about:')) { // Added about:
    storage.deleteItem('pagestring');
    storage.deleteItem('pagehtml');
    storage.deleteItem('alttexts');
    storage.deleteItem('tabledata');
    return;
  }

  storage.deleteItem('pagestring');
  storage.deleteItem('pagehtml');
  storage.deleteItem('alttexts');
  storage.deleteItem('tabledata');

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: bridge
    });

    if (!results || !Array.isArray(results) || results.length === 0 || !results[0] || typeof results[0].result !== 'string') {
        console.error('[Cognito:] Bridge function execution returned invalid or unexpected results structure:', results);
        return;
    }

    const rawResult = results[0].result;
    let res: any;
    try {
        res = JSON.parse(rawResult);
    } catch (parseError) {
        console.error('[Cognito:] Failed to parse JSON result from bridge:', parseError, 'Raw result string:', rawResult);
        return;
    }

    if (res.error) {
        console.error('[Cognito:] Bridge function reported an error:', res.error, 'Title:', res.title);
        return;
    }

    try {
      storage.setItem('pagestring', res?.text ?? '');
      storage.setItem('pagehtml', res?.html ?? '');
      storage.setItem('alttexts', res?.altTexts ?? '');
      storage.setItem('tabledata', res?.tableData ?? '');
    } catch (storageError) {
        console.error('[Cognito:] Storage error after successful extraction:', storageError);
        storage.deleteItem('pagestring');
        storage.deleteItem('pagehtml');
        storage.deleteItem('alttexts');
        storage.deleteItem('tabledata');
    }
  } catch (execError) {
    console.error('[Cognito:] Bridge function execution failed:', execError);
    if (execError instanceof Error && (execError.message.includes('Cannot access contents of url "chrome://') || execError.message.includes('Cannot access a chrome extension URL') || execError.message.includes('Cannot access contents of url "about:'))) {
        console.warn('[Cognito:] Cannot access restricted URL.');
    }
  }
}

const generateChatId = () => `chat_${Math.random().toString(16).slice(2)}`;

const MessageTemplate = ({ children, onClick }: { children: React.ReactNode, onClick: () => void }) => (
  (<div
    className={cn(
      "bg-[var(--active)] border border-[var(--text)] rounded-[16px] text-[var(--text)]",
      "cursor-pointer flex items-center justify-center",
      "text-md font-extrabold p-0.5 place-items-center relative text-center",
      "w-16 flex-shrink-0",
      "transition-colors duration-200 ease-in-out",
      "hover:bg-[rgba(var(--text-rgb),0.1)]"
    )}
    onClick={onClick}
  >
    {children}
  </div>)
);

const WEB_SEARCH_MODES = [
  { id: 'Google', icon: FaGoogle, label: 'Google Search' },
  { id: 'Duckduckgo', icon: SiDuckduckgo, label: 'DuckDuckGo Search' },
  { id: 'Brave', icon: FaBrave, label: 'Brave Search' },
  { id: 'Wikipedia', icon: FaWikipediaW, label: 'Wikipedia Search' },
  { id: 'GoogleCustomSearch', icon: TbApi, label: 'Google API Search' },
] as const;

const WebSearchIconButton = ({ children, onClick, isActive, title }: { children: React.ReactNode, onClick: () => void, isActive?: boolean, title: string }) => (
  <Tooltip>
    <TooltipTrigger>
      <div
        className={cn(
          "border rounded-lg text-[var(--text)]",
          "cursor-pointer flex items-center justify-center",
          "p-2 place-items-center relative",
          "w-8 h-8 flex-shrink-0",
          "transition-colors duration-200 ease-in-out",
          isActive 
            ? "bg-[var(--active)] text-[var(--text)] border-[var(--active)] hover:brightness-95" 
            : "bg-transparent border-[var(--text)]/50 hover:bg-[rgba(var(--text-rgb),0.1)]",
        )}
        onClick={onClick}
        aria-label={title}
      >
        {children}
      </div>
    </TooltipTrigger>
    <TooltipContent side="top" className="bg-[var(--active)]/80 text-[var(--text)] border-[var(--text)]/50">
      <p>{title}</p>
    </TooltipContent>
  </Tooltip>
);

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
              storage.deleteItem('pagestring');
              storage.deleteItem('pagehtml');
              storage.deleteItem('alttexts');
              storage.deleteItem('tabledata');
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

      // Don't trigger shortcuts if settings or history mode is active
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

  const { chatTitle, setChatTitle } = useChatTitle(isLoading, turns, message);
  const { onSend, onStop } = useSendMessage(
    isLoading,
    message,
    turns,
    webContent,
    config,
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
        setMessage(secondLast.rawContent);
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
      storage.deleteItem('pagestring');
      storage.deleteItem('pagehtml');
      storage.deleteItem('alttexts');
      storage.deleteItem('tabledata');
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
                storage.deleteItem('pagestring');
                storage.deleteItem('pagehtml');
                storage.deleteItem('alttexts');
                storage.deleteItem('tabledata');
                lastInjectedRef.current = { id: null, url: '' };
            } else {
            }
        } else if (!cancelled) {
            lastInjectedRef.current = { id: null, url: '' };
            setCurrentTabInfo({ id: null, url: '' });
            storage.deleteItem('pagestring');
            storage.deleteItem('pagehtml');
            storage.deleteItem('alttexts');
            storage.deleteItem('tabledata');
        }
      } catch (error) {
        if (!cancelled) {
        console.error("[Cognito - Revised] Error during panel open tab check:", error);
          lastInjectedRef.current = { id: null, url: '' };
          setCurrentTabInfo({ id: null, url: '' });
          storage.deleteItem('pagestring');
          storage.deleteItem('pagehtml');
          storage.deleteItem('alttexts');
          storage.deleteItem('tabledata');
      }
    }
  }

    handlePanelOpen();

    return () => {
      cancelled = true;
      storage.deleteItem('pagestring');
      storage.deleteItem('pagehtml');
      storage.deleteItem('alttexts');
      storage.deleteItem('tabledata');
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
        updatedTurns[index] = { ...updatedTurns[index], rawContent: newContent };
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
            onAddNewNoteRequest={noteSystemMode ? () => setTriggerNoteCreation(true) : undefined}
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
            {turns.length === 0 && !config?.chatMode && (
              (<div className="fixed bottom-20 left-8 flex flex-col gap-2 z-[5]">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      aria-label="Cycle compute level"
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        const currentLevel = config.computeLevel;
                        const nextLevel = currentLevel === 'low' ? 'medium' : currentLevel === 'medium' ? 'high' : 'low';
                        updateConfig({ computeLevel: nextLevel });
                      }}
                      className={cn(
                        "hover:bg-secondary/70",
                        config.computeLevel === 'high' ? 'text-red-600' :
                        config.computeLevel === 'medium' ? 'text-orange-300' :
                        'text-[var(--text)]'
                      )}
                    >
                      <BiBrain />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="bg-[var(--active)]/50 text-[var(--text)] border-[var(--text)] max-w-80">
                    <p>{`Compute Level: ${config.computeLevel?.toUpperCase()}. Click to change. [Warning]: beta feature and resource costly.`}</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      aria-label="Add Web Search Results to LLM Context"
                      variant="ghost"
                      size="icon"
                      onClick={() => { 
                        updateConfig({ 
                          chatMode: 'web',
                          webMode: config.webMode || (WEB_SEARCH_MODES[0].id as Config['webMode'])
                        }); 
                      }}
                      className="text-[var(--text)] hover:bg-secondary/70"
                    >
                      <TbWorldSearch />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="bg-[var(--active)]/50 text-[var(--text)] border-[var(--text)]">
                    <p>Add Web Search Results to LLM Context</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      aria-label="Add Current Web Page to LLM Context"
                      variant="ghost"
                      size="icon"
                      onClick={() => { updateConfig({ chatMode: 'page' }); }}
                      className="text-[var(--text)] hover:bg-secondary/70"
                    >
                      <TbBrowserPlus />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="bg-[var(--active)]/50 text-[var(--text)] border-[var(--text)]">
                    <p>Add Current Web Page to LLM Context</p>
                  </TooltipContent>
                </Tooltip>
              </div>)
                )}
            {config?.chatMode === "page" && (
                   (<div
                      className={cn(
                        "fixed bottom-16 left-1/2 -translate-x-1/2",
                        "flex flex-row justify-center",
                        "w-fit h-8 z-[2]",
                        "transition-all duration-200 ease-in-out",
                        isPageActionsHovering ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2.5",
                        "bg-transparent px-0 py-0"
                      )}
                      style={{ backdropFilter: 'blur(10px)' }}
                      onMouseEnter={() => setIsPageActionsHovering(true)}
                      onMouseLeave={() => setIsPageActionsHovering(false)}
                   >
                     <div className="flex items-center space-x-6 max-w-full overflow-x-auto px-0">
                        <Tooltip>
                          <TooltipTrigger>
                            <MessageTemplate onClick={() => onSend('Provide your summary.')}>
                              TLDR
                            </MessageTemplate>
                          </TooltipTrigger>
                          <TooltipContent side="top" className=" text-[var(--text)] border-[var(--text)]/50">
                            <p>Quick Summary</p>
                          </TooltipContent>
                        </Tooltip>
                       <Tooltip>
                          <TooltipTrigger>
                            <MessageTemplate onClick={() => onSend('Extract all key figures, names, locations, and dates mentioned on this page and list them.')}>
                              Facts
                            </MessageTemplate>
                          </TooltipTrigger>
                          <TooltipContent side="top" className=" text-[var(--text)] border-[var(--text)]/50">
                            <p>Numbers, events, names</p>
                          </TooltipContent>
                        </Tooltip>
                       <Tooltip>
                          <TooltipTrigger>
                            <MessageTemplate onClick={() => onSend('Find positive developments, achievements, or opportunities mentioned on this page.')}>
                              Yay!
                            </MessageTemplate>
                          </TooltipTrigger>
                          <TooltipContent side="top" className=" text-[var(--text)] border-[var(--text)]/50">
                            <p>Good news</p>
                          </TooltipContent>
                        </Tooltip>
                       <Tooltip>
                          <TooltipTrigger>
                            <MessageTemplate onClick={() => onSend('Find concerning issues, risks, or criticisms mentioned on this page.')}>
                              Oops
                            </MessageTemplate>
                          </TooltipTrigger>
                          <TooltipContent side="top" className=" text-[var(--text)] border-[var(--text)]/50">
                            <p>Bad news</p>
                          </TooltipContent>
                        </Tooltip>
                     </div>
                   </div>)
            )}
            {config?.chatMode === "web" && (
              <div
                className={cn(
                  "fixed bottom-14 left-1/2 -translate-x-1/2",
                  "flex flex-row justify-center",
                  "w-fit h-10 z-[2]",
                  "transition-all duration-200 ease-in-out",
                  isWebSearchHovering ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2.5",
                  "bg-transparent px-0 py-0"
                )}
                style={{ backdropFilter: 'blur(10px)' }}
                onMouseEnter={() => setIsWebSearchHovering(true)}
                onMouseLeave={() => setIsWebSearchHovering(false)}
              >
                <div className="flex items-center space-x-4 max-w-full overflow-x-auto px-4 py-1">
                  {WEB_SEARCH_MODES.map((mode) => (
                    <WebSearchIconButton
                      key={mode.id}
                      onClick={() => {
                        updateConfig({ webMode: mode.id as Config['webMode'], chatMode: 'web' }); 
                      }}
                      isActive={config.webMode === mode.id}
                      title={mode.label}
                    >
                      <mode.icon size={18} />
                    </WebSearchIconButton>
                  ))}
                </div>
              </div>
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
              onSend={() => onSend(message)}
              onStopRequest={onStop}
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