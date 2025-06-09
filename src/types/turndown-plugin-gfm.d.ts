declare module 'turndown-plugin-gfm' {
  import { Plugin as TurndownPlugin } from 'turndown';

  export const gfm: TurndownPlugin[];
  export const tables: TurndownPlugin;
  export const strikethrough: TurndownPlugin;
  export const taskListItems: TurndownPlugin;
  export const highlightedCodeBlock: TurndownPlugin;
}
