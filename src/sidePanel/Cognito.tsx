import {
 useCallback,useEffect, useRef, useState, 
} from 'react';
import { toast } from 'react-hot-toast';

import {
 downloadImage, downloadJson, downloadMarkdown,downloadText, 
} from '../background/messageUtils';
import ChannelNames from '../types/ChannelNames';
import { Conversation, MessageTurn } from '../types/chatTypes';
import type {
 ChatMode, ChatStatus, 
} from '../types/config';
import { Note } from '../types/noteTypes';

import { ActionButtons } from './components/ActionButtons';
import { PageActionButtons } from './components/PageActionButtons';
import { WebSearchModeButtons } from './components/WebSearchModeButtons';
import { useAddToNote } from './hooks/useAddToNote';
import { useChatTitle } from './hooks/useChatTitle';
import { useRetriever } from './hooks/useRetriever';
import useSendMessage from './hooks/useSendMessage';
import { injectBridge } from './utils/contentExtraction';
import { clearPageContextFromStorage } from './utils/storageUtils';
import { Background } from './Background';
import { ChatHistory } from './ChatHistory'; 
import { useConfig } from './ConfigContext';
import { Connect as ApiSettingsPanel } from './Connect';
import { Customize } from './Customize';
import { Header } from './Header';
import { Input } from './Input';
import { Messages } from './Messages';

// Import the new panel components that will be rendered as pages
import { ModelSettingsPanel } from './ModelSettingsPanel';
import { NoteSystemView } from './NoteSystemView';
import { RagSettingsPanel } from './RagSettingsPanel';
import { Settings } from './Settings';
import { WebSearchPage } from './WebSearchPage';
import { PageSettings } from './PageSettings';

import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/src/background/util";

const Cognito = () => {
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [turns, setTurns] = useState<MessageTurn[]>([]);
  const [message, setMessage] = useState(''); 
  const [webContent, setWebContent] = useState('');
  const [pageContent, setPageContent] = useState('');
  const [isLoading, setLoading] = useState(false); 
  const { config, updateConfig } = useConfig();
  const [currentTabInfo, setCurrentTabInfo] = useState<{ id: number | null, url: string }>({ id: null, url: '' });

  // Page mode states
  const [settingsMode, setSettingsMode] = useState(false); // Legacy settings page
  const [historyMode, setHistoryMode] = useState(false);
  const [noteSystemMode, setNoteSystemMode] = useState(false);
  const [modelSettingsPageMode, setModelSettingsPageMode] = useState(false); // New
  const [apiSettingsPageMode, setApiSettingsPageMode] = useState(false);     // New
  const [ragSettingsPageMode, setRagSettingsPageMode] = useState(false);       // New
  const [customizePageMode, setCustomizePageMode] = useState(false);
  const [webSearchPageMode, setWebSearchPageMode] = useState(false);
  const [pageSettingsPageMode, setPageSettingsPageMode] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const lastInjectedRef = useRef<{ id: number | null, url: string }>({ id: null, url: '' });

  const [isPageActionsHovering, setIsPageActionsHovering] = useState(false);
  const [isWebSearchHovering, setIsWebSearchHovering] = useState(false);
  const [chatStatus, setChatStatus] = useState<ChatStatus>('idle');
  const [triggerNoteCreation, setTriggerNoteCreation] = useState(false);
  const [triggerImportNoteFlow, setTriggerImportNoteFlow] = useState(false);
  const [triggerSelectNotesFlow, setTriggerSelectNotesFlow] = useState(false); 
  const [selectedNotesForContext, setSelectedNotesForContext] = useState<Note[]>([]);
  const [chatHistoryRefreshKey, setChatHistoryRefreshKey] = useState(0);
  const [sessionContext, setSessionContext] = useState("");
  const [tempContext, setTempContext] = useState("");

  // Retriever state and functions
  const {
    retrieverResults,
    isRetrieving, // Loading state for retriever
    retrieve,
    clearRetrieverResults,
  } = useRetriever();
  const processedRetrieverQueryRef = useRef<string | null>(null); // To avoid re-processing same retriever results

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
      }
    };

    checkAndInject();

    const handleTabActivated = (activeInfo: chrome.tabs.OnActivatedInfo) => {
      chrome.tabs.get(activeInfo.tabId, tab => {
        if (chrome.runtime.lastError) {
          console.warn(`[Cognito ] Error getting tab info on activation: ${chrome.runtime.lastError.message}`);

          return;
        }

        checkAndInject();
      });
    };

    const handleTabUpdated = (tabId: number, changeInfo: chrome.tabs.OnUpdatedInfo, tab: chrome.tabs.Tab) => {
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
  }, [config?.chatMode, updateConfig, settingsMode, historyMode, noteSystemMode]);

  useEffect(() => {
    const messageListener = (message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void): boolean | undefined => {

      if (message.type === "ACTIVATE_NOTE_SYSTEM_VIEW") {
        console.log('[cognito.tsx] Received ACTIVATE_NOTE_SYSTEM_VIEW. Switching to Note System mode.');
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
  const handleImportTriggered = useCallback(() => {
    setTriggerImportNoteFlow(false);
  }, [setTriggerImportNoteFlow]);

  const handleSelectNotesRequest = () => {
    setNoteSystemMode(true);
    setTriggerSelectNotesFlow(true); 
  };
  const handleSelectNotesFlowTriggered = useCallback(() => {
    setTriggerSelectNotesFlow(false); 
  }, [setTriggerSelectNotesFlow]);

  const handleTitleGenerated = useCallback((updatedConversation: Conversation) => {
    setCurrentConversation(updatedConversation);
  }, []);

  const { chatTitle, setChatTitle } = useChatTitle(isLoading, currentConversation, turns, handleTitleGenerated);

  const handleTitleChange = (newTitle: string) => {
    if (currentConversation) {
      const updatedConversation = { ...currentConversation, title: newTitle };

      setCurrentConversation(updatedConversation);
      setChatTitle(newTitle);

      chrome.runtime.sendMessage({
        type: ChannelNames.SAVE_CHAT_REQUEST,
        payload: { conversation: updatedConversation },
      });
    }
  };

  const { onSend: sendToLLMHook, onStop } = useSendMessage(
    isLoading,
    message,
    currentConversation,
    turns,
    setTurns,
    config,
    selectedNotesForContext,
    retrieverResults,
    setMessage,
    setWebContent,
    setPageContent,
    setLoading,
    setChatStatus,
    sessionContext,
    setSessionContext,
  );

  // Handler for /r command submitted from Input.tsx
  const handleRetrieveFromInput = async (query: string) => {
    if (isRetrieving || isLoading) return;

    const conv = await ensureConversation();

    const userTurn: MessageTurn = {
        id: `user_${Date.now()}`,
        role: 'user',
        content: `/r ${query}`,
        status: 'complete',
        timestamp: Date.now(),
        conversationId: conv.id,
    };

    // Immediately add the user's turn to the display
    setTurns(prev => [...prev, userTurn]);

    // Save the user's turn to storage and update the conversation state
    chrome.runtime.sendMessage(
      {
        type: ChannelNames.SAVE_CHAT_REQUEST,
        payload: { conversation: conv, message: userTurn },
      },
      (response) => {
        if (response.success && response.conversation) {
          setCurrentConversation(response.conversation);
          const savedUserTurn = response.message;
          if (savedUserTurn) {
            setTurns(prev => prev.map(t => (t.id === userTurn.id ? savedUserTurn : t)));
          }
        }
      }
    );

    setMessage(''); // Clear input bar
    await retrieve(query); // This is async, from useRetriever. It will set retrieverResults.
  };
  
  // Effect to automatically send message to LLM when retriever results are ready
  useEffect(() => {
    if (
      retrieverResults &&
      retrieverResults.query && 
      retrieverResults.formattedResults && // Make sure there's some formatted context
      retrieverResults.query !== processedRetrieverQueryRef.current && // Only process new queries
      !isRetrieving && // Ensure retrieval itself is complete
      !isLoading    // Ensure we are not already waiting for an LLM response from a previous send
    ) {
      const queryToSend = retrieverResults.query; // This is the clean query, e.g., "tell me about bm25"
      
      const hasActualResults = retrieverResults.results && retrieverResults.results.length > 0;
      const isErrorFormattedResult = retrieverResults.formattedResults.toLowerCase().startsWith("error performing search");
      
      if (hasActualResults && !isErrorFormattedResult) {
        console.log(`[Cognito DEBUG] useEffect about to call sendToLLMHook with query: "${queryToSend}"`);
        console.log(`[Cognito] useEffect: Retriever results ready for query "${queryToSend}". Auto-sending to LLM.`);
        (async () => {
          const updatedConversation = await sendToLLMHook(queryToSend, currentConversation || undefined, { skipUserTurn: true });
          if (updatedConversation) {
            setCurrentConversation(updatedConversation);
          }
          clearRetrieverResults();
        })();
        processedRetrieverQueryRef.current = queryToSend;
      } else if (retrieverResults.formattedResults) {
        console.log(`[Cognito] useEffect: Retriever found no actual results or an error for query "${queryToSend}". Displaying info turn and not sending to LLM.`);
        const infoTurn: MessageTurn = {
            id: `info_${Date.now()}`,
            role: 'assistant',
            content: retrieverResults.formattedResults,
            status: 'complete',
            timestamp: Date.now(),
            conversationId: currentConversation?.id || '',
        };

        setTurns(prevTurns => [...prevTurns, infoTurn]);
        chrome.runtime.sendMessage({ type: ChannelNames.SAVE_CHAT_REQUEST, payload: { conversation: currentConversation, message: infoTurn } });
        processedRetrieverQueryRef.current = queryToSend;
        clearRetrieverResults();
      }
    }
  }, [retrieverResults, isRetrieving, isLoading, sendToLLMHook, clearRetrieverResults, currentConversation]);

  useEffect(() => {
    if ((chatStatus === 'idle' || chatStatus === 'done') && retrieverResults) {
      clearRetrieverResults();
    }
  }, [chatStatus, retrieverResults, clearRetrieverResults]);

  const ensureConversation = async () => {
    if (currentConversation) {
      return currentConversation;
    }

    // Don't save yet, just create in memory
    const newConversation: Conversation = {
      id: `temp-${Date.now()}`,
      title: "",
      createdAt: Date.now(),
      lastUpdatedAt: Date.now(),
      ...(config?.chatMode === 'page' && { url: currentTabInfo.url }),
    };

    setCurrentConversation(newConversation);

    return newConversation;
  };

  const handleSendMessage = async (messageToSend: string) => {
    if (isLoading || isRetrieving) return;

    let conversationToUse = currentConversation;
    if (!conversationToUse) {
      conversationToUse = await ensureConversation();
    }

    let finalContext = sessionContext;

    if (tempContext) {
      finalContext += tempContext;
      setTempContext("");
    }

    if (conversationToUse && !conversationToUse.id.startsWith('temp-')) {
      const contextKey = `session_context_${conversationToUse.id}`;

      chrome.storage.local.set({ [contextKey]: finalContext });
      setSessionContext(finalContext);
    }

    const trimmedMessage = messageToSend.trim();

    if (trimmedMessage) {
      setMessage('');
      setSelectedNotesForContext([]);
      const updatedConversation = await sendToLLMHook(trimmedMessage, conversationToUse, { context: finalContext });
      if (updatedConversation) {
        setCurrentConversation(updatedConversation);
      }
    }
  };

  const handleSendFromInput = (messageFromInputBar: string) => {
    handleSendMessage(messageFromInputBar);
  };

  const reset = async () => {
    if (currentConversation && !currentConversation.id.startsWith('temp-')) {
      const contextKey = `session_context_${currentConversation.id}`;

      chrome.storage.local.remove(contextKey);
    }

    await clearPageContextFromStorage();
    setCurrentConversation(null);
    setTurns([]);
    setPageContent('');
    setWebContent('');
    setLoading(false);
    updateConfig({ chatMode: undefined });
    setChatStatus('idle');    
    setMessage('');
    setChatTitle('');
    setHistoryMode(false);
    setSettingsMode(false); 
    setNoteSystemMode(false);
    setSelectedNotesForContext([]);
    setSessionContext("");
    setTempContext("");
    clearRetrieverResults();
    processedRetrieverQueryRef.current = null;

    if (containerRef.current) {
        containerRef.current.scrollTop = 0;
    }
  };

  const onReload = () => {
    const lastUserTurn = [...turns].reverse().find(t => t.role === 'user');

    if (lastUserTurn) {
      handleContinueTurn(lastUserTurn.id);
    }
  };

  const loadChat = (conversation: Conversation) => {
    setCurrentConversation(conversation);
    chrome.runtime.sendMessage({ type: ChannelNames.GET_CHAT_MESSAGES_REQUEST, payload: { conversationId: conversation.id } }, response => {
      if (response.success) {
        setTurns(response.messages);
      }
    });
    setHistoryMode(false);
    setChatStatus('idle');
    setSettingsMode(false);
    setMessage('');
    setSelectedNotesForContext([]);
    clearRetrieverResults();
    processedRetrieverQueryRef.current = null;

    updateConfig({
      useNote: conversation.useNoteActive ?? false,
      selectedModel: conversation.model || config.selectedModel,
      chatMode: conversation.chatMode === 'page' || conversation.chatMode === 'web' ? conversation.chatMode : undefined,
      webMode: conversation.webMode || config.webMode,
    });

    if (conversation.chatMode !== 'page') {
      clearPageContextFromStorage();
      lastInjectedRef.current = { id: null, url: '' };
    }
  }

  const deleteAll = async () => {
    chrome.runtime.sendMessage({ type: ChannelNames.DELETE_ALL_CHATS_REQUEST }, response => {
      if (response.success) {
        reset();
        setChatHistoryRefreshKey(k => k + 1);
        toast.success("Deleted all chats");
      } else {
        toast.error("Failed to delete all chats.");
      }
    });
  };

  const handleDeleteSingleChat = useCallback((chatIdToDelete: string) => {
    chrome.runtime.sendMessage({ type: ChannelNames.DELETE_CHAT_REQUEST, payload: { chatId: chatIdToDelete } }, response => {
      if (response.success) {
        if (currentConversation?.id === chatIdToDelete) {
          reset();
        }

        setChatHistoryRefreshKey(k => k + 1);
        toast.success("Chat deleted.");
      } else {
        toast.error("Failed to delete chat.");
      }
    });
  }, [currentConversation]);

   useEffect(() => {
    if (chatStatus === 'done' || chatStatus === 'idle') { 
      const timer = setTimeout(() => {
        setChatStatus('idle');
      }, 1500);

      return () => clearTimeout(timer);
    }
  }, [chatStatus, setChatStatus]); 

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
      lastInjectedRef.current = { id: null, url: '' };
    };
  }, []);

  const handleNoteModalOpened = useCallback(() => {
    setTriggerNoteCreation(false);
  }, []);

  const handleEditTurn = (index: number, newContent: string) => {
    const turn = turns[index];

    if (turn) {
      const updatedTurn = { ...turn, content: newContent };

      chrome.runtime.sendMessage({ type: ChannelNames.SAVE_CHAT_REQUEST, payload: { conversation: currentConversation, message: updatedTurn } }, response => {
        if (response.success) {
          const newTurns = [...turns];

          newTurns[index] = response.message;
          setTurns(newTurns);
        }
      });
    }
  };

  const handleDeleteTurn = (messageId: string) => {
    chrome.runtime.sendMessage({ type: ChannelNames.DELETE_CHAT_MESSAGE_REQUEST, payload: { messageId: messageId } }, response => {
      if (response.success) {
        setTurns(turns.filter(turn => turn.id !== messageId));
      }
    });
  };

  const handleContinueTurn = (messageId: string) => {
    const turnIndex = turns.findIndex(turn => turn.id === messageId);

    if (turnIndex === -1) return;

    const newTurns = turns.slice(0, turnIndex + 1);
    const assistantTurnToDelete = turns[turnIndex + 1];

    const options: { turns: MessageTurn[]; deleteMessageId?: string } = {
        turns: newTurns,
    };

    if (assistantTurnToDelete && assistantTurnToDelete.role === 'assistant') {
        options.deleteMessageId = assistantTurnToDelete.id;
    }

    sendToLLMHook(newTurns[newTurns.length - 1].content, undefined, options);
  };
  
  const isAnyPageModeActive = settingsMode || historyMode || noteSystemMode || modelSettingsPageMode || apiSettingsPageMode || ragSettingsPageMode || customizePageMode || webSearchPageMode || pageSettingsPageMode;

  const handleClearContext = () => {
    if (currentConversation && !currentConversation.id.startsWith('temp-')) {
      const contextKey = `session_context_${currentConversation.id}`;

      chrome.storage.local.remove(contextKey, () => {
        setSessionContext("");
        toast.success("Context cleared.");
      });
    }

    if (tempContext) {
      setTempContext("");
      toast.success("Context cleared.");
    }
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div
        ref={containerRef}
        className={cn(
          "w-full h-dvh p-0 overflow-hidden",
          "flex flex-col bg-(--bg)",
        )}
      >
          <Header
            apiSettingsPageMode={apiSettingsPageMode}
            chatMode={(config?.chatMode as ChatMode) || 'chat'}
            chatStatus={chatStatus}
            chatTitle={chatTitle}
            onTitleChange={handleTitleChange}
            customizePageMode={customizePageMode}
            deleteAll={deleteAll}
            downloadImage={() => downloadImage(turns)}
            downloadJson={() => downloadJson(turns)}
            downloadMarkdown={() => downloadMarkdown(turns)}
            downloadText={() => downloadText(turns)}
            historyMode={historyMode}
            modelSettingsPageMode={modelSettingsPageMode}
            noteSystemMode={noteSystemMode}
            ragSettingsPageMode={ragSettingsPageMode}
            reset={reset}
            setApiSettingsPageMode={setApiSettingsPageMode}
            setCustomizePageMode={setCustomizePageMode}
            setHistoryMode={setHistoryMode}
            setModelSettingsPageMode={setModelSettingsPageMode}
            setNoteSystemMode={setNoteSystemMode}
            setRagSettingsPageMode={setRagSettingsPageMode}
            setSettingsMode={setSettingsMode}
            settingsMode={settingsMode}
            setWebSearchPageMode={setWebSearchPageMode}
            webSearchPageMode={webSearchPageMode}
            pageSettingsPageMode={pageSettingsPageMode}
            setPageSettingsPageMode={setPageSettingsPageMode}
            onAddNewNoteRequest={() => {
              setNoteSystemMode(true);
              setTriggerNoteCreation(true);
            }} 
            onImportNoteRequest={handleImportNoteRequest}
            onSelectNotesRequest={handleSelectNotesRequest}
          />
        <div className="flex flex-col flex-1 min-h-0 no-scrollbar overflow-y-auto relative">
          {isAnyPageModeActive ? (
            <>
              {settingsMode && <Settings />}
              {historyMode && (
                <ChatHistory
                  key={chatHistoryRefreshKey}
                  className="flex-1 w-full min-h-0"
                  loadChat={loadChat}
                  onDeleteAll={deleteAll}
                  onDeleteChat={handleDeleteSingleChat}
                />
              )}
              {noteSystemMode && (
                <NoteSystemView
                  triggerImportNoteFlow={triggerImportNoteFlow}
                  triggerOpenCreateModal={triggerNoteCreation}
                  triggerSelectNotesFlow={triggerSelectNotesFlow}
                  onImportTriggered={handleImportTriggered}
                  onModalOpened={handleNoteModalOpened}
                  onSelectNotesFlowTriggered={handleSelectNotesFlowTriggered}
                />
              )}
              {modelSettingsPageMode && <ModelSettingsPanel />}
              {apiSettingsPageMode && <ApiSettingsPanel />}
              {ragSettingsPageMode && <RagSettingsPanel />}
              {customizePageMode && <Customize />}
              {webSearchPageMode && <WebSearchPage />}
              {pageSettingsPageMode && <PageSettings />}
            </>
          ) : (
            <div className="flex flex-col flex-1 min-h-0 relative">
              <Messages
                isLoading={isLoading || isRetrieving}
                sessionContext={sessionContext || tempContext}
                settingsMode={settingsMode}
                turns={turns}
                onClearContext={handleClearContext}
                onContinueTurn={handleContinueTurn}
                onDeleteTurn={handleDeleteTurn}
                onEditTurn={handleEditTurn}
                onReload={onReload}
                onLoadChat={loadChat}
              />
            </div>
          )}
        </div>
        {!isAnyPageModeActive && (
          <div className="p-2 relative z-[10]">
            {turns.length === 0 && !config?.chatMode && config && !message && (
              <ActionButtons config={config} updateConfig={updateConfig} />
            )}
            {config?.chatMode === "page" && turns.length === 0 && (
              <PageActionButtons
                isPageActionsHovering={isPageActionsHovering}
                setIsPageActionsHovering={setIsPageActionsHovering}
                onSend={handleSendMessage}
              />
            )}
            {config?.chatMode === "web" && config && (
              <WebSearchModeButtons
                config={config}
                isWebSearchHovering={isWebSearchHovering}
                setIsWebSearchHovering={setIsWebSearchHovering}
                updateConfig={updateConfig}
              />
            )}
            <Input
              conversation={currentConversation}
              ensureConversation={ensureConversation}
              isLoading={isLoading || isRetrieving}
              isRetrieving={isRetrieving}
              message={message}
              selectedNotesForContext={selectedNotesForContext}
              setMessage={setMessage}
              setSelectedNotesForContext={setSelectedNotesForContext}
              setSessionContext={setSessionContext}
              setTempContext={setTempContext}
              onRetrieve={handleRetrieveFromInput}
              onSend={handleSendFromInput}
              onStopRequest={() => {
                onStop();
                clearRetrieverResults();
              }}
            />
          </div>
        )}

        {config?.backgroundImage ? <Background /> : null}
      </div>
    </TooltipProvider>
  );
};

export default Cognito;