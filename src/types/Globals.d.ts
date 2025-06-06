declare module '*.module.css';

interface FileSystemHandle {
  kind: 'file' | 'directory';
  name: string;
}

interface FileSystemFileHandle extends FileSystemHandle {
  kind: 'file';
  getFile(): Promise<File>;
}

interface FilePickerOptions {
  types?: Array<{
    description?: string;
    accept: Record<string, string | string[]>;
  }>;
  multiple?: boolean;
  excludeAcceptAllOption?: boolean;
  id?: string;
  startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos' | FileSystemHandle;
}

interface Window {
  showOpenFilePicker?(options?: FilePickerOptions): Promise<FileSystemFileHandle[]>;
}

declare const APP_VERSION: string;
