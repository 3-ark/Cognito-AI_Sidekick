import React, {
 ComponentPropsWithoutRef, FC,useCallback, useEffect, useMemo, useRef, useState, 
} from 'react';
import { toast } from 'react-hot-toast';
import {
 GoDownload,GoPencil, GoPin, GoSearch, GoTrash,
} from "react-icons/go";
import {
 FiSave, FiX,
} from "react-icons/fi";
import {
 LuEllipsis, LuVolume2,LuVolumeX, 
} from "react-icons/lu";
import Markdown from 'react-markdown';
import { Virtuoso } from 'react-virtuoso';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

import { remarkWikiLink } from '../remark/remark-wiki-link.mjs';
import ChannelNames from '../types/ChannelNames';
import NoteLink from '../note/components/NoteLink';
import { Note } from '../types/noteTypes';

import { importFiles } from './utils/noteImporter';
import { useConfig } from './ConfigContext';

import { markdownComponents, Pre as SharedPre } from '@/components/MarkdownComponents';
import { Button } from '@/components/ui/button';
import { Checkbox } from "@/components/ui/checkbox";
import {
 Dialog, DialogContent, DialogDescription,DialogHeader, DialogTitle, 
} from '@/components/ui/dialog';
import {
 HoverCard, HoverCardContent,HoverCardTrigger, 
} from "@/components/ui/hover-card";
import { Input } from '@/components/ui/input';
import {
 Popover, PopoverContent,PopoverTrigger, 
} from "@/components/ui/popover";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import {
 Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, 
} from '@/components/ui/tooltip';
import {
  speakMessage,
  speakMessageOpenAI,
  stopSpeech,
  stopSpeechOpenAI,
} from '@/src/background/ttsUtils';
import { cn } from '@/src/background/util';

interface NoteSystemViewProps {
  triggerOpenCreateModal: boolean;
  onModalOpened: () => void;
  triggerImportNoteFlow: boolean;
  onImportTriggered: () => void;
  triggerSelectNotesFlow?: boolean;
  onSelectNotesFlowTriggered?: () => void;
}

import { CodeBlock, CodeBlockCopyButton } from '@/components/ui/code-block';
import { Children } from 'react';
import type { ReactElement, ReactNode } from 'react';

const HovercardPre = (props: React.ComponentPropsWithoutRef<'pre'>) => {
  const { children } = props;

  // The `pre` tag rendered by `react-markdown` has a single `code` child element.
  const codeElement = Children.only(children) as ReactElement<{
    className?: string;
    children?: ReactNode;
  }> | null;

  if (!codeElement) {
    return <pre {...props} />;
  }

  // The language is part of the `code` element's class name (e.g., "language-javascript").
  const language = codeElement.props.className?.replace('language-', '') || '';

  // The actual code content is the child of the `code` element.
  const code = codeElement.props.children ? String(codeElement.props.children).trim() : '';

  return (
    <CodeBlock code={code} language={language} showLineNumbers={false} wrapLines={true}>
      <CodeBlockCopyButton />
    </CodeBlock>
  );
};

const noteSystemMarkdownComponents = {
  ...markdownComponents,
  pre: HovercardPre,
  // @ts-ignore
  wikiLink: ({ value, children }) => <NoteLink href={value}>{children}</NoteLink>,
};

const VIRTUALIZATION_THRESHOLD_LENGTH = 50000; // Chars, approx 50KB.

/**
 * A virtualized content renderer for very large notes inside the edit dialog.
 * It displays content as plain text line-by-line to ensure high performance,
 * which means complex multi-line Markdown formatting will not be rendered.
 * This component uses react-virtuoso to handle variable row heights gracefully.
 */
const VirtualizedContent: FC<{ content: string; textClassName?: string }> = ({ content, textClassName }) => {
  const lines = useMemo(() => content.split('\n'), [content]);

  return (
    <Virtuoso
      className="thin-scrollbar"
      data={lines}
      itemContent={(index, line) => (
        <div className={cn("whitespace-pre-wrap break-words text-sm font-mono px-4 py-0.5", textClassName)}>
          {line || '\u00A0' /* Render a non-breaking space for empty lines to maintain height */}
        </div>
      )}
      style={{ height: '100%' }}
    />
  );
};

interface NoteListItemProps {
  note: Note;
  onEdit: (note: Note) => void;
  onDelete: (noteId: string) => void;
  onTogglePin: (note: Note) => void;
  isSelected: boolean;
  onToggleSelect: (noteId: string) => void;
  isSelectionModeActive: boolean;
}

const NoteListItem: FC<NoteListItemProps> = ({ 
  note, 
  onEdit, 
  onDelete, 
  onTogglePin,
  isSelected, 
  onToggleSelect,
  isSelectionModeActive, 
}) => {
  const handleDoubleClick = () => {
    chrome.runtime.sendMessage({ type: 'OPEN_NOTE_IN_NEW_TAB', payload: { note } });
  };

  const itemRef = useRef<HTMLDivElement>(null);
  const [dynamicMaxHeight, setDynamicMaxHeight] = useState('50vh');
  const [popoverSide, setPopoverSide] = useState<'top' | 'bottom'>('top');
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const handleHoverOpenChange = (open: boolean) => {
    if (open && itemRef.current) {
      const rect = itemRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const verticalMargin = 20; // A small buffer from the edges

      const spaceAbove = rect.top;
      const spaceBelow = viewportHeight - rect.bottom;

      // Prefer the side with more space to avoid the card going off-screen.
      const preferredSide = spaceBelow > spaceAbove ? 'bottom' : 'top';

      setPopoverSide(preferredSide);

      const availableHeight = (preferredSide === 'top' ? spaceAbove : spaceBelow) - verticalMargin;
      
      // Allow up to 70% of viewport, but not more than available space.
      const newMaxHeight = Math.min(availableHeight, viewportHeight * 0.7);
      
      // Enforce a minimum height for small spaces.
      const finalMaxHeight = Math.max(200, newMaxHeight);

      setDynamicMaxHeight(`${finalMaxHeight}px`);
    }
  };

  const handleDownload = () => {
    let mdContent = '---\n';

    // 1. Add title (double-quoted and escaped)
    mdContent += `title: "${note.title.replace(/"/g, '\\\\"')}"\n`;

    // 2. Add source (if note.url exists, double-quoted and escaped)
    if (note.url) {
      mdContent += `source: "${note.url.replace(/"/g, '\\\\"')}"\n`;
    }

    // 3. Add tags (if note.tags exist and are not empty)
    if (note.tags && note.tags.length > 0) {
      mdContent += 'tags:\n';
      note.tags.forEach(tag => {
        const trimmedTag = tag.trim();

        // Conditionally double-quote and escape tags if they contain ':' or '"'
        if (trimmedTag.includes(':') || trimmedTag.includes('"')) {
          mdContent += `  - "${trimmedTag.replace(/"/g, '\\\\"')}"\n`;
        } else {
          mdContent += `  - ${trimmedTag}\n`;
        }
      });
    }

    // 4. Add description (if note.description exists, double-quoted and escaped)
    if (note.description) {
      mdContent += `description: "${note.description.replace(/"/g, '\\\\"')}"\n`;
    }

    // Ensure no date field is added.
    // Ensure no url field (with key 'url') is added.
    mdContent += '---\n\n';
    mdContent += note.content;
    const element = document.createElement('a');

    element.setAttribute('href', `data:text/markdown;charset=utf-8,${encodeURIComponent(mdContent)}`);
    element.setAttribute('download', `${note.title}.md`);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div
      ref={itemRef}
      className={cn(
        "px-2 border-b border-(--text)/20 rounded-none hover:shadow-lg transition-shadow w-full",
        isSelected && "bg-(--active)/10", // Highlight if selected
      )}
      onClick={() => isSelectionModeActive && onToggleSelect(note.id)} // Allow clicking anywhere on the item to select
    >
      <HoverCard closeDelay={100} openDelay={200} onOpenChange={handleHoverOpenChange}>
        <div className="flex justify-between overflow-hidden items-center">
          {isSelectionModeActive && (
            <div className="flex-shrink-0 pr-2">
              <Checkbox
                aria-label={`Select note ${note.title}`}
                checked={isSelected}
                className="border-(--text)/50 data-[state=checked]:bg-(--active) data-[state=checked]:border-(--active)"
                onCheckedChange={() => onToggleSelect(note.id)}
                onClick={e => e.stopPropagation()} // <-- Add this line
              />
            </div>
          )}
          <HoverCardTrigger asChild>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {note.pinned && <GoPin className="flex-shrink-0 text-(--active)" />}
              <h3 className={cn(
              "font-semibold text-md cursor-pointer hover:underline whitespace-normal break-words",
              isSelectionModeActive && "cursor-default hover:no-underline", // No underline when in selection mode
            )}
onDoubleClick={handleDoubleClick}>{note.title}</h3>
            </div>
          </HoverCardTrigger>
          {!isSelectionModeActive && ( // Only show ellipsis menu if not in selection mode
            <div className="flex-shrink-0">
              <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="ghost" onClick={e => { e.stopPropagation(); setIsPopoverOpen(true); }}><LuEllipsis /></Button>
                </PopoverTrigger>
                <PopoverContent className="w-30 bg-[var(--popover)] border-(--text)/20 text-[var(--popover-foreground)] mr-1 p-1 space-y-1 shadow-md">
                  <Button className="w-full justify-start text-md h-8 px-2 font-normal" variant="ghost" onClick={e => { e.stopPropagation(); onTogglePin(note); setIsPopoverOpen(false); }}><GoPin className="mr-2 size-4" /> {note.pinned ? 'Unpin' : 'Pin'}</Button>
                  <Button className="w-full justify-start text-md h-8 px-2 font-normal" variant="ghost" onClick={e => { e.stopPropagation(); onEdit(note); setIsPopoverOpen(false); }}><GoPencil className="mr-2 size-4" /> Edit</Button>
                  <Button className="w-full justify-start text-md h-8 px-2 font-normal" variant="ghost" onClick={e => { e.stopPropagation(); handleDownload(); setIsPopoverOpen(false); }}><GoDownload className="mr-2 size-4" /> ObsidianMD</Button>
                  <Button className="w-full justify-start text-md h-8 px-2 font-normal text-red-500 hover:text-red-500 hover:bg-red-500/10" variant="ghost" onClick={e => { e.stopPropagation(); onDelete(note.id); setIsPopoverOpen(false); }}><GoTrash className="mr-2 size-4" /> Delete</Button>
                </PopoverContent>
              </Popover>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)] mt-0.5 mb-1">
          {note.lastUpdatedAt && <span className="mr-2">Last updated: {new Date(note.lastUpdatedAt).toLocaleDateString()}</span>}
          {note.url && <a className="text-[var(--link)] hover:underline mr-2 truncate max-w-[30%]" href={note.url} rel="noopener noreferrer" target="_blank" onClick={e => e.stopPropagation()}>Link</a>}
          {note.tags && note.tags.length > 0 ? <span className="truncate max-w-[40%] tag-span">Tags: {note.tags.slice(0, 2).join(', ')}{note.tags.length > 2 ? ', ...' : ''}</span> : <p className="text-xs text-[var(--muted-foreground)]">No tags</p>}
        </div>
        <HoverCardContent
          align="start"
          className={cn(
            "bg-[var(--popover)] border-(--active) text-[var(--popover-foreground)] markdown-body w-[80vw] sm:w-[70vw] md:w-[50vw] lg:w-[40vw] max-w-lg",
            "p-0 flex flex-col", // Use flexbox for the main layout, remove padding to allow content to fill edges.
          )}
          side={popoverSide}
          style={
            note.content.length > VIRTUALIZATION_THRESHOLD_LENGTH
              ? { height: dynamicMaxHeight } // Use fixed height for virtualized notes to make flexbox work
              : { maxHeight: dynamicMaxHeight } // Use max-height for regular notes
          }
        >
          {note.content.length > VIRTUALIZATION_THRESHOLD_LENGTH ? (

            // VIRTUALIZED LAYOUT: Let the virtualizer handle its own scrolling inside a flex container.
            <>
              <div className="p-4 pb-2 flex-shrink-0"> {/* Header area with padding */}
                <h4 className="text-sm font-semibold">{note.title}</h4>
                <p className="text-xs text-[var(--muted-foreground)]">Date: {new Date(note.lastUpdatedAt).toLocaleString()}</p>
              </div>
              <div className="flex-1 min-h-0 w-full"> {/* The virtualized content takes up the remaining space */}
                <VirtualizedContent content={note.content} />
              </div>
              {note.tags && note.tags.length > 0 && (
                <div className="p-4 pt-2 mt-2 border-t border-[var(--border)] flex-shrink-0"> {/* Footer area with padding */}
                  <p className="text-xs font-semibold text-(--text) mb-1">Tags:</p>
                  <div className="flex flex-wrap gap-1">
                    {note.tags.map(tag => (<span key={tag} className="text-xs bg-[var(--muted)] text-[var(--muted-foreground)] px-2 py-0.5 rounded">{tag}</span>))}
                  </div>
                </div>
              )}
            </>
          ) : (

            // REGULAR MARKDOWN LAYOUT: Make the entire card content scrollable.
            <div className="p-4 overflow-y-auto thin-scrollbar">
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">{note.title}</h4>
                <p className="text-xs text-[var(--muted-foreground)]">Date: {new Date(note.lastUpdatedAt).toLocaleString()}</p>
                <div className="text-sm break-words whitespace-pre-wrap">
                  <Markdown components={noteSystemMarkdownComponents} remarkPlugins={[remarkGfm, remarkMath, remarkWikiLink]} rehypePlugins={[rehypeKatex]}>{note.content}</Markdown>
                </div>
                {note.tags && note.tags.length > 0 && (
                  <div className="border-t border-[var(--border)] pt-2 mt-2">
                    <p className="text-xs font-semibold text-(--text) mb-1">Tags:</p>
                    <div className="flex flex-wrap gap-1">
                      {note.tags.map(tag => (<span key={tag} className="text-xs bg-[var(--muted)] text-[var(--muted-foreground)] px-2 py-0.5 rounded">{tag}</span>))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </HoverCardContent>
      </HoverCard>
    </div>
  );
};

const ITEMS_PER_PAGE = 9;

// pdfjsLib.GlobalWorkerOptions.workerSrc is expected to be set globally or via direct import in noteImporter.ts if needed by pdfjs-dist

export const NoteSystemView: React.FC<NoteSystemViewProps> = ({
  triggerOpenCreateModal,
  onModalOpened,
  triggerImportNoteFlow,
  onImportTriggered,
  triggerSelectNotesFlow,
  onSelectNotesFlowTriggered,
}) => {
  const [allNotes, setAllNotes] = useState<Note[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSelectionModeActive, setIsSelectionModeActive] = useState(false);
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteTags, setNoteTags] = useState('');
  const [isEditingNoteContent, setIsEditingNoteContent] = useState(false);
  const [isSpeakingNoteInDialog, setIsSpeakingNoteInDialog] = useState(false);
  
  const [pendingPageData, setPendingPageData] = useState<{title: string, content: string, url?: string} | null>(null);

  const { config } = useConfig();

  const fetchNotes = useCallback(async () => {
    // const notes = await getAllNotesFromSystem();
    // setAllNotes(notes);
    chrome.runtime.sendMessage({ type: ChannelNames.GET_ALL_NOTES_REQUEST }, response => {
      if (chrome.runtime.lastError) {
        console.error("Error fetching notes:", chrome.runtime.lastError.message);
        toast.error("Failed to fetch notes.");

        return;
      }

      if (response.success && response.notes) {
        setAllNotes(response.notes);
      } else {
        console.error("Failed to fetch notes:", response.error);
        toast.error(response.error || "An unknown error occurred while fetching notes.");
      }
    });
  }, [setAllNotes]); // setAllNotes is stable

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const openCreateModal = useCallback((initialData?: { title?: string; content?: string }) => {
    setEditingNote(null);
    setNoteTitle(initialData?.title || '');
    setNoteContent(initialData?.content || '');
    setNoteTags('');
    setIsCreateModalOpen(true);
    setIsEditingNoteContent(true); // For new notes, always start in editing mode.
  }, [setEditingNote, setNoteTitle, setNoteContent, setNoteTags, setIsCreateModalOpen, setIsEditingNoteContent]); // State setters are stable

  useEffect(() => {
    const sendReadySignal = async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (tab?.id) {
          console.log(`[NoteSystemView] Component mounted for tab ${tab.id}. Sending SIDE_PANEL_READY signal.`);
          chrome.runtime.sendMessage({ type: 'SIDE_PANEL_READY', tabId: tab.id }, readyResponse => {
            if (chrome.runtime.lastError) {
              console.warn('[NoteSystemView] Could not send ready signal:', chrome.runtime.lastError.message);
            } else {
              console.log('[NoteSystemView] Background acknowledged ready signal:', readyResponse);
            }
          });
        } else {
            console.error('[NoteSystemView] Could not determine the tab ID to send ready signal.');
        }
      } catch (e) {
        console.error('[NoteSystemView] Error sending ready signal:', e);
      }
    };

    sendReadySignal();
  }, []);

  const isCreateModalOpenRef = useRef(isCreateModalOpen);

  useEffect(() => {
    isCreateModalOpenRef.current = isCreateModalOpen;
  }, [isCreateModalOpen]);

  // Consolidated listener setup
  useEffect(() => {
    const handleRuntimeMessage = (message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void): boolean => {
      if (message.type === ChannelNames.CREATE_NOTE_FROM_PAGE_CONTENT && message.payload) {
        setPendingPageData(message.payload);
        sendResponse({ status: "PAGE_DATA_QUEUED_FOR_AUTO_SAVE" });

        return true;
      } else if (message.type === ChannelNames.ERROR_OCCURRED && message.payload) {
        toast.error(String(message.payload));
        sendResponse({ status: "ERROR_DISPLAYED_BY_NOTESYSTEM" });

        return true;
      }

      return false;
    };

    chrome.runtime.onMessage.addListener(handleRuntimeMessage);

    const port = chrome.runtime.connect({ name: ChannelNames.SidePanelPort });

    port.postMessage({ type: 'init' });

    const handlePortMessage = (message: any) => {
      if (message.type === 'ADD_SELECTION_TO_NOTE' && message.payload) {
        if (isCreateModalOpenRef.current) {
          setNoteContent(currentContent => currentContent ? `${currentContent}\n\n${message.payload}` : message.payload);
        } else {
          openCreateModal({ content: message.payload, title: `Note with Selection` });
        }

        toast.success("Selection added to note draft.");
      }
    };

    port.onMessage.addListener(handlePortMessage);

    return () => {
      chrome.runtime.onMessage.removeListener(handleRuntimeMessage);
      port.disconnect();
    };
  }, [openCreateModal, setNoteContent, setPendingPageData]);

  useEffect(() => {
    const autoSaveNote = async () => {
      if (pendingPageData) {
        console.log('[NoteSystemView] pendingPageData detected. Attempting automatic save.');
        
        const dataToSave = { ...pendingPageData };

        setPendingPageData(null); 

        if (!dataToSave.content || dataToSave.content.trim() === "") {
          toast.error("Cannot save note: Content is empty.");

          return;
        }

        const noteToSave: Partial<Note> & { content: string } = {
          title: dataToSave.title.trim() || `Note - ${new Date().toLocaleDateString()}`,
          content: dataToSave.content,
          tags: [],
          description: "",
          url: dataToSave.url,
        };

        chrome.runtime.sendMessage({ type: ChannelNames.SAVE_NOTE_REQUEST, payload: noteToSave }, response => {
          if (chrome.runtime.lastError) {
            console.error("[NoteSystemView] Error auto-saving note:", chrome.runtime.lastError.message);
            toast.error("Failed to auto-save note.");

            return;
          }

          if (response.success) {
            toast.success("Page added to notes!");
            fetchNotes(); // Re-fetch notes to update the list
          } else {
            console.error("[NoteSystemView] Error auto-saving note:", response.error);
            toast.error(response.error || "Failed to auto-save note.");
          }
        });
      }
    };

    autoSaveNote();
  }, [pendingPageData, fetchNotes]); // fetchNotes is stable

  useEffect(() => {
    if (triggerOpenCreateModal) {
      openCreateModal();
      onModalOpened();
    }
  }, [triggerOpenCreateModal, onModalOpened, openCreateModal]);

  const handleImportNote = () => {
    fileInputRef.current?.click();
  };

  useEffect(() => {
    if (triggerImportNoteFlow) {
      handleImportNote();
      onImportTriggered();
    }
  }, [triggerImportNoteFlow, onImportTriggered]);

  useEffect(() => {
    if (triggerSelectNotesFlow) {
      setIsSelectionModeActive(true);
      setSelectedNoteIds([]); // Clear previous selections

      if (onSelectNotesFlowTriggered) {
        onSelectNotesFlowTriggered();
      }
    }
  }, [triggerSelectNotesFlow, onSelectNotesFlowTriggered]);

  const handleToggleSelectNote = (noteId: string) => {
    setSelectedNoteIds(prevSelectedIds =>
      prevSelectedIds.includes(noteId)
        ? prevSelectedIds.filter(id => id !== noteId)
        : [...prevSelectedIds, noteId],
    );
  };

  const handleCancelSelectionMode = () => {
    setIsSelectionModeActive(false);
    setSelectedNoteIds([]);
  };

  const handleExportSelectedNotes = async () => {
    if (selectedNoteIds.length === 0) {
      toast.error("No notes selected to export.");

      return;
    }

    const toastId = toast.loading(`Exporting ${selectedNoteIds.length} note(s)...`);

    chrome.runtime.sendMessage(
      { type: ChannelNames.EXPORT_NOTES_REQUEST, payload: { noteIds: selectedNoteIds } },
      response => {
        if (chrome.runtime.lastError) {
          console.error("Error exporting notes:", chrome.runtime.lastError.message);
          toast.error("An unexpected error occurred during export.", { id: toastId });
          handleCancelSelectionMode();

          return;
        }

        if (response.success && response.result) {
          const { successCount, errorCount } = response.result;

          if (successCount > 0) {
            toast.success(`${successCount} note(s) exported successfully.`, { id: toastId });
          }

          if (errorCount > 0) {
            toast.error(`${errorCount} note(s) failed to export. Check console for details.`, {
              id: successCount === 0 ? toastId : undefined,
              duration: 5000,
            });
          }

          if (successCount === 0 && errorCount === 0 && selectedNoteIds.length > 0) {
             // This case implies something went wrong if notes were selected but none processed
            toast.error("Export completed but no notes were processed.", { id: toastId });
          } else if (successCount === 0 && errorCount === 0 && selectedNoteIds.length === 0) {
            toast.dismiss(toastId); // No notes were selected initially
          }
        } else {
          console.error("Error exporting notes:", response.error);
          toast.error(response.error || "An unexpected error occurred during export.", { id: toastId });
        }

        handleCancelSelectionMode();
      },
    );
  };

  const handleDeleteSelectedNotes = async () => {
    if (selectedNoteIds.length === 0) {
      toast.error("No notes selected to delete.");

      return;
    }

    toast.custom(
      t => (
        <div
          className={cn(
            "bg-(--bg) text-(--text) border border-(--text)",
            "p-4 rounded-xl shadow-xl max-w-sm w-full",
            "flex flex-col space-y-3",
          )}
        >
          <h4 className="text-lg font-semibold text-(--text)">Confirm Deletion</h4>
          <p className="text-sm text-(--text) opacity-90">
            Are you sure you want to delete {selectedNoteIds.length} selected note(s)? This action cannot be undone.
          </p>
          <div className="flex justify-end space-x-3 pt-2">
            <Button
              className={cn(
                "bg-transparent text-(--text) border-(--text)",
                "hover:bg-(--active)/30 focus:ring-1 focus:ring-(--active)",
              )}
              size="sm"
              variant="outline"
              onClick={() => toast.dismiss(t.id)}
            >
              Cancel
            </Button>
            <Button
              className={cn(
                "focus:ring-1 focus:ring-red-400 focus:ring-offset-1 focus:ring-offset-(--bg)",
              )}
              size="sm"
              variant="destructive"
              onClick={async () => {
                toast.dismiss(t.id); // Dismiss confirmation toast
                const deleteToastId = toast.loading(`Deleting ${selectedNoteIds.length} note(s)...`);

                chrome.runtime.sendMessage(
                  { type: ChannelNames.DELETE_NOTE_REQUEST, payload: { noteIds: selectedNoteIds } },
                  response => {
                    if (chrome.runtime.lastError) {
                      console.error("Error deleting notes:", chrome.runtime.lastError.message);
                      toast.error("Failed to delete notes.", { id: deleteToastId });
                      handleCancelSelectionMode();

                      return;
                    }

                    if (response.success) {
                      toast.success(`${selectedNoteIds.length} note(s) deleted successfully.`, { id: deleteToastId });
                      fetchNotes(); // Refresh the notes list
                    } else {
                      console.error("Error deleting notes:", response.error);
                      toast.error(response.error || "Failed to delete notes.", { id: deleteToastId });
                    }

                    handleCancelSelectionMode();
                  },
                );
              }}
            >
              Delete Selected
            </Button>
          </div>
        </div>
      ),
      {
        duration: Infinity, 
        position: 'top-center',
      },
    );
  };

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];

    if (files.length === 0) return;

    let importSuccessCount = 0;
    let importErrorCount = 0;

    const importResults = await importFiles(files);

    for (const result of importResults) {
      if (result.success && result.note) {
        const savePromise = new Promise<void>((resolveSave, rejectSave) => {
          chrome.runtime.sendMessage({ type: ChannelNames.SAVE_NOTE_REQUEST, payload: result.note }, response => {
            if (chrome.runtime.lastError) {
              console.error(`Error saving imported note ${result.fileName} via message:`, chrome.runtime.lastError.message);
              rejectSave(new Error(chrome.runtime.lastError.message));

              return;
            }

            if (response.success) {
              toast.success(`Note imported: ${result.fileName}`);
              importSuccessCount++;
              resolveSave();
            } else {
              console.error(`Error saving imported note ${result.fileName} via message:`, response.error);
              rejectSave(new Error(response.error || `Failed to save imported note ${result.fileName}`));
            }
          });
        });

        try {
          await savePromise;
        } catch (saveError: any) {
          toast.error(`Failed to save imported note ${result.fileName}. Reason: ${saveError.message}`);
          importErrorCount++;
        }
      } else {
        toast.error(`Cannot import '${result.fileName}': ${result.error}`);
        importErrorCount++;
      }
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = ''; // Clear the file input
    }

    if (importSuccessCount > 0) {
      fetchNotes(); // Refresh the notes list
    }

    if (files.length > 1) {
      if (importSuccessCount === files.length) {
        toast.success(`All ${files.length} notes imported successfully!`);
      } else if (importErrorCount === files.length) {
        toast.error(`Failed to import any of the ${files.length} notes.`);
      } else {
        toast.loading(`Imported ${importSuccessCount} of ${files.length} notes. See other notifications for details.`, { duration: 4000 });
      }
    } else if (files.length === 1 && importErrorCount === 1 && importSuccessCount === 0) {
      // Error toast for single file import already handled by the loop
    } else if (files.length === 1 && importSuccessCount === 1) {
      // Success toast for single file import already handled by the loop
    }
  };

  const filteredNotes = useMemo(() => {
    let notesToFilter = [...allNotes];

    // Sort by pinned status first, then by last updated date
    notesToFilter.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return b.lastUpdatedAt - a.lastUpdatedAt;
    });

    if (!searchQuery) {
      return notesToFilter;
    }

    const lowerCaseQuery = searchQuery.toLowerCase();

    return notesToFilter.filter(note => {
      const titleMatch = note.title.toLowerCase().includes(lowerCaseQuery);
      const contentMatch = note.content.toLowerCase().includes(lowerCaseQuery);
      const tagsMatch = note.tags && note.tags.some(tag => tag.toLowerCase().includes(lowerCaseQuery));

      return titleMatch || contentMatch || tagsMatch;
    });
  }, [allNotes, searchQuery]);

  const paginatedNotes = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;

    return filteredNotes.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredNotes, currentPage]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filteredNotes.length / ITEMS_PER_PAGE)), [filteredNotes]);

  const handleSaveNote = async () => {
    if (!noteContent.trim()) {
      toast.error("Note content cannot be empty.");

      return;
    }

    const parsedTags = noteTags.trim() === '' ? [] : noteTags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);

    const noteToSave: Partial<Note> & { content: string } = {
      id: editingNote?.id,
      title: noteTitle.trim() || `Note - ${new Date().toLocaleDateString()}`,
      content: noteContent,
      tags: parsedTags,
      description: '', // Description is not currently used in the UI, but can be added later
      url: editingNote?.url,

    };

    chrome.runtime.sendMessage({ type: ChannelNames.SAVE_NOTE_REQUEST, payload: noteToSave }, response => {
      if (chrome.runtime.lastError) {
        console.error("Error saving note:", chrome.runtime.lastError.message);
        toast.error(editingNote ? "Failed to update note." : "Failed to create note.");

        return;
      }

      if (response.success) {
        toast.success(editingNote ? "Note updated!" : "Note created!");
        fetchNotes(); // Refresh notes
        setIsCreateModalOpen(false);
        setEditingNote(null);
        setNoteTitle(''); setNoteContent(''); setNoteTags(''); setIsEditingNoteContent(false);
      } else {
        console.error("Error saving note:", response.error);
        toast.error(response.error || (editingNote ? "Failed to update note." : "Failed to create note."));
      }
    });
  };

  const handleTogglePin = (note: Note) => {
    const updatedNote = { ...note, pinned: !note.pinned, lastUpdatedAt: note.lastUpdatedAt };

    chrome.runtime.sendMessage({ type: ChannelNames.SAVE_NOTE_REQUEST, payload: updatedNote }, response => {
      if (response.success) {
        toast.success(updatedNote.pinned ? 'Note pinned!' : 'Note unpinned!');
        fetchNotes();
      } else {
        toast.error(`Error: ${response.error}`);
      }
    });
  };

  const openEditModal = (note: Note) => {
    const newNoteTags = note.tags ? note.tags.join(', ') : '';

    setEditingNote(note);
    setNoteTitle(note.title);
    setNoteContent(note.content);
    setNoteTags(newNoteTags);
    setIsCreateModalOpen(true);
    setIsEditingNoteContent(note.content.length <= VIRTUALIZATION_THRESHOLD_LENGTH);

    if (isSpeakingNoteInDialog) { // Stop speech if it was active
      stopSpeech();
      setIsSpeakingNoteInDialog(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    chrome.runtime.sendMessage({ type: ChannelNames.DELETE_NOTE_REQUEST, payload: { noteId } }, response => {
      if (chrome.runtime.lastError) {
        console.error("Error deleting note:", chrome.runtime.lastError.message);
        toast.error("Failed to delete note.");

        return;
      }

      if (response.success) {
        toast.success("Note deleted!");
        fetchNotes(); // Refresh notes
      } else {
        console.error("Error deleting note:", response.error);
        toast.error(response.error || "Failed to delete note.");
      }
    });
  };

  const handleReadNoteInDialog = () => {
    if (!noteContent.trim()) return;

    if (isSpeakingNoteInDialog) {
      if (config.tts?.provider === 'openai') {
        stopSpeechOpenAI();
      } else {
        stopSpeech();
      }
      setIsSpeakingNoteInDialog(false);
    } else {
      setIsSpeakingNoteInDialog(true);
      const onEndCallback = () => setIsSpeakingNoteInDialog(false);

      if (config.tts?.provider === 'openai') {
        if (config.openAiApiKey) {
          speakMessageOpenAI(
            noteContent,
            config.openAiApiKey,
            config.tts.selectedVoice,
            config.tts.model,
            config.tts.endpoint,
            { onEnd: onEndCallback },
          );
        } else {
          console.error('OpenAI API key not found');
          setIsSpeakingNoteInDialog(false);
        }
      } else {
        speakMessage(noteContent, config?.tts?.selectedVoice, config?.tts?.rate, {
          onEnd: onEndCallback,
        });
      }
    }
  };

  useEffect(() => {
    const stopSpeechIfNeeded = () => {
      if (config.tts?.provider === 'openai') {
        stopSpeechOpenAI();
      } else {
        stopSpeech();
      }
      setIsSpeakingNoteInDialog(false);
    };

    if (!isCreateModalOpen && isSpeakingNoteInDialog) {
      stopSpeechIfNeeded();
    }

    if (isCreateModalOpen && isSpeakingNoteInDialog && noteContent.trim() === '') {
      stopSpeechIfNeeded();
    }
  }, [isCreateModalOpen, noteContent, isSpeakingNoteInDialog, config.tts?.provider]);

  return (
    <TooltipProvider delayDuration={500}>
    <div className="flex flex-col h-full text-(--text)">
      <input
        ref={fileInputRef}
        accept=".txt,.md,.html,.htm,.pdf,.csv,.tsv,.json,.jsonl,.zip,.epub"
        style={{ display: 'none' }}
        type="file"
        multiple
        onChange={handleFileSelected}
      />
      <div className="pb-3">
        <div className="relative">
          <Input
            className={cn(
              "w-full bg-background border-b border-(--text)/20 text-foreground placeholder:text-muted-foreground font-['Space_Mono',_monospace] pl-10 rounded-none",
            )}
            placeholder="Search notes (titles & content & tags)..."
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          <GoSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        </div>
      </div>

      <ScrollArea className="flex-1">
        {paginatedNotes.length === 0 ? (
          <p className="text-center text-[var(--muted-foreground)] py-4">
            {searchQuery ? `No notes found for "${searchQuery}".` : "No notes yet. Create one!"}
          </p>
        ) : (
          <div className="space-y-0">
            {paginatedNotes.map(note => (
              <NoteListItem
                key={note.id}
                isSelected={selectedNoteIds.includes(note.id)}
                isSelectionModeActive={isSelectionModeActive}
                note={note}
                onDelete={handleDeleteNote}
                onEdit={openEditModal}
                onTogglePin={handleTogglePin}
                onToggleSelect={handleToggleSelectNote}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      {isSelectionModeActive && selectedNoteIds.length > 0 && (
        <div className="sticky bottom-0 z-10 p-2 bg-(--bg) border-t border-(--text)/20 shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-sm text-(--text)">
              {selectedNoteIds.length} note{selectedNoteIds.length > 1 ? 's' : ''} selected
            </span>
            <div className="space-x-2">
              <Button size="sm" variant="outline-subtle" onClick={handleExportSelectedNotes}>Export</Button>
              <Button size="sm" variant="destructive-outline" onClick={handleDeleteSelectedNotes}>Delete</Button>
              <Button size="sm" variant="ghost" onClick={handleCancelSelectionMode}>Done</Button>
            </div>
          </div>
        </div>
      )}

      {!isSelectionModeActive && totalPages > 1 && (
        <div className="flex justify-center items-center h-8 space-x-2 p-2 font-['Space_Mono',_monospace]">
          <Button
            className="h-8 font-['Space_Mono',_monospace]"
            disabled={currentPage === 1}
            variant="ghost"
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
          >Prev</Button>
          <span className="text-md">Page {currentPage} of {totalPages}</span>
          <Button
            className="h-8 font-['Space_Mono',_monospace]"
            disabled={currentPage === totalPages}
            variant="ghost"
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
          >Next</Button>
        </div>
      )}

      <Dialog open={isCreateModalOpen}
onOpenChange={isOpen => {
        if (!isOpen) {
          setIsCreateModalOpen(false);
          setEditingNote(null);
          setNoteTitle('');
          setNoteContent('');
          setNoteTags('');
          setIsEditingNoteContent(false);
        } else {
          setIsCreateModalOpen(true);
        }
      }}>
        <DialogContent 
          className={cn(
            "bg-(--bg) border-(--text)/20 w-[90vw] max-w-3xl text-(--text) overflow-hidden",
            "flex flex-col max-h-[85vh]",
            "p-4",
          )}
        >
          <DialogHeader>
            <DialogTitle>{editingNote ? 'Edit Note' : 'Create New Note'}</DialogTitle>
            <DialogDescription className="text-(--text)/80 pt-1">
              {editingNote ? 'Update the title or content of your note.' : 'Provide a title (optional) and content for your new note.'}
            </DialogDescription>
          </DialogHeader>

          {/* Main content area: Title, scrollable Textarea, Tags */}
          <div className="flex flex-col min-h-0 space-y-4">
            <div>
              <Input
                className="bg-[var(--input-background)] border-(--text)/20 text-(--text) focus-visible:ring-1 focus-visible:ring-(--active)"
                placeholder="Note Title (optional)"
                value={noteTitle}
                onChange={e => setNoteTitle(e.target.value)}
              />
            </div>

            {editingNote && !isEditingNoteContent ? (
              <div className="flex flex-col min-h-0 space-y-2">
                <div className="flex justify-end">
                  <Button className="border-[var(--border)] text-(--text) hover:bg-(--text)/10 focus-visible:ring-1 focus-visible:ring-(--active)" size="sm" variant="outline" onClick={() => setIsEditingNoteContent(true)}>Edit Content</Button>
                </div>
                <div className="h-full border rounded-md border-(--text)/20 bg-[var(--input-background)]">
                  <VirtualizedContent
                    content={noteContent}
                    textClassName="text-(--text)"
                  />
                </div>
              </div>
            ) : (
              <Textarea
                className="w-full min-h-[25vh] max-h-[55vh] overflow-y-auto thin-scrollbar border-1 bg-[var(--input-background)] border-(--text)/20 text-(--text) resize-none"
                minRows={5}
                placeholder="Your note content..."
                value={noteContent}
                onChange={e => setNoteContent(e.target.value)}
              />
            )}
            <div>
              <Input
                className="bg-[var(--input-background)] border-(--text)/20 text-(--text) focus-visible:ring-1 focus-visible:ring-(--active)"
                placeholder="Tags (comma-separated)"
                value={noteTags}
                onChange={e => setNoteTags(e.target.value)}
              />
            </div>
          </div>
          {/* Footer */}
          <div className="flex justify-between items-center"> 
            <div>
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      aria-label={isSpeakingNoteInDialog ? "Stop reading note" : "Read note aloud"}
                      className={cn(
                        "p-1.5 rounded-md h-8 w-8", 
                        "text-(--text) hover:bg-(--text)/10",
                        "focus-visible:ring-1 focus-visible:ring-(--active) focus-visible:ring-offset-1 focus-visible:ring-offset-(--bg)",
                      )} 
                      disabled={!noteContent.trim()}
                      size="sm"
                      variant="ghost"
                      onClick={handleReadNoteInDialog}
                    >
                      {isSpeakingNoteInDialog ? <LuVolumeX className="h-5 w-5" /> : <LuVolume2 className="h-5 w-5" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="bg-secondary/50 text-foreground" side="top">
                    <p>{isSpeakingNoteInDialog ? "Stop Reading" : "Read Note Aloud"}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="space-x-2">
              <Button
                size="persona"
                type="button"
                variant="outline-subtle"
                onClick={() => {
                  setIsCreateModalOpen(false);
                  setEditingNote(null);

                  if (isSpeakingNoteInDialog) {
                    stopSpeech();
                    setIsSpeakingNoteInDialog(false);
                  }
                }}
              >
                <FiX />
                Cancel
              </Button>
              <Button
                size="persona"
                type="button"
                variant="save"
                onClick={handleSaveNote}
              >
                <FiSave />
                {editingNote ? 'Save Changes' : 'Create Note'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </TooltipProvider>
  );
};
