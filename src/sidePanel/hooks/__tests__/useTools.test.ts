import { act, renderHook, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { useTools } from '../useTools';
import * as toolExecutors from '../toolExecutors';
import { useConfig } from '../../ConfigContext';

vi.mock('../toolExecutors');
vi.mock('../../ConfigContext');

describe('useTools', () => {
  const mockUpdateConfig = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useConfig as jest.Mock).mockReturnValue({
      config: { noteContent: 'test note content' },
      updateConfig: mockUpdateConfig,
    });
  });

  it('should correctly parse arguments and call the save_note executor', async () => {
    const { result } = renderHook(() => useTools());
    const toolCall = {
      id: 'call1',
      type: 'function' as const,
      function: { name: 'note.save', arguments: '{ "content": "test" }' },
    };
    const expectedResult = { message: 'Note saved successfully' };

    vi.spyOn(toolExecutors, 'extractAndParseJsonArguments').mockReturnValue({ content: 'test' });
    (toolExecutors.executeSaveNote as jest.Mock).mockResolvedValue(expectedResult);

    let finalResult;
    await act(async () => {
      finalResult = await result.current.executeToolCall(toolCall);
    });

    await waitFor(() => {
      expect(toolExecutors.executeSaveNote).toHaveBeenCalledWith({ content: 'test' });
    });

    expect(finalResult).toEqual({
      toolCallId: 'call1',
      name: 'note.save',
      result: expectedResult.message,
    });
  });

  it('should handle unknown tools gracefully', async () => {
    const { result } = renderHook(() => useTools());
    const toolCall = {
      id: 'call1',
      type: 'function' as const,
      function: { name: 'unknown_tool', arguments: '{}' },
    };

    vi.spyOn(toolExecutors, 'extractAndParseJsonArguments').mockReturnValue({});

    let finalResult;
    await act(async () => {
      finalResult = await result.current.executeToolCall(toolCall);
    });

    expect(finalResult).toEqual({
      toolCallId: 'call1',
      name: 'unknown_tool',
      result: "Error: Unknown tool 'unknown_tool'",
    });
  });

  it('should handle argument parsing errors', async () => {
    const { result } = renderHook(() => useTools());
    const toolCall = {
      id: 'call1',
      type: 'function' as const,
      function: { name: 'note.save', arguments: 'invalid json' },
    };
    const errorMessage = 'Invalid JSON';

    vi.spyOn(toolExecutors, 'extractAndParseJsonArguments').mockImplementation(() => {
      throw new Error(errorMessage);
    });

    let finalResult;
    await act(async () => {
      finalResult = await result.current.executeToolCall(toolCall);
    });

    expect(finalResult).toEqual({
      toolCallId: 'call1',
      name: 'note.save',
      result: `Error: Could not parse arguments for tool note.save. Please ensure the arguments are valid JSON. Error details: ${errorMessage}`,
    });
  });

  it('should handle tool execution errors', async () => {
    const { result } = renderHook(() => useTools());
    const toolCall = {
      id: 'call1',
      type: 'function' as const,
      function: { name: 'note.save', arguments: '{}' },
    };
    const errorMessage = 'Failed to save note';

    vi.spyOn(toolExecutors, 'extractAndParseJsonArguments').mockReturnValue({});
    (toolExecutors.executeSaveNote as jest.Mock).mockRejectedValue(new Error(errorMessage));

    let finalResult;
    await act(async () => {
      finalResult = await result.current.executeToolCall(toolCall);
    });

    expect(finalResult).toEqual({
      toolCallId: 'call1',
      name: 'note.save',
      result: `Error executing tool note.save: ${errorMessage}`,
    });
  });

  it('should call the memory.update executor with the correct arguments', async () => {
    const { result } = renderHook(() => useTools());
    const toolCall = {
      id: 'call1',
      type: 'function' as const,
      function: { name: 'memory.update', arguments: '{ "content": "updated memory" }' },
    };
    const args = { content: 'updated memory' };
    const expectedResult = { message: 'Memory updated' };

    vi.spyOn(toolExecutors, 'extractAndParseJsonArguments').mockReturnValue(args);
    (toolExecutors.executeUpdateMemory as jest.Mock).mockReturnValue(expectedResult);

    await act(async () => {
      await result.current.executeToolCall(toolCall);
    });

    await waitFor(() => {
      expect(toolExecutors.executeUpdateMemory).toHaveBeenCalledWith(
        args,
        'test note content',
        mockUpdateConfig,
      );
    });
  });
});
