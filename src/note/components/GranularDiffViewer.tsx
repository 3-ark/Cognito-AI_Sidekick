import React, {
 forwardRef,useEffect, useImperativeHandle, useState, 
} from 'react';
import { Change, diffLines, diffWords } from 'diff';

import { Button } from '@/components/ui/button';
import { cn } from '@/src/background/util';

type DiffChunk = Change;

interface Hunk {
  id: number;
  diffs: DiffChunk[];
  displayDiffs: DiffChunk[]; // The diffs to show the user
  status: 'pending' | 'accepted' | 'declined';
}

interface GranularDiffViewerProps {
  oldValue: string;
  newValue: string;
  onChange: (reconstructedValue: string) => void;
}

export interface GranularDiffViewerRef {
  acceptAll: () => void;
  declineAll: () => void;
  getFinalText: () => string;
}

// Function to parse raw diffs into a structured list of hunks and equal parts
const processDiffs = (diffs: DiffChunk[]): (DiffChunk | Hunk)[] => {
  const result: (DiffChunk | Hunk)[] = [];
  let currentHunkDiffs: DiffChunk[] = [];
  let hunkIdCounter = 0;

  const flushHunk = () => {
    if (currentHunkDiffs.length === 0) {
      return;
    }

    const addedParts = currentHunkDiffs.filter(d => d.added);
    const removedParts = currentHunkDiffs.filter(d => d.removed);

    let displayDiffs: DiffChunk[];

    // If hunk contains both additions and removals, it's a "change"
    if (addedParts.length > 0 && removedParts.length > 0) {
      const oldText = removedParts.map(d => d.value).join('');
      const newText = addedParts.map(d => d.value).join('');
      displayDiffs = diffWords(oldText, newText);
    } else {
      // Otherwise, it's a pure addition or deletion, display as is.
      displayDiffs = currentHunkDiffs;
    }

    result.push({
      id: hunkIdCounter++,
      diffs: currentHunkDiffs,
      displayDiffs,
      status: 'pending',
    });

    currentHunkDiffs = [];
  };

  diffs.forEach(diff => {
    if (diff.added || diff.removed) {
      currentHunkDiffs.push(diff);
    } else {
      flushHunk();
      result.push(diff); // Push the unchanged part
    }
  });

  flushHunk(); // Flush any remaining hunk

  return result;
};

const reconstructContentFromItems = (items: (DiffChunk | Hunk)[]): string => {
  const contentParts: string[] = [];

  items.forEach(item => {
    if ('id' in item) { // It's a Hunk
      if (item.status === 'accepted') {
        item.diffs.forEach(diff => {
          if (!diff.removed) {
            contentParts.push(diff.value);
          }
        });
      } else { // 'pending' or 'declined'
        item.diffs.forEach(diff => {
          if (!diff.added) {
            contentParts.push(diff.value);
          }
        });
      }
    } else { // It's an EQUAL DiffChunk
      contentParts.push(item.value);
    }
  });

  return contentParts.join('');
};

export const GranularDiffViewer = forwardRef<GranularDiffViewerRef, GranularDiffViewerProps>(({
  oldValue,
  newValue,
  onChange,
}, ref) => {
  const [processedItems, setProcessedItems] = useState<(DiffChunk | Hunk)[]>([]);

  useEffect(() => {
    const diffs = diffLines(oldValue, newValue);
    const processed = processDiffs(diffs);

    setProcessedItems(processed);
  }, [oldValue, newValue]);

  useEffect(() => {
    if (!processedItems.length) return;

    onChange(reconstructContentFromItems(processedItems));
  }, [processedItems, onChange]);

  const handleHunkStatusChange = (hunkId: number, newStatus: Hunk['status']) => {
    setProcessedItems(currentItems =>
      currentItems.map(item =>
        ('id' in item && item.id === hunkId) ? { ...item, status: newStatus } : item,
      ),
    );
  };

  useImperativeHandle(ref, () => ({
    acceptAll: () => {
      setProcessedItems(currentItems =>
        currentItems.map(item =>
          ('id' in item) ? { ...item, status: 'accepted' } : item,
        ),
      );
    },
    declineAll: () => {
      setProcessedItems(currentItems =>
        currentItems.map(item =>
          ('id' in item) ? { ...item, status: 'declined' } : item,
        ),
      );
    },
    getFinalText: (): string => {
      const finalItems = processedItems.map((item): DiffChunk | Hunk => {
        if ('id' in item && item.status === 'pending') {
          return { ...item, status: 'accepted' };
        }

        return item;
      });

      return reconstructContentFromItems(finalItems);
    },
  }));

  const renderDiffChunk = (diff: DiffChunk, key: React.Key) => {
    const {
 value, added, removed, 
} = diff;

    if (added) {
      return <ins key={key} className="bg-green-200 dark:bg-green-900 text-black dark:text-white">{value}</ins>;
    }

    if (removed) {
      return <del key={key} className="bg-red-200 dark:bg-red-900 text-black dark:text-white">{value}</del>;
    }

    return <span key={key}>{value}</span>;
  };

  const renderHunk = (hunk: Hunk) => {
    const {
 id, displayDiffs, status,
} = hunk;

    return (
      <div
        key={id}
        className={cn(
          "hunk border-2 rounded-md my-2 p-2 relative",
          status === 'pending' && 'border-blue-500',
          status === 'accepted' && 'border-green-500 bg-green-500/10',
          status === 'declined' && 'border-red-500 bg-red-500/10 opacity-70',
        )}
      >
        <div className="hunk-content">
          {displayDiffs.map((diff, index) => renderDiffChunk(diff, `${id}-${index}`))}
        </div>
        <div className="hunk-controls absolute top-1 right-1 flex gap-1">
          <Button className="bg-green-500 hover:bg-green-600 text-white px-2" disabled={status === 'accepted'} size="sm" variant="outline" onClick={() => handleHunkStatusChange(id, 'accepted')}>Accept</Button>
          <Button className="bg-red-500 hover:bg-red-600 text-white px-2" disabled={status === 'declined'} size="sm" variant="outline" onClick={() => handleHunkStatusChange(id, 'declined')}>Decline</Button>
        </div>
      </div>
    );
  };

  return (
    <div className="granular-diff-viewer p-4 border rounded-md bg-background text-foreground whitespace-pre-wrap font-sans-serif">
      {processedItems.map((item, index) => {
        if ('id' in item) return renderHunk(item);

        return renderDiffChunk(item, index);
      })}
    </div>
  );
});

GranularDiffViewer.displayName = 'GranularDiffViewer';
