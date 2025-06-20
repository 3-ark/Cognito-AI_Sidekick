import React, { useEffect, useState, useCallback, useMemo, useRef, ComponentPropsWithoutRef } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { GoTrash, GoPencil, GoSearch, GoDownload } from "react-icons/go";
import { LuEllipsis } from "react-icons/lu";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { toast } from 'react-hot-toast';
import { Note } from '../types/noteTypes';
import { getAllNotesFromSystem, saveNoteInSystem, deleteNoteFromSystem, deleteAllNotesFromSystem } from '../background/noteStorage';
import { cn } from '@/src/background/util';
import { useConfig } from './ConfigContext';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import * as pdfjsLib from 'pdfjs-dist';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import yaml from 'js-yaml';
import Defuddle from 'defuddle';
import ChannelNames from '../types/ChannelNames';
import { markdownComponents, Pre as SharedPre } from '@/components/MarkdownComponents';

interface NoteSystemViewProps {
  triggerOpenCreateModal: boolean;
  onModalOpened: () => void;
  triggerImportNoteFlow: boolean;
  onImportTriggered: () => void;
}

const noteSystemMarkdownComponents = {
  ...markdownComponents,
  pre: (props: ComponentPropsWithoutRef<typeof SharedPre>) => (
    <SharedPre
      {...props}
      wrapperClassName="my-2"
      className={cn("bg-[var(--code-bg)] text-[var(--code-text)]", props.className)}
      buttonClassName="h-7 w-7 text-[var(--text)] hover:bg-[var(--text)]/10"
    />
  ),
};

const ITEMS_PER_PAGE = 12;

const turndownService = new TurndownService({
  headingStyle: 'atx',
  hr: '---',
  bulletListMarker: '*',
  codeBlockStyle: 'fenced',
  emDelimiter: '_',
  strongDelimiter: '**',
  linkStyle: 'inlined',
  linkReferenceStyle: 'full',
});
turndownService.use(gfm);

try {
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL) {
    const workerUrl = chrome.runtime.getURL('pdf.worker.mjs');
    if (workerUrl) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
    } else {
      console.warn("[NoteSystemView] Could not get worker URL via chrome.runtime.getURL for 'pdf.worker.mjs'. Attempting default path or expecting it to be globally set.");
    }
  } else {
    console.warn("[NoteSystemView] chrome.runtime.getURL is not available. PDF.js worker might not be configured correctly for this environment.");
  }
} catch (e) {
  console.error("[NoteSystemView] Error setting pdf.js worker source:", e);
}

export const NoteSystemView: React.FC<NoteSystemViewProps> = ({ 
  triggerOpenCreateModal, 
  onModalOpened,
  triggerImportNoteFlow,
  onImportTriggered,
}) => {
  const [allNotes, setAllNotes] = useState<Note[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteTags, setNoteTags] = useState('');
  
  const [pendingPageData, setPendingPageData] = useState<{title: string, content: string, url?: string} | null>(null);

  const { config } = useConfig();

  const fetchNotes = useCallback(async () => {
    const notes = await getAllNotesFromSystem();
    setAllNotes(notes);
  }, []);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const openCreateModal = useCallback((initialData?: { title?: string; content?: string }) => {
    setEditingNote(null);
    setNoteTitle(initialData?.title || '');
    setNoteContent(initialData?.content || '');
    setNoteTags('');
    setIsCreateModalOpen(true);
  }, []);

  useEffect(() => {
    const sendReadySignal = async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          console.log(`[NoteSystemView] Component mounted for tab ${tab.id}. Sending SIDE_PANEL_READY signal.`);
          chrome.runtime.sendMessage({ type: 'SIDE_PANEL_READY', tabId: tab.id }, (readyResponse) => {
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

  useEffect(() => {
    const messageListener = (message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void): boolean | undefined => {
      let isHandled = false;

      if (message.type === "CREATE_NOTE_FROM_PAGE_CONTENT" && message.payload) {
        console.log('[NoteSystemView] Received page data. Storing it in state to trigger auto-save.');
        setPendingPageData(message.payload);
        sendResponse({ status: "PAGE_DATA_QUEUED_FOR_AUTO_SAVE" });
        isHandled = true;
      }
      else if (message.type === "ERROR_OCCURRED" && message.payload) {
        console.log('[NoteSystemView] Received ERROR_OCCURRED via runtime message.');
        toast.error(String(message.payload));
        sendResponse({ status: "ERROR_DISPLAYED_BY_NOTESYSTEM" });
        isHandled = true;
      }

      return isHandled ? true : false;
    };

    chrome.runtime.onMessage.addListener(messageListener);

    const port = chrome.runtime.connect({ name: ChannelNames.SidePanelPort });
    port.postMessage({ type: 'init' });
    port.onMessage.addListener((message) => {
        if (message.type === 'ADD_SELECTION_TO_NOTE') {
            console.log('[NoteSystemView] Handling ADD_SELECTION_TO_NOTE via port');
            const newContent = noteContent ? `${noteContent}\n\n${message.payload}` : message.payload;
            if (isCreateModalOpen) {
                setNoteContent(newContent);
            } else {
                openCreateModal({ content: newContent, title: `Note with Selection` });
            }
            toast.success("Selection added to note draft.");
        }
    });

    return () => {
      console.log('[NoteSystemView] Cleaning up listeners.');
      chrome.runtime.onMessage.removeListener(messageListener);
      port.disconnect();
    };
  }, [isCreateModalOpen, noteContent, openCreateModal]);

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
          url: dataToSave.url,
        };

        try {
          await saveNoteInSystem(noteToSave);
          toast.success("Page added to notes!");
          await fetchNotes();
        } catch (error) {
          console.error("[NoteSystemView] Error auto-saving note:", error);
          toast.error("Failed to auto-save note.");
        }
      }
    };
    autoSaveNote();
  }, [pendingPageData, fetchNotes]);

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

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    if (files.length === 0) return;

    let importSuccessCount = 0;
    let importErrorCount = 0;

    const readFileAsArrayBuffer = (inputFile: File): Promise<ArrayBuffer> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(inputFile);
      });
    };

    const readFileAsText = (inputFile: File): Promise<string> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(inputFile);
      });
    };

    for (const file of files) {
      try {
        const fileType = file.name.split('.').pop()?.toLowerCase();
        let defaultTitleFromFile = file.name.replace(/\.[^/.]+$/, "");
        let rawContentFromFile = "";
        let potentialTitle = defaultTitleFromFile;

        if (fileType === 'pdf') {
          const arrayBuffer = await readFileAsArrayBuffer(file);
          const typedarray = new Uint8Array(arrayBuffer);
          const pdfDoc = await pdfjsLib.getDocument({ data: typedarray }).promise;
          let pdfText = "";
          for (let i = 1; i <= pdfDoc.numPages; i++) {
            const page = await pdfDoc.getPage(i);
            const textContent = await page.getTextContent();
            pdfText += textContent.items.map(item => {
              if ('str' in item) {
                return item.str;
              }
              return '';
            }).join(" ") + "\n";
          }
          rawContentFromFile = pdfText.trim();
        } else {
          rawContentFromFile = await readFileAsText(file); // This is the text content for HTML, MD, TXT
          if (fileType === 'html' || fileType === 'htm') {
            const parser = new DOMParser();
            const doc = parser.parseFromString(rawContentFromFile, 'text/html'); // Parse the raw HTML string
            
            let finalHtmlToConvert = doc.body.innerHTML; // Default to original body HTML

            try {
              if (typeof Defuddle === 'function') {
                const defuddleInstance = new Defuddle(doc, { markdown: false, url: file.name });
                const defuddleResult = defuddleInstance.parse();
                
                if (defuddleResult.content) {
                  finalHtmlToConvert = defuddleResult.content;
                }
                potentialTitle = defuddleResult.title || doc.title || potentialTitle;
                console.log(`[NoteSystemView] Defuddle processed HTML for: ${file.name}. Title: ${potentialTitle}`);
              } else {
                console.warn(`[NoteSystemView] Defuddle library not available for ${file.name}. Using raw HTML body.`);
                potentialTitle = doc.title || potentialTitle;
              }
            } catch (defuddleError) {
              console.error(`[NoteSystemView] Error using Defuddle for ${file.name}:`, defuddleError);
              potentialTitle = doc.title || potentialTitle;
            }
            
            rawContentFromFile = turndownService.turndown(finalHtmlToConvert);
          }
        }

        if (!rawContentFromFile.trim()) {
          toast.error(`Cannot import '${file.name}': Content is empty.`);
          importErrorCount++;
          continue; 
        }

        let noteTitleToSave = potentialTitle;
        let noteContentToSave = rawContentFromFile;
        let noteTagsToSave = ['imported'];
        let noteUrlToSave: string | undefined = undefined;

        if (fileType === 'md' || fileType === 'txt' || fileType === 'html' || fileType === 'htm') {
          const frontmatterRegex = /^---\s*([\s\S]*?)\s*---\s*([\s\S]*)$/;
          const match = frontmatterRegex.exec(rawContentFromFile);
          if (match) {
            const yamlString = match[1];
            const mainContent = match[2];
            try {
              const frontmatter = yaml.load(yamlString) as any;
              if (frontmatter && typeof frontmatter === 'object') {
                if (typeof frontmatter.title === 'string' && frontmatter.title.trim()) {
                  noteTitleToSave = frontmatter.title.trim();
                }
                if (Array.isArray(frontmatter.tags) && frontmatter.tags.every((tag: unknown): tag is string => typeof tag === 'string')) {
                  noteTagsToSave = frontmatter.tags.map((tag: string) => tag.trim()).filter((tag: string) => tag);
                } else if (typeof frontmatter.tags === 'string') {
                  noteTagsToSave = [frontmatter.tags.trim()].filter(tag => tag);
                }
                if (noteTagsToSave.length === 0) noteTagsToSave = ['imported'];
                if (typeof frontmatter.url === 'string' && frontmatter.url.trim()) {
                  noteUrlToSave = frontmatter.url.trim();
                }
                noteContentToSave = mainContent.trim();
              }
            } catch (yamlError) {
              console.warn(`Failed to parse YAML frontmatter for ${file.name}:`, yamlError);
            }
          }
        }

        if (!noteContentToSave.trim() && fileType !== 'pdf') {
          toast.error(`Cannot import '${file.name}': Main content empty after frontmatter.`);
          importErrorCount++;
          continue;
        }

        const newNote: Partial<Note> & { content: string } = {
          title: noteTitleToSave,
          content: noteContentToSave,
          tags: noteTagsToSave,
          url: noteUrlToSave,
        };

        await saveNoteInSystem(newNote);
        toast.success(`Note imported: ${file.name}`);
        importSuccessCount++;

      } catch (error) {
        console.error(`Error importing note ${file.name}:`, error);
        let errorMessage = `Failed to import ${file.name}.`;
        if (error instanceof Error && error.message) {
            errorMessage += ` Reason: ${error.message}`;
        }
        toast.error(errorMessage);
        importErrorCount++;
      }
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    if (importSuccessCount > 0) {
      await fetchNotes();
    }
    
    if (files.length > 1) {
        if (importSuccessCount === files.length) {
            toast.success(`All ${files.length} notes imported successfully!`);
        } else if (importErrorCount === files.length) {
            toast.error(`Failed to import any of the ${files.length} notes.`);
        } else {
            toast.loading(`Imported ${importSuccessCount} of ${files.length} notes. See other notifications for details.`, { duration: 4000 });
        }
    }
  };

  const filteredNotes = useMemo(() => {
    if (!searchQuery) return allNotes;
    const lowerCaseQuery = searchQuery.toLowerCase();
    return allNotes.filter(note => {
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
      url: editingNote?.url,

    };
      await saveNoteInSystem(noteToSave);
      toast.success(editingNote ? "Note updated!" : "Note created!");
      await fetchNotes();
      setIsCreateModalOpen(false);
      setEditingNote(null);
      setNoteTitle(''); setNoteContent(''); setNoteTags('');
  };

  const openEditModal = (note: Note) => {
    const newNoteTags = note.tags ? note.tags.join(', ') : '';
    setEditingNote(note);
    setNoteTitle(note.title);
    setNoteContent(note.content);
    setNoteTags(newNoteTags);
    setIsCreateModalOpen(true);
  };

  const handleDeleteNote = async (noteId: string) => {
    await deleteNoteFromSystem(noteId);
    toast.success("Note deleted!");
    fetchNotes();
  };

  return (
    <div className="flex flex-col h-full text-[var(--text)]">
      <input
        data-testid="hidden-file-input"
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={handleFileSelected}
        accept=".txt,.md,.html,.htm,.pdf"
        multiple
      />
      <div className="p-0">
        <div className="relative">
          <Input
            type="text"
            placeholder="Search notes (titles & content & tags)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn(
              "w-full bg-background text-foreground placeholder:text-muted-foreground font-['Space_Mono',_monospace] pl-10 border-none rounded-none",
            )}
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
              <div
                key={note.id}
                className="px-2 border-b border-[var(--text)]/10 rounded-none hover:shadow-lg transition-shadow w-full"
              >
                <HoverCard openDelay={200} closeDelay={100}>
                  <div className="flex justify-between overflow-hidden items-center">
                    <HoverCardTrigger asChild>
                      <h3 className="flex-1 min-w-0 font-semibold text-md cursor-pointer hover:underline">{note.title}</h3>
                    </HoverCardTrigger>
                    <div className="flex-shrink-0">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <LuEllipsis />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-30 bg-[var(--popover)] border-[var(--text)]/10 text-[var(--popover-foreground)] mr-1 p-1 space-y-1 shadow-md">
                          <Button
                            variant="ghost"                            
                            className="w-full justify-start text-md h-8 px-2 font-normal"
                            onClick={() => openEditModal(note)}
                          >
                            <GoPencil className="mr-2 size-4" />
                            Edit
                          </Button>
                          <Button
                            variant="ghost"                            
                            className="w-full justify-start text-md h-8 px-2 font-normal"
                            onClick={() => {
                              let mdContent = '---\n';
                              mdContent += `title: ${note.title}\n`;
                              const dateTimestamp = note.lastUpdatedAt || note.createdAt;
                              if (dateTimestamp) {
                                const formattedDate = new Date(dateTimestamp).toISOString().split('T')[0];
                                mdContent += `date: ${formattedDate}\n`;
                              }
                              if (note.tags && note.tags.length > 0) {
                                mdContent += 'tags:\n';
                                note.tags.forEach(tag => {
                                  mdContent += `  - ${tag.trim()}\n`;
                                });
                              }
                              if (note.url) {
                                mdContent += `url: ${note.url}\n`;
                              }
                              mdContent += '---\n\n';
                              mdContent += note.content;
                              const element = document.createElement('a');
                              element.setAttribute('href', `data:text/markdown;charset=utf-8,${encodeURIComponent(mdContent)}`);
                              element.setAttribute('download', `${note.title}.md`);
                              element.style.display = 'none';
                              document.body.appendChild(element);
                              element.click();
                              document.body.removeChild(element);
                            }}
                          >
                            <GoDownload className="mr-2 size-4" />
                            ObsidianMD
                          </Button>
                          <Button
                            variant="ghost"
                            className="w-full justify-start text-md h-8 px-2 font-normal text-red-500 hover:text-red-500 hover:bg-red-500/10"
                            onClick={() => handleDeleteNote(note.id)}
                          >
                            <GoTrash className="mr-2 size-4" /> Delete </Button>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                  {/* Combined info line */}
                  <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)] mt-0.5 mb-1">
                    {note.lastUpdatedAt && (
                      <span className="mr-2">
                        Last updated: {new Date(note.lastUpdatedAt).toLocaleDateString()}
                      </span>
                    )}
                    {note.url && (
                      <a href={note.url} target="_blank" rel="noopener noreferrer" className="text-[var(--link)] hover:underline mr-2 truncate max-w-[30%]">
                        Link
                      </a>
                    )}
                    {note.tags && note.tags.length > 0 ? (
                      <span className="truncate max-w-[40%] tag-span">
                        Tags: {note.tags.join(', ')}
                      </span>
                    ) : (
                      <p className="text-xs text-[var(--muted-foreground)]">No tags</p>
                    )}
                  </div>
                  <HoverCardContent
                    className={cn(
                      "bg-[var(--popover)] border-[var(--active)] text-[var(--popover-foreground)] markdown-body",
                      "w-[80vw] sm:w-[70vw] md:w-[50vw] lg:w-[40vw]",
                      "max-w-lg",
                      "max-h-[70vh]",
                      "overflow-y-auto thin-scrollbar"
                    )}
                    side="top"
                    align="start"
                  >
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold">{note.title}</h4>
                      <p className="text-xs text-[var(--muted-foreground)]">
                        Date: {new Date(note.lastUpdatedAt).toLocaleString()}
                      </p>
                      <div className="text-sm whitespace-pre-wrap break-words">
                        <Markdown remarkPlugins={[remarkGfm]} components={noteSystemMarkdownComponents}>
                          {note.content}
                        </Markdown>
                      </div>
                      {note.tags && note.tags.length > 0 ? (
                        <div className="border-t border-[var(--border)] pt-2 mt-2">
                          <p className="text-xs font-semibold text-[var(--text)] mb-1">Tags:</p>
                          <div className="flex flex-wrap gap-1">
                            {note.tags.map(tag => (
                              <span key={tag} className="text-xs bg-[var(--muted)] text-[var(--muted-foreground)] px-2 py-0.5 rounded">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </HoverCardContent>
                </HoverCard>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {totalPages > 1 && (
        <div className="flex justify-center items-center h-10 space-x-2 p-2 font-['Space_Mono',_monospace]">
          <Button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            variant="ghost"
            className="font-['Space_Mono',_monospace]"
          >Prev</Button>
          <span className="text-md">Page {currentPage} of {totalPages}</span>
          <Button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            variant="ghost"
            className="font-['Space_Mono',_monospace]"
          >Next</Button>
        </div>
      )}

      <Dialog open={isCreateModalOpen} onOpenChange={(isOpen) => {
        if (!isOpen) {
          setIsCreateModalOpen(false);
          setEditingNote(null);
          setNoteTitle('');
          setNoteContent('');
          setNoteTags('');
        } else {
          setIsCreateModalOpen(true);
        }
      }}>
        <DialogContent 
          className={cn(
            "bg-[var(--bg)] border-[var(--text)]/10 w-[90vw] max-w-3xl text-[var(--text)] overflow-hidden",
            "flex flex-col max-h-[85vh]",
            "p-6"
          )}
        >
          <DialogHeader>
            <DialogTitle>{editingNote ? 'Edit Note' : 'Create New Note'}</DialogTitle>
            <DialogDescription className="text-[var(--text)]/80 pt-1">
              {editingNote ? 'Update the title or content of your note.' : 'Provide a title (optional) and content for your new note.'}
            </DialogDescription>
          </DialogHeader>

          {/* Main content area: Title, scrollable Textarea, Tags */}
          <div className="flex-1 flex flex-col min-h-0 space-y-4">
            <div>
            <Input
              placeholder="Note Title (optional)"
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              className="bg-[var(--input-bg)] border-[var(--text)]/10 text-[var(--text)]"
            />
            </div>

            <div className="flex-1 overflow-y-auto thin-scrollbar min-h-0">
            <Textarea
              placeholder="Your note content..."
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              autosize
              minRows={5}
              className="w-full bg-[var(--input-bg)] border-[var(--text)]/10 text-[var(--text)] resize-none overflow-hidden"
            />
            </div>

            <div>
            <Input
              placeholder="Tags (comma-separated)"
              value={noteTags}
              onChange={(e) => {
                setNoteTags(e.target.value);
              }}
              className="bg-[var(--input-bg)] border-[var(--text)]/10 text-[var(--text)]"
            />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsCreateModalOpen(false); setEditingNote(null); }}>Cancel</Button>
            <Button onClick={handleSaveNote} className="bg-[var(--active)] text-[var(--active-foreground)] hover:bg-[var(--active)]/90">
              {editingNote ? 'Save Changes' : 'Create Note'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};