import React, {
 useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode, Children,
} from 'react';
import { createRoot } from 'react-dom/client';
import { toast, Toaster } from 'react-hot-toast';
import Markdown from 'react-markdown';
import {
 Loader2, Pencil, Sparkles,
} from 'lucide-react';
import OpenAI from 'openai';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkSupersub from 'remark-supersub';

import { remarkWikiLink } from '../remark/remark-wiki-link.mjs';
import ChannelNames from '../types/ChannelNames';
import { Note } from '../types/noteTypes';

import { GranularDiffViewer, GranularDiffViewerRef } from './components/GranularDiffViewer';
import NoteLink from './components/NoteLink';

import 'src/content/index.css';

import { markdownComponents } from '@/components/MarkdownComponents';
import { Button } from '@/components/ui/button';
import { CodeBlock, CodeBlockCopyButton } from '@/components/ui/code-block';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import storage from '@/src/background/storageUtil';
import { cn } from '@/src/background/util';
import {
 setTheme, type Theme as AppTheme,themes, 
} from '@/src/sidePanel/Customize';
import { getAuthHeader } from '@/src/sidePanel/hooks/useSendMessage';
import { Config } from '@/src/types/config';

const NotePre = (props: React.ComponentPropsWithoutRef<'pre'>) => {
  const { children } = props;

  // The `pre` tag rendered by `react-markdown` has a single `code` child element.
  const codeElement = Children.only(children) as ReactElement<{
    className?: string;
    children?: ReactNode;
  }> | null;

  if (!codeElement) {
    return <pre {...props} />;
  }

  // The language is part of the `code` element's class name (e.g., "language-javascript").
  const language = codeElement.props.className?.replace('language-', '') || '';

  // The actual code content is the child of the `code` element.
  const code = codeElement.props.children ? String(codeElement.props.children).trim() : '';

  return (
    <CodeBlock code={code} language={language} showLineNumbers>
      <CodeBlockCopyButton />
    </CodeBlock>
  );
};

const noteMarkdownComponents = {
  ...markdownComponents,
  pre: NotePre,
  // @ts-ignore
  wikiLink: ({ value, children }) => <NoteLink href={value}>{children}</NoteLink>,
};

const formatNoteForLLM = (title: string, description: string, tags: string, content: string): string => {
  return `---
title: ${title}
description: ${description}
tags: ${tags}
---

${content}`;
};

const parseLLMResponse = (responseText: string): { title: string; tags: string; content: string, description: string } => {
  const frontmatterRegex = /---\s*title:\s*(.*?)\s*description:\s*(.*?)\s*tags:\s*(.*?)\s*---\s*(.*)/s;
  const match = responseText.match(frontmatterRegex);

  if (match) {
    return {
      title: match[1].trim(),
      description: match[2].trim(),
      tags: match[3].trim(),
      content: match[4].trim(),
    };
  }

  // Fallback if the format is not matched
  return {
    title: '',
    description: '',
    tags: '',
    content: responseText,
  };
};

const NotePage: React.FC = () => {
  const diffViewerRef = useRef<GranularDiffViewerRef>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [editedContent, setEditedContent] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [editedTags, setEditedTags] = useState('');
  const [editedUrl, setEditedUrl] = useState('');
  const [fontSize, setFontSize] = useState(16);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<Config | null>(null);

  // State for inline AI editing
  const [isAiEditing, setIsAiEditing] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [originalContentForDiff, setOriginalContentForDiff] = useState('');
  const [tabId, setTabId] = useState<number | null>(null);

  const noteId = new URLSearchParams(window.location.search).get('noteId');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('tabId');

    if (id) {
      setTabId(parseInt(id, 10));
    }

    const loadConfigAndTheme = async () => {
      try {
        const storedConfig = await storage.getItem('config');

        if (storedConfig) {
          const parsedConfig: Config = JSON.parse(storedConfig);

          setConfig(parsedConfig);
          setFontSize(parsedConfig.fontSize || 16);

          const paperTextureEnabled = parsedConfig.paperTexture ?? true;

          document.documentElement.dataset.paperTexture = String(paperTextureEnabled);

          const currentThemeName = parsedConfig.theme || 'dark';
          let themeToApply: AppTheme;

          if (currentThemeName === 'custom' && parsedConfig.customTheme) {
            const baseCustomOrDefault = themes.find(t => t.name === 'custom')!;

            themeToApply = {
              ...baseCustomOrDefault,
              ...parsedConfig.customTheme,
              name: 'custom',
            } as AppTheme;
          } else {
            themeToApply = themes.find(t => t.name === currentThemeName) || themes.find(t => t.name === 'dark')!;
          }

          setTheme(themeToApply, paperTextureEnabled);
        }
      } catch (e) {
        console.error("Failed to load config for theme", e);
        const darkTheme = themes.find(t => t.name === 'dark')!;

        setTheme(darkTheme, true);
      }
    };

    loadConfigAndTheme();
  }, []);

  const fetchNote = useCallback(() => {
    if (noteId) {
      chrome.runtime.sendMessage({ type: 'GET_NOTE_BY_ID_REQUEST', payload: { noteId } }, response => {
        if (response.success) {
          setNote(response.note);
          setEditedTitle(response.note.title);
          setEditedDescription(response.note.description || '');
          setEditedContent(response.note.content);
          setEditedTags(response.note.tags?.join(', ') || '');
          setEditedUrl(response.note.url || '');
        } else {
          setError(response.error);
          toast.error(`Error fetching note: ${response.error}`);
        }
      });
    } else {
      const newNote: Note = {
        id: `new-note-${Date.now()}`,
        title: 'New Note',
        content: 'This is a new note.',
        url: '',
        description: '',
        tags: [],
        createdAt: Date.now(),
        lastUpdatedAt: Date.now(),
      };

      setNote(newNote);
      setEditedTitle(newNote.title);
      setEditedContent(newNote.content);
      setEditedDescription(newNote.description || '');
      setEditedTags(newNote.tags?.join(', ') || '');
      setEditedUrl(newNote.url || '');
      setIsEditing(true);
    }
  }, [noteId]);

  useEffect(() => {
    fetchNote();
  }, [fetchNote]);

  const handleGenerate = useCallback(async (promptToUse?: string) => {
    const finalPrompt = promptToUse || aiPrompt;

    if (!finalPrompt || !config) return;

    setIsAiLoading(true);
    setAiError(null);
    setAiSuggestion(null);

    const selectedModelId = config.selectedModel;

    if (!selectedModelId) {
      setAiError("Configuration error: No model selected.");
      setIsAiLoading(false);

      return;
    }

    const currentModel = config.models?.find(m => m.id === selectedModelId);

    if (!currentModel) {
      setAiError(`Configuration error: Could not find model with ID '${selectedModelId}'.`);
      setIsAiLoading(false);

      return;
    }

    const authHeader = getAuthHeader(config, currentModel);
    const host = currentModel.host || '';
    let url = '';

    if (host.startsWith('custom_endpoint')) {
      const endpoint = config.customEndpoints?.find(e => e.id === host);

      url = endpoint?.endpoint || '';
    } else {
      const urlMap: Record<string, string | undefined> = {
        groq: 'https://api.groq.com/openai/v1',
        ollama: config?.ollamaUrl ? `${config.ollamaUrl}/v1` : undefined,
        gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
        lmStudio: config?.lmStudioUrl ? `${config.lmStudioUrl}/v1` : undefined,
        openai: 'https://api.openai.com/v1',
        openrouter: 'https://openrouter.ai/api/v1',
      };

      url = urlMap[host] || '';
    }

    if (!url || !url.startsWith('http')) {
      setAiError(`Configuration error: Could not determine a valid API URL for host '${currentModel.host}'. Check your settings.`);
      setIsAiLoading(false);

      return;
    }

    const openai = new OpenAI({
      apiKey: authHeader ? authHeader.Authorization.split(' ')[1] : '',
      baseURL: url,
      dangerouslyAllowBrowser: true,
    });

    const systemPrompt = `You are an AI assistant that helps users edit their notes. The user will provide their current note in a structured format with frontmatter for title and tags, followed by the content. Your task is to return the full, modified note in the exact same format. You can modify the title, tags, and content based on the user's instruction. Do not add any extra commentary or explanation, only the edited note in the original format.

The format is:
---
title: [The note title]
description: [A brief, one-sentence description of the note's content]
tags: [comma-separated, list, of, tags]
---

[The note content]`;

    const fullNote = formatNoteForLLM(editedTitle, editedDescription, editedTags, editedContent);

    setOriginalContentForDiff(fullNote);

    try {
      const response = await openai.chat.completions.create({
        model: selectedModelId,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Here is my note:\n\n${fullNote}\n\nPlease apply the following instruction: ${finalPrompt}` },
        ],
        stream: false,
      });

      const result = response.choices[0]?.message?.content;

      if (result) {
        setAiSuggestion(result);
        setIsAiEditing(false);
      } else {
        setAiError('Failed to get a response from the AI.');
      }
    } catch (e: any) {
      setAiError(e.message || 'An error occurred.');
    } finally {
      setIsAiLoading(false);
      chrome.runtime.sendMessage({ type: 'AI_EDIT_COMPLETE' });
    }
  }, [config, aiPrompt, editedTitle, editedTags, editedContent]);

  useEffect(() => {
    const handleMessages = (message: { type: string; payload: { tabId: number; prompt: string } }, sender: chrome.runtime.MessageSender, sendResponse: (response?: { success: boolean; error?: string }) => void) => {
      if (message.type === 'TRIGGER_AI_EDIT_ON_NOTE_PAGE' && message.payload.tabId === tabId) {
        const { prompt } = message.payload;

        if (prompt) {
          handleGenerate(prompt);
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: "No prompt provided." });
        }
      }
    };

    chrome.runtime.onMessage.addListener(handleMessages);

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessages);
    };
  }, [handleGenerate, tabId]);

  useEffect(() => {
    if (note) {
      document.title = note.title;
    }
  }, [note]);

  const handleSave = useCallback((contentToSave?: { title: string; content: string; tags: string, url: string, description: string }) => {
    if (!note) return;

    const updatedNote: Note = {
      ...note,
      title: contentToSave ? contentToSave.title : editedTitle,
      description: contentToSave ? contentToSave.description : editedDescription,
      content: contentToSave ? contentToSave.content : editedContent,
      tags: (contentToSave ? contentToSave.tags : editedTags).split(',').map(tag => tag.trim()).filter(Boolean),
      url: contentToSave ? contentToSave.url : editedUrl,
      lastUpdatedAt: Date.now(),
    };

    chrome.runtime.sendMessage({ type: ChannelNames.SAVE_NOTE_REQUEST, payload: updatedNote }, response => {
      if (response.success) {
        setNote(updatedNote);
        setIsEditing(false);
        toast.success('Note saved!');
      } else {
        toast.error(`Error saving note: ${response.error}`);
      }
    });
  }, [note, editedTitle, editedDescription, editedContent, editedTags, editedUrl]);

  const handleCancel = () => {
    if (!note) return;

    setEditedTitle(note.title);
    setEditedDescription(note.description || '');
    setEditedContent(note.content);
    setEditedTags(note.tags?.join(', ') || '');
    setEditedUrl(note.url || '');
    setIsEditing(false);
  };

  const handleAcceptAndSave = () => {
    if (!diffViewerRef.current) return;

    const finalText = diffViewerRef.current.getFinalText();
    const parsedContent = parseLLMResponse(finalText);

    handleSave({
      title: parsedContent.title,
      description: parsedContent.description,
      content: parsedContent.content,
      tags: parsedContent.tags,
      url: editedUrl,
    });

    setAiSuggestion(null);
    setAiPrompt('');
  };

  const handleDeclineAndExit = () => {
    diffViewerRef.current?.declineAll();
    setAiSuggestion(null);
    setAiPrompt('');
    setIsEditing(true);
  };

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (isEditing) {
      if (event.ctrlKey && event.key === 'Enter') {
        handleSave();
      } else if (event.key === 'Escape') {
        handleCancel();
      }
    }
  }, [isEditing, handleSave, handleCancel]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  if (error) {
    return <div className="note-page-container error">Error: {error}</div>;
  }

  if (!note) {
    return <div className="note-page-container">Loading...</div>;
  }

  const remarkPlugins: any[] = [
    [remarkGfm, { singleTilde: false }],
    remarkSupersub,
    remarkWikiLink,
  ];
  const rehypePlugins: any[] = [];

  if (config?.latexEnabled) {
    remarkPlugins.push([remarkMath, { singleDollarTextMath: false }]);
    rehypePlugins.push(rehypeKatex);
  }

  return (
    <Dialog open={isAiEditing} onOpenChange={setIsAiEditing}>
      <div
        className="note-page-container"
        style={{ fontSize: `${fontSize}px` }}
      >
        <Toaster />
        <div className="toolbar">
          <Button size="xs" variant="ghost" onClick={() => setIsEditing(true)}>
            <Pencil />
          </Button>
          <DialogTrigger asChild>
            <Button
              className={cn(isAiEditing && "bg-accent text-accent-foreground")}
              size="xs"
              variant="ghost"
            >
              <Sparkles />
            </Button>
          </DialogTrigger>
          <Button disabled={fontSize <= 10} variant="ghost" onClick={() => setFontSize(s => s - 1)}>-</Button>
          <span>{fontSize}px</span>
          <Button disabled={fontSize >= 32} variant="ghost" onClick={() => setFontSize(s => s + 1)}>+</Button>
        </div>

        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>AI Edit</DialogTitle>
            <DialogDescription>
              Enter an instruction and the AI will rewrite the note.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Textarea
              className="ai-prompt-textarea"
              placeholder="e.g., 'Translate this to French', 'Fix grammar and spelling'"
              value={aiPrompt}
              onChange={e => setAiPrompt(e.target.value)}
            />
            {aiError && <p className="text-red-500 text-sm">{aiError}</p>}
          </div>
          <DialogFooter>
            <Button disabled={isAiLoading || !aiPrompt} onClick={() => handleGenerate()}>
              {isAiLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                'Generate Suggestions'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>

        {aiSuggestion ? (
        <>
          <div className="ai-diff-controls">
            <p className="font-semibold">Reviewing AI Suggestions</p>
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" onClick={handleDeclineAndExit}>Decline</Button>
              <Button size="sm" variant="secondary" onClick={handleAcceptAndSave}>Accept</Button>
            </div>
          </div>
          <GranularDiffViewer
            ref={diffViewerRef}
            newValue={aiSuggestion}
            oldValue={originalContentForDiff}
            onChange={newFormattedContent => {
              const parsed = parseLLMResponse(newFormattedContent);

              setEditedTitle(parsed.title);
              setEditedDescription(parsed.description);
              setEditedTags(parsed.tags);
              setEditedContent(parsed.content);
            }}
          />
        </>
      ) : isEditing ? (
        <div className="note-editor">
          <Input
            className="title-input"
            placeholder="Title"
            value={editedTitle}
            onChange={e => setEditedTitle(e.target.value)}
          />
          <Input
            className="description-input"
            placeholder="Description"
            value={editedDescription}
            onChange={e => setEditedDescription(e.target.value)}
          />
          <Textarea
            className="content-textarea"
            placeholder="Content"
            rows={20}
            value={editedContent}
            onChange={e => setEditedContent(e.target.value)}
          />
          <Input
            className="tags-input"
            placeholder="Tags (comma-separated)"
            value={editedTags}
            onChange={e => setEditedTags(e.target.value)}
          />
          <Input
            className="url-input"
            placeholder="Source URL"
            value={editedUrl}
            onChange={e => setEditedUrl(e.target.value)}
          />
          <div className="edit-buttons">
            <Button onClick={() => handleSave()}>Save (Ctrl+Enter)</Button>
            <Button variant="outline" onClick={handleCancel}>Cancel (Esc)</Button>
          </div>
        </div>
      ) : (
        <div className="note-preview">
          <h1 className="note-title">{note.title}</h1>
          <div className="note-meta">
            {note.description && <p><strong>Description:</strong> {note.description}</p>}
            {note.url && <p><strong>Source:</strong> <a href={note.url} rel="noopener noreferrer" target="_blank">{note.url}</a></p>}
            {note.tags && note.tags.length > 0 && <p><strong>Tags:</strong> {note.tags.join(', ')}</p>}
            <p><strong>Last Updated:</strong> {new Date(note.lastUpdatedAt).toLocaleString()}</p>
          </div>
          <div className="markdown-body">
            <Markdown
              components={noteMarkdownComponents}
              remarkPlugins={remarkPlugins}
              rehypePlugins={rehypePlugins}
            >
              {note.content}
            </Markdown>
          </div>
        </div>
      )}
    </div>
    </Dialog>
  );
};

const styles = `
  body, html, #root {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    background-color: var(--bg);
    color: var(--text);
    font-family: sans-serif;
  }
  .note-page-container {
    max-width: 800px;
    margin: 2rem auto;
    padding: 2rem;
    position: relative;
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1rem;
    position: fixed;
    top: 1rem;
    right: 1rem;
    background: var(--bg);
    padding: 0.5rem;
    border-radius: 5px;
    box-shadow: 0 2px 5px rgba(0,0,0,0.1);
    z-index: 10;
  }
  .ai-prompt-textarea {
    width: 100%;
    background-color: var(--input-background, var(--bg));
    color: var(--text);
    border-color: var(--border);
  }
  .ai-diff-controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    background-color: var(--accent);
    border-radius: 8px;
    margin-bottom: 1rem;
  }
  .note-editor .title-input, .note-editor .description-input, .note-editor .tags-input, .note-editor .url-input, .note-editor .content-textarea {
    width: 100%;
    margin-bottom: 1rem;
    padding: 0.5rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: inherit;
    background-color: var(--input-background, var(--bg));
    color: var(--text);
  }
  .note-editor .content-textarea {
    resize: vertical;
    min-height: 40vh;
  }
  .edit-buttons {
    display: flex;
    gap: 0.5rem;
  }
  .note-preview {
  }
  .note-title {
    color: var(--markdown-h1);
    font-size: 1.5rem;
    font-weight: bold;
    margin: 1rem 0 1rem;
    border-bottom: 2px solid var(--markdown-h1);
    padding-bottom: 0.5rem;
  }
  .note-meta {
    margin-bottom: 1rem;
    color: var(--muted-foreground);
    font-size: 0.9em;
  }
  .note-meta p {
    word-break: break-word;
    overflow-wrap: break-word;
    white-space: pre-wrap;
  }
  .note-meta a {
    color: var(--link);
  }
  .markdown-body {
    line-height: 1.6;
  }
  /* Copied from src/content/index.css */
  .markdown-body h1 {
    color: var(--markdown-h1);
    font-size: 1.5rem;
    font-weight: 800;
    margin: 1rem 0 1rem;
    border-bottom: 2px solid var(--markdown-h1);
    padding-bottom: 0.5rem;
  }
  .markdown-body h2 {
    color: var(--markdown-h2);
    font-size: 1.25rem;
    font-weight: 700;
    margin: 1rem 0 0.75rem;
    border-bottom: 1px solid var(--markdown-h2);
    padding-bottom: 0.4rem;
  }
  .markdown-body h3 {
    color: var(--markdown-h3);
    font-size: 1.1rem;
    font-weight: 600;
    margin: 0.75rem 0 0.5rem;
    border-bottom: 1px dashed var(--markdown-h3);
    padding-bottom: 0.3rem;
  }
  .markdown-body strong {
    color: var(--markdown-strong);
    font-weight: 700;
  }
  .markdown-body em {
    color: var(--markdown-em);
    font-style: italic;
  }
  .markdown-body a {
    color: var(--markdown-link);
    text-decoration: underline;
  }
  .markdown-body ul,
  .markdown-body ol {
    padding-left: 2rem;
    padding-top: 0.5rem;
    padding-bottom: 0.5rem;
  }
  .markdown-body ul {
    list-style-type: disc;
  }
  .markdown-body ol {
    list-style-type: decimal;
  }
  .markdown-body p {
    padding-top: 0.4rem;
    padding-bottom: 0.4rem;
    word-break: break-word;
    overflow-wrap: break-word;
    white-space: pre-wrap;
  }
  .markdown-body pre {
    overflow-x: auto;
    padding: 1rem;
    margin: 0 0;
    background: var(--markdown-pre-background);
    color: var(--markdown-pre-foreground);
    border-radius: 4px;
    max-width: 100%;
    font-family: monospace;
    white-space: pre-wrap;
    word-wrap: break-all;
    display: block;
    text-indent: 0;
  }
  .markdown-body code {
    color: var(--markdown-inline-code-foreground);
    background: var(--markdown-code-background);
    padding: 0.2rem 0.4rem;
    border-radius: 4px;
    font-family: monospace;
    word-wrap: break-word;
    text-indent: 0;
  }
  .markdown-body table {
    border: 2px solid var(--markdown-table-border);
    border-collapse: collapse;
    width: 100%;
  }
  .markdown-body thead {
    background: var(--markdown-thead-background);
    border-bottom: 2px solid var(--markdown-table-border);
    color: var(--markdown-thead-foreground);
  }
  .markdown-body th,
  .markdown-body td {
    padding: 0.5rem;
    border: 1px solid var(--markdown-table-border);
  }
  .markdown-body tr:hover {
    background: rgba(0,0,0,0.05);
  }
  .markdown-body blockquote {
    border-left: 4px solid var(--markdown-h2);
    margin: 1em 0;
    padding: 0.5em 1em;
    background: rgba(0,0,0,0.03);
    color: var(--markdown-h2);
  }
  .markdown-body hr {
    border: none;
    border-top: 1px solid var(--markdown-h2);
    margin: 1.5em 0;
  }
  .markdown-body sub,
  .markdown-body sup {
    font-size: 0.8em;
    line-height: 0;
    position: relative;
    vertical-align: baseline;
  }
  .markdown-body sup {
    top: -0.5em;
  }
  .markdown-body sub {
    bottom: -0.2em;
  }
`;

const styleSheet = document.createElement("style");

styleSheet.innerText = styles;
document.head.appendChild(styleSheet);

const container = document.getElementById('root');
const root = createRoot(container!);

root.render(
  <React.StrictMode>
    <NotePage />
  </React.StrictMode>,
);
