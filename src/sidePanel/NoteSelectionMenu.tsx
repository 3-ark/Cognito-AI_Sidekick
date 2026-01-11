import React from 'react';

import { Note } from '../types/noteTypes';

interface NoteSelectionMenuProps {
  notes: Note[];
  onSelectNote: (note: Note) => void;
  selectedIndex: number;
  isOpen: boolean;
}

const NoteSelectionMenu: React.FC<NoteSelectionMenuProps> = ({
  notes,
  onSelectNote,
  selectedIndex,
  isOpen,
}) => {
  if (!isOpen) {
    return null;
  }

  if (notes.length === 0) {
    return (
      <div 
        className="border border-(--text)/20 rounded-md thin-scrollbar mb-1 p-2 text-center text-[var(--text-muted)] bg-[var(--card,var(--bg-secondary))] shadow-md"
      >
        No notes found.
      </div>
    );
  }

  return (
    <div 
      className="border border-(--text)/20 rounded-md mb-1 thin-scrollbar max-h-40 overflow-y-auto bg-[var(--card,var(--bg-secondary))] shadow-md"
    >
      {notes.map((note, index) => (
        <div
          key={note.id}
          className={`p-2 cursor-pointer text-(--text) ${
            index === selectedIndex ? 'bg-(--active)/30' : 'hover:bg-(--active)/20'
          }`}
          onClick={() => onSelectNote(note)}
        >
          {note.title}
        </div>
      ))}
    </div>
  );
};

export default NoteSelectionMenu;
