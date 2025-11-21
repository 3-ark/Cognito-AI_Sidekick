import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, Mock } from 'vitest';
import { RagSettingsPanel } from '../RagSettingsPanel';
import { useConfig } from '../ConfigContext';
import ChannelNames from '../../types/ChannelNames';
import localforage from 'localforage';

vi.mock('../ConfigContext');
vi.mock('localforage');

describe('RagSettingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (useConfig as Mock).mockReturnValue({
      config: {
        ragConfig: {
          model: 'test-model',
          use_gpu: true,
          semantic_top_k: 20,
          similarity_threshold: 0.3,
          BM25_top_k: 50,
          k: 1.2,
          b: 0.75,
          d: 0.5,
          bm25_weight: 0.5,
          autoEmbedOnSave: false,
          maxChunkChars: 2000,
          minChunkChars: 150,
          overlapChars: 50,
          lambda: 0.5,
        },
        models: [],
      },
      updateConfig: vi.fn(),
    });

    (localforage.keys as Mock).mockResolvedValue(['note_1', 'conv_1']);
    (localforage.getItem as Mock).mockResolvedValue(Date.now());

    global.chrome = {
      runtime: {
        sendMessage: vi.fn(),
        onMessage: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
    } as any;
  });

  it('should send a BUILD_ALL_EMBEDDINGS_REQUEST when the Rebuild button is clicked', async () => {
    render(<RagSettingsPanel />);

    const rebuildButton = await screen.findByRole('button', { name: /rebuild/i });
    fireEvent.click(rebuildButton);

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: ChannelNames.BUILD_ALL_EMBEDDINGS_REQUEST,
    });
  });

  it('should send an UPDATE_EMBEDDINGS_REQUEST when the Update button is clicked', async () => {
    render(<RagSettingsPanel />);

    const updateButton = await screen.findByRole('button', { name: /update/i });
    fireEvent.click(updateButton);

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'UPDATE_EMBEDDINGS_REQUEST',
    });
  });
});
