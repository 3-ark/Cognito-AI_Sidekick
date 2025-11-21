/// <reference types="vitest/globals" />
import { vi, describe, it, expect, beforeEach, afterEach, Mock } from "vitest";
import * as noteStorage from '../noteStorage';
import * as searchUtils from '../searchUtils';
import * as chatHistoryStorage from '../chatHistoryStorage';
import * as embeddingManager from '../embeddingManager';
import ChannelNames from '../../types/ChannelNames';

// Mock dependencies BEFORE importing the module under test
vi.mock('../util', () => ({
  getCurrentTab: vi.fn(),
  injectContentScript: vi.fn(),
}));
vi.mock('src/state/store', () => ({
  default: vi.fn(),
}));
vi.mock('../noteStorage');
vi.mock('../searchUtils');
vi.mock('../chatHistoryStorage');
vi.mock('../embeddingManager');

describe("Background Script (index.ts)", () => {
  let onMessageListener: (message: any, sender: any, sendResponse: (response: any) => void) => boolean | undefined;
  let mockSearchService: {
    searchItems: Mock;
    removeItemFromIndex: Mock;
    indexSingleNote: Mock;
    indexAllFullRebuild: Mock;
  };

  beforeEach(async () => {
    vi.resetModules(); // Reset modules to get fresh mocks for each test
    vi.clearAllMocks();

    const mockAddListener = vi.fn((listener) => {
      onMessageListener = listener;
    });

    // Setup a comprehensive mock for the chrome API
    global.chrome = {
      runtime: {
        onInstalled: { addListener: vi.fn() },
        onMessage: { addListener: mockAddListener },
        onConnect: { addListener: vi.fn() },
        sendMessage: vi.fn(),
        lastError: null,
      },
      contextMenus: { create: vi.fn(), update: vi.fn(), remove: vi.fn(), onClicked: { addListener: vi.fn() } },
      sidePanel: { setPanelBehavior: vi.fn().mockResolvedValue(undefined) },
      tabs: { onActivated: { addListener: vi.fn() }, onUpdated: { addListener: vi.fn() } },
      downloads: { download: vi.fn() },
      commands: { onCommand: { addListener: vi.fn() } }
    } as any;

    // Mock the search service singleton
    mockSearchService = {
      searchItems: vi.fn(),
      removeItemFromIndex: vi.fn(),
      indexSingleNote: vi.fn(),
      indexAllFullRebuild: vi.fn(),
    };
    (searchUtils.getSearchService as Mock).mockResolvedValue(mockSearchService);


    // Dynamically import to apply mocks
    await import("../index");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should register a listener for chrome.runtime.onMessage", () => {
    expect(chrome.runtime.onMessage.addListener).toHaveBeenCalledTimes(1);
    expect(onMessageListener).toBeInstanceOf(Function);
  });

  it("should handle GET_ALL_NOTES_REQUEST and respond with notes", async () => {
    const mockNotes = [{ id: "1", title: "Test Note" }];
    (noteStorage.getAllNotesFromSystem as Mock).mockResolvedValue(mockNotes);
    const sendResponse = vi.fn();

    const result = onMessageListener({ type: ChannelNames.GET_ALL_NOTES_REQUEST }, {}, sendResponse);

    expect(result).toBe(true);
    await new Promise(process.nextTick);

    expect(noteStorage.getAllNotesFromSystem).toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({ success: true, notes: mockNotes });
  });

  it("should handle DELETE_NOTE_REQUEST and respond with success", async () => {
    const sendResponse = vi.fn();
    const message = { type: ChannelNames.DELETE_NOTE_REQUEST, payload: { noteId: "note123" } };
    (noteStorage.deleteNoteFromSystem as Mock).mockResolvedValue(undefined);

    const result = onMessageListener(message, {}, sendResponse);

    expect(result).toBe(true);
    await new Promise(process.nextTick);

    expect(noteStorage.deleteNoteFromSystem).toHaveBeenCalledWith("note123");
    expect(mockSearchService.removeItemFromIndex).toHaveBeenCalledWith("note123");
    expect(sendResponse).toHaveBeenCalledWith({ success: true });
  });

  it("should handle SAVE_NOTE_REQUEST and respond with the saved note", async () => {
    const noteData = { title: "New Note", content: "Content" };
    const savedNote = { ...noteData, id: "note456" };
    (noteStorage.saveNoteInSystem as Mock).mockResolvedValue(savedNote);
    const sendResponse = vi.fn();
    const message = { type: ChannelNames.SAVE_NOTE_REQUEST, payload: noteData };

    const result = onMessageListener(message, {}, sendResponse);
    expect(result).toBe(true);
    await new Promise(process.nextTick);

    expect(noteStorage.saveNoteInSystem).toHaveBeenCalledWith(noteData);
    expect(mockSearchService.indexSingleNote).toHaveBeenCalledWith(savedNote);
    expect(sendResponse).toHaveBeenCalledWith({ success: true, note: savedNote });
  });

  it('should handle SEARCH_NOTES_REQUEST and respond with search results', async () => {
    const mockSearchResults = [{ id: '1', title: 'Found Note' }];
    (mockSearchService.searchItems as Mock).mockResolvedValue(mockSearchResults);
    const sendResponse = vi.fn();
    const message = { type: ChannelNames.SEARCH_NOTES_REQUEST, payload: { query: 'test', topK: 5 } };

    const result = onMessageListener(message, {}, sendResponse);

    expect(result).toBe(true);
    await new Promise(process.nextTick);

    expect(mockSearchService.searchItems).toHaveBeenCalledWith('test', 5);
    expect(sendResponse).toHaveBeenCalledWith({ success: true, results: mockSearchResults });
  });

  it('should handle DELETE_CHAT_REQUEST and respond with success', async () => {
    const sendResponse = vi.fn();
    const message = { type: ChannelNames.DELETE_CHAT_REQUEST, payload: { chatId: "conv123" } };
    (chatHistoryStorage.deleteConversation as Mock).mockResolvedValue(undefined);

    const result = onMessageListener(message, {}, sendResponse);

    expect(result).toBe(true);
    await new Promise(process.nextTick);

    expect(chatHistoryStorage.deleteConversation).toHaveBeenCalledWith("conv123");
    expect(sendResponse).toHaveBeenCalledWith({ success: true });
  });

  it('should handle SAVE_CHAT_REQUEST and respond with the saved data', async () => {
    const conversationData = { id: 'conv1', title: 'Test Chat' };
    const messageData = { id: 'msg1', content: 'Hello' };
    (chatHistoryStorage.saveConversation as Mock).mockResolvedValue(conversationData);
    (chatHistoryStorage.saveChatMessage as Mock).mockResolvedValue(messageData);
    const sendResponse = vi.fn();
    const message = {
      type: ChannelNames.SAVE_CHAT_REQUEST,
      payload: { conversation: conversationData, message: messageData },
    };

    const result = onMessageListener(message, {}, sendResponse);

    expect(result).toBe(true);
    await new Promise(process.nextTick);

    expect(chatHistoryStorage.saveConversation).toHaveBeenCalledWith(conversationData);
    expect(chatHistoryStorage.saveChatMessage).toHaveBeenCalledWith({ ...messageData, conversationId: 'conv1' });
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      conversation: conversationData,
      message: messageData,
      messages: [messageData],
    });
  });

  it('should handle GET_CHAT_MESSAGES_REQUEST and respond with messages', async () => {
    const mockMessages = [{ id: 'msg1', content: 'Hello' }];
    (chatHistoryStorage.getChatMessagesForConversation as Mock).mockResolvedValue(mockMessages);
    const sendResponse = vi.fn();
    const message = { type: ChannelNames.GET_CHAT_MESSAGES_REQUEST, payload: { conversationId: 'conv1' } };

    const result = onMessageListener(message, {}, sendResponse);

    expect(result).toBe(true);
    await new Promise(process.nextTick);

    expect(chatHistoryStorage.getChatMessagesForConversation).toHaveBeenCalledWith('conv1');
    expect(sendResponse).toHaveBeenCalledWith({ success: true, messages: mockMessages });
  });

  it('should handle DELETE_CHAT_MESSAGE_REQUEST and respond with success', async () => {
    const sendResponse = vi.fn();
    const message = { type: ChannelNames.DELETE_CHAT_MESSAGE_REQUEST, payload: { messageId: 'msg1' } };
    (chatHistoryStorage.deleteChatMessage as Mock).mockResolvedValue(undefined);

    const result = onMessageListener(message, {}, sendResponse);

    expect(result).toBe(true);
    await new Promise(process.nextTick);

    expect(chatHistoryStorage.deleteChatMessage).toHaveBeenCalledWith('msg1');
    expect(sendResponse).toHaveBeenCalledWith({ success: true });
  });

  it('should handle GET_CONVERSATION_REQUEST and respond with the conversation', async () => {
    const mockConversation = { id: 'conv1', title: 'Test Conversation' };
    (chatHistoryStorage.getConversation as Mock).mockResolvedValue(mockConversation);
    const sendResponse = vi.fn();
    const message = { type: ChannelNames.GET_CONVERSATION_REQUEST, payload: { conversationId: 'conv1' } };

    const result = onMessageListener(message, {}, sendResponse);

    expect(result).toBe(true);
    await new Promise(process.nextTick);

    expect(chatHistoryStorage.getConversation).toHaveBeenCalledWith('conv1');
    expect(sendResponse).toHaveBeenCalledWith({ success: true, conversation: mockConversation });
  });
});
