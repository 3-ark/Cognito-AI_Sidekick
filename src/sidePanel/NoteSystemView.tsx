import React, { useEffect, useState, useCallback, useMemo } from 'react';
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

interface NoteSystemViewProps {
  triggerOpenCreateModal: boolean;
  onModalOpened: () => void;
}

const ITEMS_PER_PAGE = 12; // Number of notes to display per page

export const NoteSystemView: React.FC<NoteSystemViewProps> = ({ triggerOpenCreateModal, onModalOpened }) => {
  const [allNotes, setAllNotes] = useState<Note[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteTags, setNoteTags] = useState('');

  const { config } = useConfig();

  const fetchNotes = useCallback(async () => {
    const notes = await getAllNotesFromSystem();
    setAllNotes(notes);
  }, []);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const openCreateModal = useCallback(() => {
    setEditingNote(null);
    setNoteTitle('');
    setNoteContent('');
    setNoteTags('');
    setIsCreateModalOpen(true);
  }, []);

  useEffect(() => {
    if (triggerOpenCreateModal) {
      openCreateModal();
      onModalOpened();
    }
  }, [triggerOpenCreateModal, onModalOpened, openCreateModal]);

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
    };
    await saveNoteInSystem(noteToSave);
    toast.success(editingNote ? "Note updated!" : "Note created!");
    fetchNotes();
    setIsCreateModalOpen(false);
    setEditingNote(null);
    setNoteTitle('');
    setNoteContent('');
    setNoteTags('');
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
      <div className="p-0">
        <div className="relative">
          <Input
            type="text"
            placeholder="Search notes (titles & content)..."
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
                  <div className="flex justify-between items-center">
                    <HoverCardTrigger asChild>
                      <h3 className="font-semibold text-md truncate cursor-pointer hover:underline">{note.title}</h3>
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

                              // Prefer lastUpdatedAt, fallback to createdAt for the date
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
                            variant="ghost"                            className="w-full justify-start text-md h-8 px-2 font-normal text-red-500 hover:text-red-500 hover:bg-red-500/10"
                            onClick={() => handleDeleteNote(note.id)}
                          >
                            <GoTrash className="mr-2 size-4" /> Delete </Button>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <p className="text-xs text-[var(--muted-foreground)]">
                      Last updated: {new Date(note.lastUpdatedAt).toLocaleDateString()}
                    </p>
                    {note.tags && note.tags.length > 0 ? (
                      <p className="text-xs text-[var(--muted-foreground)] truncate max-w-[50%]">
                        Tags: {note.tags.join(', ')}
                      </p>
                    ) : (
                      <p className="text-xs text-[var(--muted-foreground)]">No tags</p>
                    )}
                  </div>
                  <HoverCardContent className="w-80 bg-[var(--popover)] border-[var(--active)] text-[var(--popover-foreground)]" side="top" align="start" >
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold">{note.title}</h4>
                      <p className="text-xs text-[var(--muted-foreground)]">
                        Date: {new Date(note.lastUpdatedAt).toLocaleString()}
                      </p>
                      <p className="text-sm max-h-40 overflow-y-auto whitespace-pre-wrap break-words thin-scrollbar">
                        {note.content}
                      </p>
                      {note.tags && note.tags.length > 0 && (
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
                      )}
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
        <DialogContent className="bg-[var(--bg)] border-[var(--text)]/10  w-[80vw] text-[var(--text)]">
          <DialogHeader>
            <DialogTitle>{editingNote ? 'Edit Note' : 'Create New Note'}</DialogTitle>
            <DialogDescription className="text-[var(--text)]/80 pt-1">
              {editingNote ? 'Update the title or content of your note.' : 'Provide a title (optional) and content for your new note.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Input
              placeholder="Note Title (optional)"
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              className="bg-[var(--input-bg)] border-[var(--text)]/10"
            />
            <Textarea
              placeholder="Your note content..."
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              className="min-h-[30vh] max-h-[60vh] overflow-y-auto bg-[var(--input-bg)] border-[var(--text)]/10 resize-none thin-scrollbar"
            />
            <Input
              placeholder="Tags (comma-separated)"
              value={noteTags}
              onChange={(e) => {
                setNoteTags(e.target.value);
              }}
              className="bg-[var(--input-bg)] border-[var(--text)]/10"
            />
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