import { vi } from 'vitest';
import {
  aggressiveProcessText,
  cleanMarkdownForSemantics,
  generateContextualSummary,
} from '../textProcessing';
import * as generationUtils from '../generationUtils';

vi.mock('tiny-segmenter', () => {
  return {
    default: class TinySegmenter {
      segment(text: string) {
        // Simple mock for testing; splits by space or known Japanese particles
        return text.split(/([\s\u3000\u3001\u3002\u306F\u306E\u3092\u304C\u306B])/);
      }
    },
  };
});

describe('textProcessing', () => {
  describe('aggressiveProcessText', () => {
    it('should process English text correctly', () => {
      const text = 'The quick brown fox jumps over the lazy dog';
      const expected = ['quick', 'brown', 'fox', 'jump', 'lazi', 'dog'];
      expect(aggressiveProcessText(text)).toEqual(expected);
    });

    it('should handle empty and invalid input', () => {
      expect(aggressiveProcessText('')).toEqual([]);
      expect(aggressiveProcessText(null as any)).toEqual([]);
      expect(aggressiveProcessText(undefined as any)).toEqual([]);
    });

    it('should process Japanese text', () => {
      const text = '日本語のテキスト';
      const expected = ['日本語', 'の', 'テキスト'];
      // This depends on the mock behavior
      const result = aggressiveProcessText(text).filter(s => s.trim().length > 0);
      expect(result).toEqual(expected);
    });

    it('should process Korean text', () => {
      const text = '한국어 텍스트';
      const expected = ['한', '국', '어', '텍', '스', '트'];
      expect(aggressiveProcessText(text)).toEqual(expected);
    });
  });

  describe('cleanMarkdownForSemantics', () => {
    it('should remove HTML tags', () => {
      const text = '<p>Hello</p> <b>World</b>';
      expect(cleanMarkdownForSemantics(text)).toBe('Hello World');
    });

    it('should remove markdown links but keep the text', () => {
      const text = 'A [link](http://example.com) to something.';
      expect(cleanMarkdownForSemantics(text)).toBe('A link to something.');
    });

    it('should remove markdown images but keep alt text', () => {
      const text = 'An image ![alt text](image.png) here.';
      expect(cleanMarkdownForSemantics(text)).toBe('An image alt text here.');
    });

    it('should handle a mix of markdown and HTML', () => {
      const text = '### Title\n\nSome **bold** and `code`.\n\n- item 1\n- item 2';
      const result = cleanMarkdownForSemantics(text);
      expect(result).not.toContain('###');
      expect(result).not.toContain('**');
      expect(result).toContain('Title');
      expect(result).toContain('bold');
    });
  });

  describe('generateContextualSummary', () => {
    it('should call getCompletion with a constructed prompt', async () => {
      const getCompletionSpy = vi
        .spyOn(generationUtils, 'getCompletion')
        .mockResolvedValue('A summary');

      const fullDocumentText = 'This is the full document text. It is very long.';
      const chunkContent = 'a chunk of text';
      const contextLength = 1000;

      await generateContextualSummary(fullDocumentText, chunkContent, contextLength);

      expect(getCompletionSpy).toHaveBeenCalled();
      const messages = getCompletionSpy.mock.calls[0][0];
      const prompt = messages[0].content;

      expect(prompt).toContain(chunkContent);
      expect(prompt).toContain(fullDocumentText);

      getCompletionSpy.mockRestore();
    });

    it('should truncate long document text', async () => {
        const getCompletionSpy = vi
          .spyOn(generationUtils, 'getCompletion')
          .mockResolvedValue('A summary');
      
        const longText = 'a'.repeat(5000);
        const chunkContent = 'chunk';
        const textWithChunk = longText + chunkContent + longText;
        const contextLength = 1000; // a small context window to force truncation
      
        await generateContextualSummary(textWithChunk, chunkContent, contextLength);
      
        expect(getCompletionSpy).toHaveBeenCalled();
        const messages = getCompletionSpy.mock.calls[0][0];
        const prompt = messages[0].content as string;
      
        // CHARS_PER_TOKEN = 4, RESPONSE_BUFFER_TOKONS = 512
        // maxTokensForPrompt = 1000 - 512 = 488
        // maxCharsForPrompt = 488 * 4 = 1952
        // promptTemplate length is ~250 chars
        // maxCharsForDocument = 1952 - ~250 = ~1702
        // documentForPrompt = '...' + a_slice + '...chunk...' + a_slice + '...'
        // Check if the prompt is smaller than the original text + some buffer
        expect(prompt.length).toBeLessThan(textWithChunk.length);
        expect(prompt).toContain('...');
      
        getCompletionSpy.mockRestore();
      });
  });
});
