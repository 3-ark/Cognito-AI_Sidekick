import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import Markdown from 'react-markdown';
// @ts-ignore
import changelog from '@/CHANGELOG.md?raw';

interface ChangelogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Changelog = ({ isOpen, onClose }: ChangelogProps) => {
  const [content, setContent] = useState('');

  useEffect(() => {
    setContent(changelog);
  }, []);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Changelog</DialogTitle>
          <DialogDescription>
            New features, improvements, and bug fixes in the latest version.
          </DialogDescription>
        </DialogHeader>
        <div className="prose dark:prose-invert max-h-[60vh] overflow-y-auto no-scrollbar markdown-body">
          <Markdown>{content}</Markdown>
        </div>
      </DialogContent>
    </Dialog>
  );
};