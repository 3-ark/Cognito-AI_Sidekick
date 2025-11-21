import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as ttsUtils from '../ttsUtils';

// --- Mocks ---

// Mock SpeechSynthesisUtterance
class MockSpeechSynthesisUtterance {
  text: string;
  rate: number = 1;
  voice: SpeechSynthesisVoice | null = null;
  onstart: () => void = () => {};
  onend: () => void = () => {};
  onpause: () => void = () => {};
  onresume: () => void = () => {};
  onerror: (event: any) => void = () => {};

  constructor(text: string) {
    this.text = text;
  }
}

// Mock window.speechSynthesis
const mockSpeechSynthesis = {
  getVoices: vi.fn(() => [
    { name: 'Google US English', lang: 'en-US' } as SpeechSynthesisVoice,
  ]),
  speak: vi.fn(utterance => {
    mockSpeechSynthesis.speaking = true;
    setTimeout(() => utterance.onstart(), 0); // Simulate async start
    setTimeout(() => {
      mockSpeechSynthesis.speaking = false;
      utterance.onend();
    }, 10); // Simulate speech duration
  }),
  cancel: vi.fn(() => {
    mockSpeechSynthesis.speaking = false;
    mockSpeechSynthesis.pending = false;
  }),
  pause: vi.fn(() => {
    mockSpeechSynthesis.paused = true;
  }),
  resume: vi.fn(() => {
    mockSpeechSynthesis.paused = false;
  }),
  speaking: false,
  pending: false,
  paused: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

// Mock Audio
class MockAudio {
    src: string;
    onplaying = () => {};
    onpause = () => {};
    onended = () => {};
    onerror = () => {};
    paused: boolean = true;
  
    constructor(src: string) {
      this.src = src;
    }
  
    play = vi.fn(() => {
      this.paused = false;
      this.onplaying();
    });
    pause = vi.fn(() => {
      this.paused = true;
      this.onpause();
    });
  }

vi.stubGlobal('speechSynthesis', mockSpeechSynthesis);
vi.stubGlobal('SpeechSynthesisUtterance', MockSpeechSynthesisUtterance);
vi.stubGlobal('Audio', MockAudio);
vi.stubGlobal('URL', { createObjectURL: vi.fn(blob => `blob:${blob.type}`) });

// Mock global fetch for OpenAI
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);


describe('ttsUtils', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    ttsUtils.stopSpeech(); // Reset internal state
    ttsUtils.stopSpeechOpenAI();
    mockSpeechSynthesis.speaking = false;
    mockSpeechSynthesis.pending = false;
    mockSpeechSynthesis.paused = false;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Native SpeechSynthesis', () => {
    it('should speak a message with default voice', async () => {
      const onStart = vi.fn();
      const onEnd = vi.fn();
      
      ttsUtils.speakMessage('Hello', undefined, 1, { onStart, onEnd });
      
      await vi.runAllTimersAsync();

      expect(mockSpeechSynthesis.speak).toHaveBeenCalled();
      expect(onStart).toHaveBeenCalled();
      expect(onEnd).toHaveBeenCalled();
    });

    it('should stop speaking', () => {
        const onEnd = vi.fn();
        ttsUtils.speakMessage('test', undefined, 1, { onEnd });
        ttsUtils.stopSpeech();
        expect(mockSpeechSynthesis.cancel).toHaveBeenCalled();
        expect(onEnd).toHaveBeenCalled(); 
      });
  });

  describe('OpenAI TTS', () => {
    it('should call OpenAI API and play audio', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            blob: () => Promise.resolve({ type: 'audio/mpeg' }),
        });

        const onStart = vi.fn();
        const onEnd = vi.fn();

        ttsUtils.speakMessageOpenAI('Hello from OpenAI', 'test-key', 'alloy', 'tts-1', undefined, { onStart, onEnd });
        
        expect(onStart).toHaveBeenCalled();
        expect(ttsUtils.isOpenAIAudioActive()).toBe(true);
        expect(mockFetch).toHaveBeenCalledWith(
            'https://api.openai.com/v1/audio/speech',
            expect.any(Object)
        );

        // Need to find the audio instance to simulate end
        // This part is tricky as the audio instance is internal
        // For now, we just check the initial state. A more robust test would require exposing the audio instance or refactoring.
    });
  });
});
