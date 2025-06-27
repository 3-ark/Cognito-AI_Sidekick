import { useEffect, useMemo, useState, useCallback } from 'react';
import { motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { GoTrash, GoSearch } from "react-icons/go";
// import localforage from 'localforage'; // No longer directly used for chat history operations
import { Input } from '@/components/ui/input';
import {
  ChatMessageWithEmbedding,
  getAllChatMessages,
  deleteChatMessage,
  deleteAllChatMessages,
} from '../background/chatHistoryStorage'; // Path to the new storage service

const dateToString = (date: number | Date): string => new Date(date).toLocaleDateString('sv-SE');

// MessageTurn and ChatMessage interfaces are now imported or defined in chatHistoryStorage.ts
// We only need ChatMessageWithEmbedding here for props and state.

type ChatHistoryProps = {
  loadChat: (chat: ChatMessageWithEmbedding) => void;
  onDeleteAll: () => void;
  className?: string;
};

declare global {
  interface Window {
    deleteAllChats?: () => void;
  }
}

export const ITEMS_PER_PAGE = 12;
// export const EMBEDDING_CHAT_PREFIX = 'embedding_chat_'; // Moved to chatHistoryStorage.ts

export const ChatHistory = ({ loadChat, onDeleteAll, className }: ChatHistoryProps) => {
  const [allMessagesFromServer, setAllMessagesFromServer] = useState<ChatMessageWithEmbedding[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);

  const processAndSetMessages = useCallback((messages: ChatMessageWithEmbedding[]) => {
    // The new getAllChatMessages already sorts them, but an explicit sort here doesn't hurt
    // and ensures consistency if the service changes.
    const sortedMessages = messages.sort((a, b) => b.last_updated - a.last_updated);
    setAllMessagesFromServer(sortedMessages);
  }, []);

  useEffect(() => {
    const fetchMessages = async () => {
      try {
        const messages = await getAllChatMessages();
        if (messages.length === 0) {
          setAllMessagesFromServer([]);
          setCurrentPage(1);
          return;
        }
        processAndSetMessages(messages);
        setCurrentPage(1);
      } catch (error) {
        console.error("Error fetching messages using service:", error);
        setAllMessagesFromServer([]);
      }
    };
    fetchMessages();
  }, [processAndSetMessages]);
  const filteredMessages = useMemo(() => {
    if (!searchQuery) {
      return allMessagesFromServer;
    }
    const lowerCaseQuery = searchQuery.toLowerCase();
    return allMessagesFromServer.filter(message => {
      const titleMatch = message.title?.toLowerCase().includes(lowerCaseQuery);
      const contentMatch = message.turns.some(turn => turn.content.toLowerCase().includes(lowerCaseQuery));
      return titleMatch || contentMatch;
    });
  }, [allMessagesFromServer, searchQuery]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filteredMessages.length / ITEMS_PER_PAGE)), [filteredMessages]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedMessages = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return filteredMessages.slice(startIndex, endIndex);
  }, [filteredMessages, currentPage]);

  const messagesWithDates = useMemo(() => {
    return paginatedMessages.map(m => ({ ...m, date: dateToString(m.last_updated) }));
  }, [paginatedMessages]);

  const uniqueDates = useMemo(() => {
    return Array.from(new Set(messagesWithDates.map(m => m.date)));
  }, [messagesWithDates]);

  const deleteMessage = useCallback(async (chatId: string) => {
    try {
      await deleteChatMessage(chatId); // Use the new service function

      // Re-fetch and re-process all messages to update the state
      const updatedMessages = await getAllChatMessages();
      processAndSetMessages(updatedMessages);

      // Recalculate filtered messages based on the new 'allMessagesFromServer'
      const newFilteredAfterDelete = updatedMessages.filter(message => {
        if (!searchQuery) return true;
        const lowerCaseQuery = searchQuery.toLowerCase();
        const titleMatch = message.title?.toLowerCase().includes(lowerCaseQuery);
        const contentMatch = message.turns.some(turn => turn.content.toLowerCase().includes(lowerCaseQuery));
        return titleMatch || contentMatch;
      });

      const newTotalPagesCalc = Math.max(1, Math.ceil(newFilteredAfterDelete.length / ITEMS_PER_PAGE));
      let newCurrentPage = currentPage;

      if (newCurrentPage > newTotalPagesCalc) {
        newCurrentPage = newTotalPagesCalc;
      }
      
      const startIndex = (newCurrentPage - 1) * ITEMS_PER_PAGE;
      if (newFilteredAfterDelete.slice(startIndex, startIndex + ITEMS_PER_PAGE).length === 0 && newCurrentPage > 1) {
        newCurrentPage = newCurrentPage - 1;
      }
      setCurrentPage(newCurrentPage);
    } catch (e) { console.error("Error deleting message via service:", e); }
  }, [processAndSetMessages, currentPage, searchQuery]);

  const deleteAll = useCallback(async () => {
    try {
      await deleteAllChatMessages(); // Use the new service function
      setAllMessagesFromServer([]); // Clear local state
      if (onDeleteAll) onDeleteAll(); 
    } catch (e) { console.error("Error deleting all messages via service:", e); }
  }, [onDeleteAll]);

  useEffect(() => {
    window.deleteAllChats = deleteAll;
    return () => {
      if (window.deleteAllChats === deleteAll) delete window.deleteAllChats;
    };
  }, [deleteAll]);

  const handleNextPage = useCallback(() => setCurrentPage(p => Math.min(p + 1, totalPages)), [totalPages]);
  const handlePrevPage = useCallback(() => setCurrentPage(p => Math.max(p - 1, 1)), []);
  const rootComputedClassName = `flex flex-col w-full ${className || ''}`.trim();


  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
  };

  if (allMessagesFromServer.length === 0 && !searchQuery) {
    return (
      <div className={rootComputedClassName}>
        <div className="p-0">
          <div className="relative">
            <Input
              type="text"
              placeholder="Search chat history (titles & content)..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="w-full bg-background rounded-none text-foreground placeholder:text-muted-foreground font-['Space_Mono',_monospace] pl-10"
            />
            <GoSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          </div>
        </div>
        <ScrollArea className="flex-1 w-full min-h-0">
          <div className="px-4 pb-4 pt-5 text-center font-['Space_Mono',_monospace] text-foreground/70 h-full flex items-center justify-center">
            No chat history found.
          </div>
        </ScrollArea>
      </div>
    );
  }

  if (filteredMessages.length === 0 && searchQuery) {
    return (
      <div className={rootComputedClassName}>
        <div className="p-0">
          <div className="relative">
            <Input
              type="text"
              placeholder="Search chat history (titles & content)..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="w-full bg-background rounded-none text-foreground placeholder:text-muted-foreground font-['Space_Mono',_monospace] pl-10"
            />
            <GoSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          </div>
        </div>
        <ScrollArea className="flex-1 w-full min-h-0">
          <div className="px-4 pb-4 pt-5 text-center font-['Space_Mono',_monospace] text-foreground/70 h-full flex items-center justify-center">
            No results found for "{searchQuery}".
          </div>
        </ScrollArea>
      </div>
    );
  }

  return (
    <div className={rootComputedClassName}>
       <div className="p-0">
        <div className="relative">
          <Input
            type="text"
            placeholder="Search chat history (titles & content)..."
            value={searchQuery}
            onChange={handleSearchChange}
            className="w-full bg-background rounded-none text-foreground placeholder:text-muted-foreground font-['Space_Mono',_monospace] pl-10"
          />
          <GoSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        </div>
      </div>     
      <ScrollArea
        className="flex-1 w-full min-h-0"
      >
        <div className="px-4 pb-4 font-['Space_Mono',_monospace]">
          {uniqueDates.map(date => (
            <div key={date} className="mb-3 mt-3">
              <p
                className="text-foreground text-lg font-bold overflow-hidden pl-4 pb-1 text-left text-ellipsis whitespace-nowrap w-[90%]"
              >
                {date === dateToString(new Date()) ? 'Today' : date}
              </p>
              {messagesWithDates
                .filter(m => m.date === date)
                .map(message => (
                  <div
                    key={message.id}
                    className="flex items-center group font-['Space_Mono',_monospace]"
                    onMouseEnter={() => setHoverId(message.id)}
                    onMouseLeave={() => setHoverId(null)}
                  >
                    <span className="text-foreground text-base font-normal pl-4 w-[4.5rem] flex-shrink-0 font-['Space_Mono',_monospace]">
                      {new Date(message.last_updated).getHours().toString().padStart(2, '0')}:
                      {new Date(message.last_updated).getMinutes().toString().padStart(2, '0')}
                    </span>
                    <button className={`text-foreground text-base font-normal overflow-hidden px-4 py-2 text-left text-ellipsis whitespace-nowrap flex-grow hover:underline hover:underline-offset-4 hover:decoration-1 ${message.id === removeId ? 'line-through decoration-2' : ''} font-['Space_Mono',_monospace]`} onClick={() => loadChat(message)}>
                      {message.title || 'Untitled Chat'}
                    </button>
                    <motion.div className={`shrink-0 transition-opacity duration-150 ${hoverId === message.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} whileHover={{ rotate: '15deg' }} onMouseEnter={() => setRemoveId(message.id)} onMouseLeave={() => setRemoveId(null)}>
                      <Button variant="ghost" size="sm" aria-label="Delete chat" className="rounded-full w-8 h-8 font-['Space_Mono',_monospace]" onClick={(e) => { e.stopPropagation(); deleteMessage(message.id); }}>
                        <GoTrash className="h-4 w-4 text-foreground" />
                      </Button>
                    </motion.div>
                  </div>
                ))}
            </div>
          ))}
        </div>
      </ScrollArea>

      {totalPages > 1 && (
        <div className="flex justify-center items-center h-10 space-x-2 p-2 border-t border-[var(--active)]/50 font-['Space_Mono',_monospace]">
          <Button onClick={handlePrevPage} disabled={currentPage === 1} variant="ghost" className="font-['Space_Mono',_monospace]">Prev</Button>
          <span className="text-md">Page {currentPage} of {totalPages}</span>
          <Button onClick={handleNextPage} disabled={currentPage === totalPages} variant="ghost" className="font-['Space_Mono',_monospace]">Next</Button>
        </div>
      )}
    </div>
  );
};