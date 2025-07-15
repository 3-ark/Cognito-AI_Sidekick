declare module 'wink-nlp-utils' {
  namespace string {
    function removeHTMLTags(text: string): string;
    function removeExtraSpaces(text: string): string;
    function stem(word: string): string;
    function removePunctuations(text: string): string;
    function lemma(word: string): string;
  }

  export { string };
}
