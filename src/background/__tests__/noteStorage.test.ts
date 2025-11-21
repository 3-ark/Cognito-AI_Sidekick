/// <reference types="vitest/globals" />
import { vi, describe, it, expect, beforeEach, Mock } from "vitest";
import localforage from "localforage";
import {
  saveNoteInSystem,
  getAllNotesFromSystem,
  getNoteByIdFromSystem,
  deleteNoteFromSystem,
  deleteNotesFromSystem,
  exportNotesToObsidianMD,
  EMBEDDING_NOTE_PREFIX,
} from "../noteStorage";
import * as storageUtil from "../storageUtil";
import * as chunkIndex from "../chunkIndex";
import * as searchUtils from '../searchUtils';
import { Note, NOTE_STORAGE_PREFIX } from "../../types/noteTypes";
import 'fflate';

vi.mock("localforage");
vi.mock("../storageUtil");
vi.mock("../chunkIndex");
vi.mock('../searchUtils');
vi.mock('fflate', () => ({
  zipSync: vi.fn(),
  strToU8: vi.fn((str) => new TextEncoder().encode(str)),
}));

// Mock chrome API
const chrome = {
  runtime: {
    lastError: null,
  },
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn(),
    },
  },
};

global.chrome = chrome as any;


describe("noteStorage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(storageUtil, "getStoredAppSettings").mockResolvedValue({
      ragConfig: { autoEmbedOnSave: false },
    } as any);
  });

  describe('saveNoteInSystem', () => {
    it('should save a note with all properties', async () => {
      const note: Partial<Note> = {
        id: `${NOTE_STORAGE_PREFIX}1`,
        title: 'Test Note',
        content: 'This is a test note.',
        tags: ['test'],
        createdAt: Date.now(),
        lastUpdatedAt: Date.now(),
      };

      await saveNoteInSystem(note as Note);

      expect(localforage.setItem).toHaveBeenCalledWith(
        `${NOTE_STORAGE_PREFIX}1`,
        expect.objectContaining({
          id: `${NOTE_STORAGE_PREFIX}1`,
          title: 'Test Note',
        }),
      );
    });

    it('should default pinned to false if not provided', async () => {
      const note: Partial<Note> = { id: `${NOTE_STORAGE_PREFIX}1`, title: 'Test Note' };
      await saveNoteInSystem(note as Note);
      expect(localforage.setItem).toHaveBeenCalledWith(
        `${NOTE_STORAGE_PREFIX}1`,
        expect.objectContaining({ pinned: false }),
      );
    });

    it('should save the pinned status when provided as true', async () => {
      const note: Partial<Note> = { id: `${NOTE_STORAGE_PREFIX}1`, title: 'Test Note', pinned: true };
      await saveNoteInSystem(note as Note);
      expect(localforage.setItem).toHaveBeenCalledWith(
        `${NOTE_STORAGE_PREFIX}1`,
        expect.objectContaining({ pinned: true }),
      );
    });

    it('should set lastUpdatedAt if not provided', async () => {
      const note: Partial<Note> = { id: `${NOTE_STORAGE_PREFIX}1`, title: 'Test Note' };
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);
      await saveNoteInSystem(note as Note);
      expect(localforage.setItem).toHaveBeenCalledWith(
        `${NOTE_STORAGE_PREFIX}1`,
        expect.objectContaining({ lastUpdatedAt: now }),
      );
      (Date.now as Mock).mockRestore();
    });
  });

  it("should get all notes and sort them by pinned and lastUpdatedAt", async () => {
    const now = Date.now();
    const notes: Note[] = [
      { id: `${NOTE_STORAGE_PREFIX}1`, title: "Note 1", content: "", tags: [], createdAt: now, lastUpdatedAt: now - 2000, pinned: false, contentLastUpdatedAt: now, bm25Content: '' },
      { id: `${NOTE_STORAGE_PREFIX}2`, title: "Note 2", content: "", tags: [], createdAt: now, lastUpdatedAt: now - 1000, pinned: true, contentLastUpdatedAt: now, bm25Content: '' },
      { id: `${NOTE_STORAGE_PREFIX}3`, title: "Note 3", content: "", tags: [], createdAt: now, lastUpdatedAt: now, pinned: false, contentLastUpdatedAt: now, bm25Content: '' },
      { id: `${NOTE_STORAGE_PREFIX}4`, title: "Note 4", content: "", tags: [], createdAt: now, lastUpdatedAt: now - 3000, pinned: true, contentLastUpdatedAt: now, bm25Content: '' },
    ];

    const noteKeys = notes.map(n => n.id);
    vi.spyOn(localforage, 'keys').mockResolvedValue(noteKeys);

    const notesMap = new Map(notes.map(note => [note.id, note]));
    vi.spyOn(localforage, 'getItem').mockImplementation(async (key: string) => {
      if (notesMap.has(key)) {
        return notesMap.get(key);
      }
      if (key.startsWith(EMBEDDING_NOTE_PREFIX)) {
        return null;
      }
      return null;
    });

    const sortedNotes = await getAllNotesFromSystem();

    expect(sortedNotes.map(n => n.id)).toEqual([
        `${NOTE_STORAGE_PREFIX}2`,
        `${NOTE_STORAGE_PREFIX}4`,
        `${NOTE_STORAGE_PREFIX}3`,
        `${NOTE_STORAGE_PREFIX}1`,
    ]);
  });

  it("should get a specific note by id", async () => {
    const note: Note = {
      id: `${NOTE_STORAGE_PREFIX}1`,
      title: "Test Note",
      content: "This is a test note.",
      tags: ["test"],
      createdAt: Date.now(),
      lastUpdatedAt: Date.now(),
      pinned: false,
      contentLastUpdatedAt: Date.now(),
      bm25Content: ''
    };

    vi.spyOn(localforage, 'getItem').mockResolvedValue(note);

    const result = await getNoteByIdFromSystem(`${NOTE_STORAGE_PREFIX}1`);

    expect(localforage.getItem).toHaveBeenCalledWith(`${NOTE_STORAGE_PREFIX}1`);
    expect(result).toEqual(expect.objectContaining({ id: `${NOTE_STORAGE_PREFIX}1` }));
  });

  it("should delete a note by id", async () => {
    vi.spyOn(chunkIndex, 'getChunksForParent').mockResolvedValue([]);
    const noteId = `${NOTE_STORAGE_PREFIX}1`;
    await deleteNoteFromSystem(noteId);
    expect(localforage.removeItem).toHaveBeenCalledWith(noteId);
    expect(localforage.removeItem).toHaveBeenCalledWith(`${EMBEDDING_NOTE_PREFIX}${noteId}`);
  });

  it('should delete multiple notes by id', async () => {
    const noteIds = [`${NOTE_STORAGE_PREFIX}1`, `${NOTE_STORAGE_PREFIX}2`];
    const mockSearchService = { removeItemFromIndex: vi.fn() };
    (searchUtils.getSearchService as Mock).mockReturnValue(mockSearchService);
    (chunkIndex.getChunkIndex as Mock).mockResolvedValue({
      [`${NOTE_STORAGE_PREFIX}1`]: ['chunk1a', 'chunk1b'],
      [`${NOTE_STORAGE_PREFIX}2`]: ['chunk2a'],
    });

    await deleteNotesFromSystem(noteIds);

    expect(localforage.removeItem).toHaveBeenCalledWith(`${NOTE_STORAGE_PREFIX}1`);
    expect(localforage.removeItem).toHaveBeenCalledWith(`${EMBEDDING_NOTE_PREFIX}${NOTE_STORAGE_PREFIX}1`);
    expect(localforage.removeItem).toHaveBeenCalledWith('chunk1a');
    expect(localforage.removeItem).toHaveBeenCalledWith('chunk1b');
    expect(localforage.removeItem).toHaveBeenCalledWith(`${NOTE_STORAGE_PREFIX}2`);
    expect(localforage.removeItem).toHaveBeenCalledWith(`${EMBEDDING_NOTE_PREFIX}${NOTE_STORAGE_PREFIX}2`);
    expect(localforage.removeItem).toHaveBeenCalledWith('chunk2a');
    expect(mockSearchService.removeItemFromIndex).toHaveBeenCalledWith(`${NOTE_STORAGE_PREFIX}1`);
    expect(mockSearchService.removeItemFromIndex).toHaveBeenCalledWith(`${NOTE_STORAGE_PREFIX}2`);
    expect(chunkIndex.saveChunkIndex).toHaveBeenCalled();
  });

  it('should export notes to Obsidian MD format and trigger a zip download', async () => {
    const noteIds = [`${NOTE_STORAGE_PREFIX}1`];
    const note = {
      id: `${NOTE_STORAGE_PREFIX}1`,
      title: 'Test Note',
      content: 'This is the content.',
      tags: ['a', 'b'],
      url: 'https://example.com',
      description: 'A test desc',
      createdAt: Date.now(),
      lastUpdatedAt: Date.now(),
      pinned: false,
      contentLastUpdatedAt: Date.now(),
      bm25Content: ''
    };
    vi.spyOn(localforage, 'getItem').mockResolvedValue(note);

    const mockZippedContent = new Uint8Array([1, 2, 3]);
    const fflate = await import('fflate');
    (fflate.zipSync as Mock).mockReturnValue(mockZippedContent);
    const downloadMock = vi.fn((options, callback) => callback(123));
    global.chrome.downloads = { download: downloadMock } as any;
    global.FileReader = vi.fn(() => ({
        readAsDataURL: vi.fn(),
        onloadend: vi.fn(),
        result: 'data:application/zip;base64,AQID',
    })) as any;

    // Make the onloadend function to be called immediately
    vi.spyOn(global, 'FileReader').mockImplementation(function (this: any) {
        this.readAsDataURL = () => {
            if (this.onloadend) {
                this.result = 'data:application/zip;base64,AQID';
                this.onloadend();
            }
        };
        return this;
    } as any);

    const result = await exportNotesToObsidianMD(noteIds);

    expect(result.successCount).toBe(1);
    expect(result.errorCount).toBe(0);
    expect(result.isZip).toBe(true);
    expect(fflate.zipSync).toHaveBeenCalled();
    expect(downloadMock).toHaveBeenCalled();
  });
});
