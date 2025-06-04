import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { GoTrash, GoPencil, GoSearch } from "react-icons/go";
import { toast } from 'react-hot-toast';
import { Note } from '../types/noteTypes';
import { getAllNotesFromSystem, saveNoteInSystem, deleteNoteFromSystem, deleteAllNotesFromSystem } from '../background/noteStorage';
import { cn } from '@/src/background/util';
import { useConfig } from './ConfigContext';

interface NoteSystemViewProps {
  triggerOpenCreateModal: boolean;
  onModalOpened: () => void;
}

const ITEMS_PER_PAGE = 8; // Number of notes to display per page

export const NoteSystemView: React.FC<NoteSystemViewProps> = ({ triggerOpenCreateModal, onModalOpened }) => {
  const [allNotes, setAllNotes] = useState<Note[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');

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
    return allNotes.filter(note =>
      note.title.toLowerCase().includes(lowerCaseQuery) ||
      note.content.toLowerCase().includes(lowerCaseQuery)
    );
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
    const noteToSave: Partial<Note> & { content: string } = {
      id: editingNote?.id,
      title: noteTitle.trim() || `Note - ${new Date().toLocaleDateString()}`,
      content: noteContent,
    };
    await saveNoteInSystem(noteToSave);
    toast.success(editingNote ? "Note updated!" : "Note created!");
    fetchNotes();
    setIsCreateModalOpen(false);
    setEditingNote(null);
    setNoteTitle('');
    setNoteContent('');
  };

  const openEditModal = (note: Note) => {
    setEditingNote(note);
    setNoteTitle(note.title);
    setNoteContent(note.content);
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
                className="px-2 border-b border-[var(--text)]/20 rounded-none hover:shadow-lg transition-shadow w-full"
              >
                <div className="flex justify-between items-center">
                  <h3 className="font-semibold text-md truncate">{note.title}</h3>
                  <div className="space-x-1">
                    <Button variant="ghost" size="sm" onClick={() => openEditModal(note)}><GoPencil /></Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteNote(note.id)} className="hover:text-red-500"><GoTrash /></Button>
                  </div>
                </div>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Last updated: {new Date(note.lastUpdatedAt).toLocaleDateString()}
                </p>
                <p className="text-sm mt-1 line-clamp-1">{note.content}</p>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {totalPages > 1 && (
        <div className="p-2 border-t border-[var(--border)] flex justify-center items-center space-x-2">
          <Button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>Prev</Button>
          <span>Page {currentPage} of {totalPages}</span>
          <Button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>Next</Button>
        </div>
      )}

      <Dialog open={isCreateModalOpen} onOpenChange={(isOpen) => {
        if (!isOpen) {
          setIsCreateModalOpen(false);
          setEditingNote(null);
        } else {
          setIsCreateModalOpen(true);
        }
      }}>
        <DialogContent className="bg-[var(--bg)] border-[var(--border)] text-[var(--text)]">
          <DialogHeader>
            <DialogTitle>{editingNote ? 'Edit Note' : 'Create New Note'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Input
              placeholder="Note Title (optional)"
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              className="bg-[var(--input-bg)] border-[var(--border)]"
            />
            <Textarea
              placeholder="Your note content..."
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              className="min-h-[200px] bg-[var(--input-bg)] border-[var(--border)]"
              rows={10}
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