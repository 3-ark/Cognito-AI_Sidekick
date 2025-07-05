Find the latest realease and full changelog here [Cognito - AI Sidekick](https://github.com/3-ark/Cognito-AI_Sidekick/releases).

## [3.8.4] - 2024-07-05

The initial hybrid RAG is set up, which retrieves BM25+Semantic search results based on weight average score for the chat history and notes. I hope it can maintain a fast processing speed for more than 10K~50k notes/chats. For a lightweigh chrome extension, this is more than enough. This new function needs to be polished before it looks great. But it's working properly now. You should start embedding manually from the RAG Settings in Configuration


*   **Notes & Search:**
    *   You can now **import various file types** (PDF, MD, TXT, HTML) into notes.
    *   **Notes can be directly injected into chat context** using '@'.
    *   **Hovercard previews for notes are enhanced**, handling large text files better and dynamically resizing.
    *   Improved **ObsidianMD support** for importing and exporting notes.
    *   **Bulk export of notes** to a zip file is now possible.
*   **Tool Usage & AI Behavior:**
    *   **Now you can switch off the tool use in the popover notes on the input bar**
    *   When an assistant uses a tool, you'll now **only see the tool's output and the assistant's follow-up**, not the tool call message itself (though it's still indexed and exportable).
    *   Fixes were implemented for **multiturn tool calls**.
*   **User Interface & Stability:**
    *   Various **bug fixes** related to chat history search, note operations, and indexing have been implemented.
