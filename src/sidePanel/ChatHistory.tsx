import {
 useCallback,useEffect, useMemo, useState, 
} from 'react';
import { GoLink, GoSearch,GoTrash } from "react-icons/go";
import { motion } from 'motion/react';

import {
  deleteAllChatData,
  getAllConversations,
} from '../background/chatHistoryStorage';
import { Conversation } from '../types/chatTypes';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

const dateToString = (date: number | Date): string => new Date(date).toLocaleDateString('sv-SE');

type ChatHistoryProps = {
  loadChat: (chat: Conversation) => void;
  onDeleteAll: () => void;
  onDeleteChat: (chatId: string) => void;
  className?: string;
};

declare global {
  interface Window {
    deleteAllChats?: () => void;
  }
}

export const ITEMS_PER_PAGE = 12;

export const ChatHistory = ({
 loadChat, onDeleteAll, onDeleteChat, className, 
}: ChatHistoryProps) => {
  const [allConversations, setAllConversations] = useState<Conversation[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);

  const processAndSetConversations = useCallback((conversations: Conversation[]) => {
    const sortedConversations = conversations.sort((a, b) => b.createdAt - a.createdAt);

    setAllConversations(sortedConversations);
  }, []);

  useEffect(() => {
    const fetchConversations = async () => {
      try {
        const conversations = await getAllConversations();

        if (conversations.length === 0) {
          setAllConversations([]);
          setCurrentPage(1);

          return;
        }

        processAndSetConversations(conversations);
        setCurrentPage(1);
      } catch (error) {
        console.error("Error fetching conversations:", error);
        setAllConversations([]);
      }
    };

    fetchConversations();
  }, [processAndSetConversations]);

  const filteredConversations = useMemo(() => {
    if (!searchQuery) {
      return allConversations;
    }

    const lowerCaseQuery = searchQuery.toLowerCase();

    return allConversations.filter(conversation => {
      return conversation.title?.toLowerCase().includes(lowerCaseQuery);
    });
  }, [allConversations, searchQuery]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filteredConversations.length / ITEMS_PER_PAGE)), [filteredConversations]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedConversations = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;

    return filteredConversations.slice(startIndex, endIndex);
  }, [filteredConversations, currentPage]);

  const conversationsWithDates = useMemo(() => {
    return paginatedConversations.map(c => ({ ...c, date: dateToString(c.createdAt) }));
  }, [paginatedConversations]);

  const uniqueDates = useMemo(() => {
    return Array.from(new Set(conversationsWithDates.map(c => c.date)));
  }, [conversationsWithDates]);

  const handleDeleteConversation = useCallback(async (chatId: string) => {
    if (onDeleteChat) {
      onDeleteChat(chatId);
    } else {
      console.warn("onDeleteChat prop not provided to ChatHistory");
    }
  }, [onDeleteChat]);

  const deleteAll = useCallback(async () => {
    try {
      await deleteAllChatData();
      setAllConversations([]);

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

  if (allConversations.length === 0 && !searchQuery) {
    return (
      <div className={rootComputedClassName}>
        <div className="p-0">
          <div className="relative">
            <Input
              className="w-full bg-background border-b border-[var(--text)]/20 rounded-none text-foreground placeholder:text-muted-foreground font-['Space_Mono',_monospace] pl-10"
              placeholder="Search chat history..."
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
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

  if (filteredConversations.length === 0 && searchQuery) {
    return (
      <div className={rootComputedClassName}>
        <div className="p-0">
          <div className="relative">
            <Input
              className="w-full bg-background rounded-none text-foreground placeholder:text-muted-foreground font-['Space_Mono',_monospace] pl-10"
              placeholder="Search chat history..."
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
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
            className="w-full bg-background rounded-none text-foreground placeholder:text-muted-foreground font-['Space_Mono',_monospace] pl-10"
            placeholder="Search chat history..."
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
          />
          <GoSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        </div>
      </div>     
      <ScrollArea
        className="flex-1 w-full min-h-0"
      >
        <div className="px-2 pb-2 font-['Space_Mono',_monospace]">
          {uniqueDates.map(date => (
            <div key={date} className="mb-3 mt-3">
              <p
                className="text-foreground text-lg font-bold overflow-hidden pb-1 text-left text-ellipsis whitespace-nowrap w-[90%]"
              >
                {date === dateToString(new Date()) ? 'Today' : date}
              </p>
              {conversationsWithDates
                .filter(c => c.date === date)
                .map(conversation => (
                  <div
                    key={conversation.id}
                    className="flex items-center group font-['Space_Mono',_monospace]"
                    onMouseEnter={() => setHoverId(conversation.id)}
                    onMouseLeave={() => setHoverId(null)}
                  >
                    <span className="text-foreground text-sm pl-2 w-[4.5rem] flex-shrink-0 font-['Space_Mono',_monospace]">
                      {new Date(conversation.createdAt).getHours().toString().padStart(2, '0')}:
                      {new Date(conversation.createdAt).getMinutes().toString().padStart(2, '0')}
                    </span>
                    <button
                      className={`text-foreground text-sm w-full overflow-hidden px-4 py-2 text-left flex items-center justify-between flex-grow min-w-0 rounded-md hover:bg-accent ${conversation.id === removeId ? 'line-through decoration-2' : ''} font-['Space_Mono',_monospace]`}
                      onClick={() => loadChat(conversation)}
                    >
                      <span className="overflow-hidden text-ellipsis whitespace-nowrap hover:underline hover:underline-offset-4 hover:decoration-1">
                        {conversation.title || 'Untitled Chat'}
                      </span>
                      {conversation.url && (
                        <GoLink
                          className="h-4 w-4 text-foreground ml-2 flex-shrink-0 cursor-pointer"
                          onClick={e => {
                            e.stopPropagation();
                            window.open(conversation.url, '_blank');
                          }}
                        />
                      )}
                    </button>
                    <motion.div className={`shrink-0 transition-opacity duration-150 ${hoverId === conversation.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} whileHover={{ rotate: '15deg' }} onMouseEnter={() => setRemoveId(conversation.id)} onMouseLeave={() => setRemoveId(null)}>
                      <Button aria-label="Delete chat" className="rounded-full w-8 h-8 font-['Space_Mono',_monospace]" size="sm" variant="ghost" onClick={e => { e.stopPropagation(); handleDeleteConversation(conversation.id); }}>
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
        <div className="flex justify-center items-center h-8 space-x-2 p-2 border-t border-[var(--text)]/20 font-['Space_Mono',_monospace]">
          <Button className="h-8 font-['Space_Mono',_monospace]" disabled={currentPage === 1} variant="ghost" onClick={handlePrevPage}>Prev</Button>
          <span className="text-md">Page {currentPage} of {totalPages}</span>
          <Button className="h-8 font-['Space_Mono',_monospace]" disabled={currentPage === totalPages} variant="ghost" onClick={handleNextPage}>Next</Button>
        </div>
      )}
    </div>
  );
};
