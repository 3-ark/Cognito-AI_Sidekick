import React from 'react';

import { ScrollArea } from '../../components/ui/scroll-area';
import type { HydratedChunkSearchResultItem } from '../background/searchUtils';

interface SearchResultsViewProps {
  results: HydratedChunkSearchResultItem[];
  onResultClick: (result: HydratedChunkSearchResultItem) => void;
}

const SearchResultsView: React.FC<SearchResultsViewProps> = ({ results, onResultClick }) => {
  if (results.length === 0) {
    return <div className="text-center text-gray-400 py-4">No results found.</div>;
  }

  return (
    <ScrollArea className="h-full w-full">
      <div className="p-4">
        <h2 className="text-lg font-semibold mb-2">Search Results</h2>
        <ul>
          {results.map(result => (
            <li
              key={result.id}
              className="mb-4 p-3 border rounded-lg cursor-pointer hover:brightness-95 transition-colors"
              onClick={() => onResultClick(result)}
            >
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm font-medium text-text">
                  {result.parentTitle || 'Untitled'}
                </span>
                <span className="text-xs text-(--link)">Score: {result.score.toFixed(2)}</span>
              </div>
              {result.originalDescription && (
                <p className="text-xs text-muted-foreground mb-2 italic">{result.originalDescription}</p>
              )}
              {result.originalTags && result.originalTags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {result.originalTags.map(tag => (
                    <span key={tag} className="text-xs bg-(--link)/20 text-text px-2 py-0.5 rounded-full">{tag}</span>
                  ))}
                </div>
              )}
              <p className="text-sm text-text break-all">{result.content}</p>
            </li>
          ))}
        </ul>
      </div>
    </ScrollArea>
  );
};

export default SearchResultsView;
