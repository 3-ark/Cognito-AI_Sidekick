import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { NoteSystemView } from './NoteSystemView';
import { saveNoteInSystem, getAllNotesFromSystem } from '../background/noteStorage';
import { toast } from 'react-hot-toast';
import { ConfigProvider, useConfig } from './ConfigContext';
import '@testing-library/jest-dom/extend-expect';

jest.mock('../background/noteStorage', () => ({
  saveNoteInSystem: jest.fn().mockResolvedValue({ id: 'new-note-id' }),
  getAllNotesFromSystem: jest.fn().mockResolvedValue([]),
  deleteNoteFromSystem: jest.fn().mockResolvedValue(undefined),
  deleteAllNotesFromSystem: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('react-hot-toast', () => ({
  success: jest.fn(),
  error: jest.fn(),
  custom: jest.fn(),
}));

jest.mock('./ConfigContext', () => ({
  ...jest.requireActual('./ConfigContext'),
  useConfig: jest.fn(() => ({
    config: {
      noteHotKey: 'ctrl+shift+n',
    },
    updateConfig: jest.fn(),
  })),
}));


const mockOnModalOpened = jest.fn();
const mockOnImportTriggered = jest.fn();

const defaultProps = {
  triggerOpenCreateModal: false,
  onModalOpened: mockOnModalOpened,
  triggerImportNoteFlow: false,
  onImportTriggered: mockOnImportTriggered,
};

const renderNoteSystemView = (props = {}) => {
  return render(
    <ConfigProvider>
      <NoteSystemView {...defaultProps} {...props} />
    </ConfigProvider>
  );
};

describe('NoteSystemView File Import', () => {
  beforeEach(() => {
    jest.setTimeout(10000);
    jest.clearAllMocks();
  });

  test('imports a TXT file successfully', async () => {
    renderNoteSystemView({ triggerImportNoteFlow: true });

    const mockFile = new File(["Test TXT content"], "test.txt", { type: "text/plain" });
    const fileInput = screen.getByTestId('hidden-file-input');

    expect(mockOnImportTriggered).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [mockFile] } });
    });

    expect(saveNoteInSystem).toHaveBeenCalledWith(expect.objectContaining({
      title: 'test',
      content: 'Test TXT content',
      tags: ['imported'],
    }));
    expect(getAllNotesFromSystem).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith('Note imported successfully: test.txt');
  });

  test('imports a Markdown file (.md) successfully', async () => {
    renderNoteSystemView({ triggerImportNoteFlow: true });
    expect(mockOnImportTriggered).toHaveBeenCalledTimes(1);


    const mockFile = new File(["# Markdown content"], "markdown_test.md", { type: "text/markdown" });
    const fileInput = screen.getByTestId('hidden-file-input');

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [mockFile] } });
    });

    expect(saveNoteInSystem).toHaveBeenCalledWith(expect.objectContaining({
      title: 'markdown_test',
      content: '# Markdown content',
      tags: ['imported'],
    }));
    expect(getAllNotesFromSystem).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith('Note imported successfully: markdown_test.md');
  });

  test('imports an HTML file (.html) with title successfully', async () => {
    renderNoteSystemView({ triggerImportNoteFlow: true });
    expect(mockOnImportTriggered).toHaveBeenCalledTimes(1);


    const htmlContent = "<html><head><title>HTML Title</title></head><body><p>HTML body content</p><div>More content</div></body></html>";
    const mockFile = new File([htmlContent], "html_test.html", { type: "text/html" });
    const fileInput = screen.getByTestId('hidden-file-input');

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [mockFile] } });
    });

    expect(saveNoteInSystem).toHaveBeenCalledWith(expect.objectContaining({
      title: 'HTML Title',
      content: 'HTML body contentMore content',
      tags: ['imported'],
    }));
    expect(getAllNotesFromSystem).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith('Note imported successfully: html_test.html');
  });

  test('imports an HTML file (.htm) without title tag successfully (uses filename)', async () => {
    renderNoteSystemView({ triggerImportNoteFlow: true });
    expect(mockOnImportTriggered).toHaveBeenCalledTimes(1);

    const htmlContent = "<html><body><p>Body only for htm</p></body></html>";
    const mockFile = new File([htmlContent], "no_title_test.htm", { type: "text/html" });
    const fileInput = screen.getByTestId('hidden-file-input');

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [mockFile] } });
    });

    expect(saveNoteInSystem).toHaveBeenCalledWith(expect.objectContaining({
      title: 'no_title_test',
      content: 'Body only for htm',
      tags: ['imported'],
    }));
    expect(getAllNotesFromSystem).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith('Note imported successfully: no_title_test.htm');
  });
  
  test('handles empty content after HTML processing', async () => {
    renderNoteSystemView({ triggerImportNoteFlow: true });
    expect(mockOnImportTriggered).toHaveBeenCalledTimes(1);

    const htmlContent = "<html><head><title>Empty Body Test</title></head><body></body></html>"; // Empty body
    const mockFile = new File([htmlContent], "empty_body.html", { type: "text/html" });
    const fileInput = screen.getByTestId('hidden-file-input');

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [mockFile] } });
    });
    
    expect(saveNoteInSystem).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Cannot import note: Content is empty after processing.");
    expect(getAllNotesFromSystem).not.toHaveBeenCalled();
  });


  test('handles file read error', async () => {
    renderNoteSystemView({ triggerImportNoteFlow: true });
    expect(mockOnImportTriggered).toHaveBeenCalledTimes(1);

    const mockFile = new File(["content"], "error_test.txt", { type: "text/plain" });
    const fileInput = screen.getByTestId('hidden-file-input');

    const originalFileReader = window.FileReader;
    (window.FileReader as any) = jest.fn(() => ({
      readAsText: jest.fn(function(this: FileReader, file) {
        const event = new ProgressEvent('error');
        this.dispatchEvent(event);
      }),
      onload: jest.fn(),
      dispatchEvent: jest.fn(),
      onerror: jest.fn(),
    }));
    
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [mockFile] } });
    });

    expect(saveNoteInSystem).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Error reading file: error_test.txt');
    
    window.FileReader = originalFileReader;
  });

  test('handles no file selected', async () => {
    renderNoteSystemView({ triggerImportNoteFlow: true });
    expect(mockOnImportTriggered).toHaveBeenCalledTimes(1);

    const fileInput = screen.getByTestId('hidden-file-input');

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [] } });
    });

    expect(saveNoteInSystem).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });
  
  test('useEffect calls onImportTriggered when triggerImportNoteFlow is true', () => {
    renderNoteSystemView({ triggerImportNoteFlow: true });
    expect(mockOnImportTriggered).toHaveBeenCalledTimes(1);
  });

  test('file input value is reset after successful import', async () => {
    renderNoteSystemView({ triggerImportNoteFlow: true });
    const mockFile = new File(["Test content"], "reset_test.txt", { type: "text/plain" });
    const fileInput = screen.getByTestId('hidden-file-input') as HTMLInputElement;

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [mockFile] } });
    });

    expect(saveNoteInSystem).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith('Note imported successfully: reset_test.txt');
    expect(fileInput.value).toBe('');
  });

  test('file input value is reset after failed import (read error)', async () => {
    renderNoteSystemView({ triggerImportNoteFlow: true });
    const mockFile = new File(["content"], "fail_reset_test.txt", { type: "text/plain" });
    const fileInput = screen.getByTestId('hidden-file-input') as HTMLInputElement;

    const originalFileReader = window.FileReader;
    (window.FileReader as any) = jest.fn(() => ({
      readAsText: jest.fn(function(this: FileReader, file) {
        if (this.onerror) {
          const event = new ProgressEvent('error');
          this.dispatchEvent(event);
        }
      }),
      dispatchEvent: jest.fn(),
     }));
    
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [mockFile] } });
    });
    
    expect(toast.error).toHaveBeenCalledWith('Error reading file: fail_reset_test.txt');
    expect(fileInput.value).toBe('');
    
    window.FileReader = originalFileReader;
  });

  test('file input value is reset after failed import (empty content)', async () => {
    renderNoteSystemView({ triggerImportNoteFlow: true });
    const mockFile = new File([""], "empty_content_reset.txt", { type: "text/plain" });
    const fileInput = screen.getByTestId('hidden-file-input') as HTMLInputElement;
    
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [mockFile] } });
    });
    
    expect(toast.error).toHaveBeenCalledWith("Cannot import note: Content is empty after processing.");
    expect(fileInput.value).toBe(''); 
  });

});

describe('NoteSystemView Basic Rendering', () => {
  test('renders search input and handles search query', () => {
    renderNoteSystemView();
    const searchInput = screen.getByPlaceholderText('Search notes (titles & content & tags)...');
    expect(searchInput).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'test query' } });
    expect((searchInput as HTMLInputElement).value).toBe('test query');
  });

  test('shows "No notes yet" when no notes are available', async () => {
    (getAllNotesFromSystem as jest.Mock).mockResolvedValueOnce([]);
    renderNoteSystemView();
    expect(await screen.findByText('No notes yet. Create one!')).toBeInTheDocument();
  });
});
