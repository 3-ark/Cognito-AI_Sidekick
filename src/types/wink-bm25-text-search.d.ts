// Basic type declaration for 'wink-bm25-text-search' to satisfy TypeScript
// and resolve TS7016 error. This can be expanded later for better type safety if needed.

declare module 'wink-bm25-text-search' {
  // The module exports a factory function that returns the engine instance.
  // The engine instance has various methods like defineConfig, addDoc, search etc.
  // For now, we'll type the factory and its return as 'any' for simplicity.

  interface BM25Engine {
    defineConfig(config: any): boolean;
    definePrepTasks(tasks: Array<(text: string) => string[]>): number; // Assuming tasks take string and return string array
    addDoc(doc: { [key: string]: string }, id: string | number): number;
    consolidate(fp?: number): boolean;
    search(text: string, limit?: number, filter?: (fieldValues: any, params: any) => boolean, params?: any): Array<[string | number, number]>;
    reset(): boolean;
    // Add other methods if needed: exportJSON, importJSON, getDocs, getTokens, getConfig, etc.
    learn(doc: { [key: string]: string }, id: string | number): number; // Alias for addDoc
    predict(text: string, limit?: number, filter?: (fieldValues: any, params: any) => boolean, params?: any): Array<[string | number, number]>; // Alias for search
    // The following are also available based on the source, but might not be directly used by our current implementation
    // getDocs(): any;
    // getTokens(): any;
    // getConfig(): any;
    // getIDF(): any;
    // getTotalCorpusLength(): number;
    // getTotalDocs(): number;
    // exportJSON(): string;
    // importJSON(json: string): boolean;
  }

  function winkBM25Factory(): BM25Engine;

  export default winkBM25Factory;
}
