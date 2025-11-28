import localforage from 'localforage';

import { ChatMessageInputForChunking,NoteInputForChunking } from '../types/chunkTypes';
import { RagConfig } from '../types/config';

import { getAllConversations, getChatMessagesForConversation } from './chatHistoryStorage';
import { chunkChatMessage,chunkNote } from './chunkingUtils';
import { getEmbedding } from './embeddingUtils';
import { getAllNotesFromSystem } from './noteStorage';
import { rebuildChunkIndex, getChunkIndex, setChunksForParent, saveChunkIndex } from './chunkIndex';

import { getStoredAppSettings } from './storageUtil';

const DEFAULT_RAG_CONFIG: RagConfig = {
  model: "text-embedding-3-small",
  use_gpu: true,
  semantic_top_k: 20,
  similarity_threshold: 0.3,
  BM25_top_k: 50,
  k: 1.2,
  b: 0.75,
  d: 0.5,
  bm25_weight: 0.5,
  autoEmbedOnSave: true,
  final_top_k: 10,
  maxChunkChars: 2000,
  minChunkChars: 150,
  overlapChars: 50,
  lambda: 0.5,
};

export const buildAllEmbeddings = async (): Promise<void> => {
  console.log('Building all embeddings...');

  try {
    // 1. Clear all existing chunks
    const keys = await localforage.keys();
    const chunkKeys = keys.filter(key => key.startsWith('chunk_'));
    for (const key of chunkKeys) {
      await localforage.removeItem(key);
    }
    console.log(`Cleared ${chunkKeys.length} existing chunks.`);

    // 2. Gather all content sources
    const notes = await getAllNotesFromSystem();
    const conversations = await getAllConversations();
    const totalItems = notes.length + conversations.length;

    if (totalItems === 0) {
      console.log('No content to embed.');
      chrome.runtime.sendMessage({ type: 'EMBEDDING_END' });
      return;
    }

    const appSettings = await getStoredAppSettings();
    const ragConfig = appSettings?.ragConfig ?? DEFAULT_RAG_CONFIG;

    // 3. Send START message and process items
    chrome.runtime.sendMessage({ type: 'EMBEDDING_START', data: { total: totalItems } });
    let processedItems = 0;
    let totalSummariesGenerated = 0;
    let notesWithSummaries = 0;

    // 4. Process notes one by one
    for (const note of notes) {
      console.log(`Processing note: ${note.id} - ${note.title}`);
      try {
        const noteInput: NoteInputForChunking = {
          id: note.id,
          content: note.content,
          title: note.title,
          url: note.url,
          description: note.description,
          tags: note.tags,
          lastUpdatedAt: note.contentLastUpdatedAt || note.lastUpdatedAt,
        };
        const { chunks, summariesGenerated } = await chunkNote(noteInput, ragConfig);

        if (summariesGenerated > 0) {
          notesWithSummaries++;
        }
        totalSummariesGenerated += summariesGenerated;

        for (const chunk of chunks) {
          // For embedding, combine the summary and content to create a more context-rich vector.
          const textForEmbedding = (chunk.summary ? `Summary: ${chunk.summary}\n\n---\n\n` : '') + chunk.content;
          chunk.embedding = await getEmbedding(textForEmbedding);
          await localforage.setItem(chunk.id, chunk);
        }
        console.log(`-> Generated and embedded ${chunks.length} chunks for note ${note.id}. Summaries: ${summariesGenerated}`);
      } catch (error) {
        console.error(`Failed to process note ${note.id}:`, error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        chrome.runtime.sendMessage({
          type: 'SHOW_ERROR_TOAST',
          payload: `Failed to process note "${note.title}": ${errorMessage}`,
        });
      } finally {
        processedItems++;
        chrome.runtime.sendMessage({ type: 'EMBEDDING_PROGRESS', data: { processed: processedItems, total: totalItems } });
      }
    }

    // 5. Process conversations one by one
    for (const conversation of conversations) {
      console.log(`Processing conversation: ${conversation.id} - ${conversation.title}`);
      try {
        const messages = await getChatMessagesForConversation(conversation.id);
        const turns = groupMessagesIntoTurns(messages);

        for (const turn of turns) {
          const content = turn.map(m => m.content).join('\n\n');
          const assistantMessage = turn[turn.length - 1];
          const messageInput: ChatMessageInputForChunking = {
            id: assistantMessage.id,
            conversationId: assistantMessage.conversationId,
            content: content,
            role: assistantMessage.role,
            timestamp: assistantMessage.timestamp,
            parentTitle: conversation.title,
            lastUpdatedAt: conversation.lastUpdatedAt,
            messageLastUpdatedAt: assistantMessage.lastUpdatedAt,
          };
          const chatChunks = chunkChatMessage(messageInput); // This is synchronous

          for (const chunk of chatChunks) {
            chunk.embedding = await getEmbedding(chunk.content);
            await localforage.setItem(chunk.id, chunk);
          }
        }
         console.log(`-> Processed and embedded conversation ${conversation.id}.`);
      } catch (error) {
        console.error(`Failed to process conversation ${conversation.id}:`, error);
      } finally {
        processedItems++;
        chrome.runtime.sendMessage({ type: 'EMBEDDING_PROGRESS', data: { processed: processedItems, total: totalItems } });
      }
    }

    // 6. Rebuild the parent-to-chunk index and finalize
    await rebuildChunkIndex();
    await localforage.setItem('embedding_stats_last_updated', Date.now());

    let successMessage = 'Embedding rebuild complete.';
    if (ragConfig.useContextualSummaries && notesWithSummaries > 0) {
      successMessage = `Rebuild complete. Contextual summaries generated for ${notesWithSummaries} of ${notes.length} notes.`;
    }
    chrome.runtime.sendMessage({ type: 'SHOW_SUCCESS_TOAST', payload: successMessage });

  } catch (error) {
    console.error('An error occurred during buildAllEmbeddings:', error);
    chrome.runtime.sendMessage({ type: 'EMBEDDING_ERROR', data: { error: 'Failed to gather content for embedding.' } });
  } finally {
    // 7. Send END message
    chrome.runtime.sendMessage({ type: 'EMBEDDING_END' });
    console.log('Finished building all embeddings.');
  }
};

import { NoteChunk } from '../types/chunkTypes';
import { MessageTurn } from '../types/chatTypes';

export const updateEmbeddings = async (): Promise<void> => {
  console.log('Updating and pruning embeddings...');
  chrome.runtime.sendMessage({ type: 'EMBEDDING_START', data: { total: 0, message: 'Gathering content...' } });

  try {
    const index = await getChunkIndex();
    const appSettings = await getStoredAppSettings();
    const ragConfig = appSettings?.ragConfig ?? DEFAULT_RAG_CONFIG;

    // 1. Gather all current content and build a set of valid parent IDs
    const notes = await getAllNotesFromSystem();
    const conversations = await getAllConversations();
    const allTurns = [];
    for (const conversation of conversations) {
        const messages = await getChatMessagesForConversation(conversation.id);
        const turns = groupMessagesIntoTurns(messages);
        allTurns.push(...turns);
    }
    const validParentIds = new Set([...notes.map(n => n.id), ...allTurns.map(t => t[t.length - 1].id)]);

    // 2. Pruning step: Remove chunks and index entries for deleted items
    const indexedParentIds = Object.keys(index);
    for (const indexedParentId of indexedParentIds) {
        if (!validParentIds.has(indexedParentId)) {
            console.log(`[Pruning] Removing orphaned parent: ${indexedParentId}`);
            const chunkIdsToDelete = index[indexedParentId] || [];
            for (const chunkId of chunkIdsToDelete) {
                await localforage.removeItem(chunkId);
            }
            delete index[indexedParentId];
        }
    }

    // 3. Update step: Find new and modified content
    const itemsToProcess = [];

    // Check notes for new or modified content
    for (const note of notes) {
        const isIndexed = index[note.id] && index[note.id].length > 0;
        if (!isIndexed) {
            itemsToProcess.push(note);
            continue;
        }

        const firstChunkId = index[note.id][0];
        const firstChunk = await localforage.getItem<NoteChunk>(firstChunkId);
        if (!firstChunk || firstChunk.parentLastUpdatedAt !== (note.contentLastUpdatedAt || note.lastUpdatedAt)) {
            itemsToProcess.push(note);
            // Clean up old chunks now, they will be re-generated
            for (const chunkId of index[note.id]) {
                await localforage.removeItem(chunkId);
            }
            index[note.id] = [];
        }
    }

    // Check chat turns for new or modified content
    for (const turn of allTurns) {
        const assistantMessage = turn[turn.length - 1];
        const conversation = conversations.find(c => c.id === assistantMessage.conversationId);
        if (!conversation) continue; // Should not happen

        const isIndexed = index[assistantMessage.id] && index[assistantMessage.id].length > 0;
        if (!isIndexed) {
            itemsToProcess.push({ turn, conversation });
            continue;
        }

        const firstChunkId = index[assistantMessage.id][0];
        const firstChunk = await localforage.getItem<NoteChunk>(firstChunkId);

        // If chunk is missing, or conversation updated, or message updated, re-process.
        if (
            !firstChunk ||
            firstChunk.parentLastUpdatedAt !== conversation.lastUpdatedAt ||
            (firstChunk.metadata &&
                firstChunk.metadata.messageLastUpdatedAt &&
                firstChunk.metadata.messageLastUpdatedAt !== assistantMessage.lastUpdatedAt)
        ) {
            itemsToProcess.push({ turn, conversation });
            // Clean up old chunks now, they will be re-generated
            for (const chunkId of index[assistantMessage.id]) {
                await localforage.removeItem(chunkId);
            }
            index[assistantMessage.id] = [];
        }
    }

    // 4. Process new and modified chunks
    if (itemsToProcess.length === 0) {
        console.log('No new or modified content to update.');
    } else {
        console.log(`Found ${itemsToProcess.length} new or modified items to process.`);
        chrome.runtime.sendMessage({ type: 'EMBEDDING_START', data: { total: itemsToProcess.length, message: `Embedding ${itemsToProcess.length} items...` } });

        let processedCount = 0;
        let totalSummariesGenerated = 0;
        let notesProcessedForSummaries = 0;

        for (const item of itemsToProcess) {
            try {
                let chunks: NoteChunk[] = [];
                if ('turn' in item) { // It's a { turn, conversation } object
                    const { turn, conversation } = item;
                    const assistantMessage = turn[turn.length - 1];
                    const messageInput: ChatMessageInputForChunking = {
                        id: assistantMessage.id,
                        conversationId: assistantMessage.conversationId,
                        content: turn.map(m => m.content).join('\n\n'),
                        role: assistantMessage.role,
                        timestamp: assistantMessage.timestamp,
                        parentTitle: conversation.title,
                        lastUpdatedAt: conversation.lastUpdatedAt, // Pass conversation's timestamp
                        messageLastUpdatedAt: assistantMessage.lastUpdatedAt, // Pass message's timestamp
                    };
                    chunks = chunkChatMessage(messageInput);
                } else { // It's a note
                    notesProcessedForSummaries++;
                    const noteInput: NoteInputForChunking = {
                        id: item.id,
                        content: item.content,
                        title: item.title,
                        url: item.url,
                        description: item.description,
                        tags: item.tags,
                        lastUpdatedAt: item.contentLastUpdatedAt || item.lastUpdatedAt,
                    };
                    const result = await chunkNote(noteInput, ragConfig);
                    chunks = result.chunks;
                    totalSummariesGenerated += result.summariesGenerated;
                }

                const chunkIds: string[] = [];
                for (const chunk of chunks) {
                    // For embedding, combine the summary and content to create a more context-rich vector.
                    const textForEmbedding = (chunk.summary ? `Summary: ${chunk.summary}\n\n---\n\n` : '') + chunk.content;
                    chunk.embedding = await getEmbedding(textForEmbedding);
                    await localforage.setItem(chunk.id, chunk);
                    chunkIds.push(chunk.id);
                }
                if (chunkIds.length > 0) {
                    index[chunks[0].parentId] = chunkIds;
                }
            } catch (error) {
                const title = 'turn' in item ? item.conversation.title : item.title;
                console.error(`Failed to process item "${title}":`, error);
                const errorMessage = error instanceof Error ? error.message : String(error);
                chrome.runtime.sendMessage({
                  type: 'SHOW_ERROR_TOAST',
                  payload: `Failed to process item "${title}": ${errorMessage}`,
                });
            } finally {
                processedCount++;
                chrome.runtime.sendMessage({ type: 'EMBEDDING_PROGRESS', data: { processed: processedCount, total: itemsToProcess.length } });
            }
        }

        let successMessage = 'Embedding update complete.';
        if (ragConfig.useContextualSummaries && notesProcessedForSummaries > 0) {
            successMessage = `Update complete. ${totalSummariesGenerated} contextual summaries generated for ${notesProcessedForSummaries} updated note(s).`;
        }
        chrome.runtime.sendMessage({ type: 'SHOW_SUCCESS_TOAST', payload: successMessage });
    }

    // 5. Finalize
    await saveChunkIndex(index);
    await localforage.setItem('embedding_stats_last_updated', Date.now());

  } catch (error) {
    console.error('An error occurred during updateEmbeddings:', error);
    chrome.runtime.sendMessage({ type: 'EMBEDDING_ERROR', data: { error: 'Failed to gather content for embedding.' } });
  } finally {
    chrome.runtime.sendMessage({ type: 'EMBEDDING_END' });
    console.log('Finished updating and pruning embeddings.');
  }
};

function groupMessagesIntoTurns(messages: MessageTurn[]): MessageTurn[][] {
  if (!messages || messages.length === 0) {
    return [];
  }

  const turns: MessageTurn[][] = [];
  let currentTurn: MessageTurn[] = [];

  for (const message of messages) {
    // If we see a user message and the current turn already has messages,
    // it means the previous turn is complete.
    if (message.role === 'user' && currentTurn.length > 0) {
      turns.push(currentTurn);
      currentTurn = [];
    }

    currentTurn.push(message);

    // An assistant message typically concludes a turn.
    if (message.role === 'assistant') {
      turns.push(currentTurn);
      currentTurn = [];
    }
  }

  // Don't forget to add the last turn if it's still holding messages
  // (e.g., a user message at the very end).
  if (currentTurn.length > 0) {
    turns.push(currentTurn);
  }

  return turns;
}
