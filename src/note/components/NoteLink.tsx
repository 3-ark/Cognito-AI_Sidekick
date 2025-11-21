import React, { useState } from 'react';
import Markdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

import { markdownComponents } from '@/components/MarkdownComponents';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import ChannelNames from '@/src/types/ChannelNames';
import { Note } from '@/src/types/noteTypes';

interface NoteLinkProps {
  href: string; // This will be the note title
  children: React.ReactNode;
}

const NoteLink: React.FC<NoteLinkProps> = ({ href, children }) => {
  const [note, setNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchNote = () => {
    if (!href || note) return;

    setLoading(true);
    chrome.runtime.sendMessage({ type: ChannelNames.GET_ALL_NOTES_REQUEST }, response => {
      if (response.success && response.notes) {
        const foundNote = response.notes.find((n: Note) => n.title === href);
        if (foundNote) {
          setNote(foundNote);
        }
      } else {
        console.error(response.error);
      }
      setLoading(false);
    });
  };

  return (
    <HoverCard openDelay={200} onOpenChange={(open) => open && fetchNote()}>
      <HoverCardTrigger asChild>
        <a className="text-[var(--link)] hover:underline cursor-pointer">{children}</a>
      </HoverCardTrigger>
      <HoverCardContent className="w-80">
        {loading && <p>Loading...</p>}
        {note && (
          <div>
            <h4 className="font-semibold">{note.title}</h4>
            <hr className="my-2" />
            <div className="markdown-body-in-hovercard" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                <Markdown
                    components={markdownComponents}
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                >
                    {note.content}
                </Markdown>
            </div>
          </div>
        )}
        {!loading && !note && <p>Note not found.</p>}
      </HoverCardContent>
    </HoverCard>
  );
};

export default NoteLink;
