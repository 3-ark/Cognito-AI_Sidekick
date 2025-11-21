import localforage from 'localforage';

const PARENT_TO_CHUNK_INDEX_KEY = 'parent_to_chunk_index_v1';

type ChunkIndex = Record<string, string[]>;

let indexCache: ChunkIndex | null = null;

export const getChunkIndex = async (): Promise<ChunkIndex> => {
  if (indexCache) {
    return indexCache;
  }
  const index = await localforage.getItem<ChunkIndex>(PARENT_TO_CHUNK_INDEX_KEY);
  indexCache = index || {};
  return indexCache as ChunkIndex;
};

export const saveChunkIndex = async (index: ChunkIndex): Promise<void> => {
  indexCache = index;
  await localforage.setItem(PARENT_TO_CHUNK_INDEX_KEY, index);
};

export const getChunksForParent = async (parentId: string): Promise<string[]> => {
  const index = await getChunkIndex();
  return index[parentId] || [];
};

export const setChunksForParent = async (parentId: string, chunkIds: string[]): Promise<void> => {
  const index = await getChunkIndex();
  index[parentId] = chunkIds;
  await saveChunkIndex(index);
  console.log(`[ChunkIndex] Set ${chunkIds.length} chunks for parent ${parentId}`);
};

export const removeParentFromIndex = async (parentId: string): Promise<void> => {
  const index = await getChunkIndex();
  if (index[parentId]) {
    delete index[parentId];
    await saveChunkIndex(index);
    console.log(`[ChunkIndex] Removed parent ${parentId} from chunk index.`);
  }
};

export const isChunkIndexBuilt = async (): Promise<boolean> => {
  const index = await localforage.getItem(PARENT_TO_CHUNK_INDEX_KEY);
  return index !== null;
};

export const rebuildChunkIndex = async (): Promise<void> => {
    console.log('[ChunkIndex] Rebuilding parent-to-chunk index...');
    const allKeys = await localforage.keys();
    const chunkKeys = allKeys.filter(key => key.includes('chunk_'));
    const newIndex: ChunkIndex = {};

    for (const key of chunkKeys) {
        const chunk = await localforage.getItem<{ parentId: string }>(key);
        if (chunk && chunk.parentId) {
            if (!newIndex[chunk.parentId]) {
                newIndex[chunk.parentId] = [];
            }
            newIndex[chunk.parentId].push(key);
        }
    }

    await saveChunkIndex(newIndex);
    console.log(`[ChunkIndex] Rebuilt index. Found ${Object.keys(newIndex).length} parents.`);
};
