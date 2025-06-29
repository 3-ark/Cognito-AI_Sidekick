// Type declaration for 'wink-bm25-text-search'

declare module 'wink-bm25-text-search' {
  // Define the shape of the object returned by the factory
  // This includes all methods that are actually used by our SearchService.
  interface WinkBM25FactoryReturn {
    defineConfig(config: any): boolean;
    definePrepTasks(tasks: Array<(text: string) => string[]>): number;
    addDoc(doc: { [key: string]: string }, id: string | number): number;
    consolidate(fp?: number): boolean;
    search(text: string, limit?: number, filter?: (fieldValues: any, params: any) => boolean, params?: any): Array<[string | number, number]>;
    reset(): boolean;
    exportJSON(): string;
    importJSON(json: string): boolean;
    // Aliases used in the library source
    learn(doc: { [key: string]: string }, id: string | number): number; // Alias for addDoc
    predict(text: string, limit?: number, filter?: (fieldValues: any, params: any) => boolean, params?: any): Array<[string | number, number]>; // Alias for search
    // Add other methods like getDocs, getTokens etc. if they become necessary for full typing
    // getDocs(): any;
    // getTokens(): any;
    // getConfig(): any;
    // getIDF(): any;
    // getTotalCorpusLength(): number;
    // getTotalDocs(): number;
  }

  // Declare the factory function itself as the default export
  function winkBM25Factory(): WinkBM25FactoryReturn;
  export default winkBM25Factory;
}
