Find the latest realease and full changelog here [Cognito - AI Sidekick](https://github.com/3-ark/Cognito-AI_Sidekick/releases).

## [3.7.10-3.8.3] - 2024-07-03

The main focus has been on **improving note management and search capabilities**, along with **refining tool usage**.

Here's a concise summary:

*   **Notes & Search:**
    *   You can now **import various file types** (PDF, MD, TXT, HTML) into notes.
    *   **Notes can be directly injected into chat context** using '@'.
    *   **Hovercard previews for notes are enhanced**, handling large text files better and dynamically resizing.
    *   **BM25 indexing for search** has been added for chat history and notes, improving search results (primarily for English/Romance languages).
    *   Better integration of **chat history and notes into the retriever** for RAG (Retrieval Augmented Generation).
    *   Improved **ObsidianMD support** for importing and exporting notes.
    *   **Bulk export of notes** to a zip file is now possible.
*   **Tool Usage & AI Behavior:**
    *   **Tool call prompts have been optimized** to be less aggressive, preventing unnecessary tool calls (e.g., for simple greetings).
    *   A **simple switch for tool use** has been added to popover notes.
    *   When an assistant uses a tool, you'll now **only see the tool's output and the assistant's follow-up**, not the tool call message itself (though it's still indexed and exportable).
    *   Fixes were implemented for **multiturn tool calls**.
*   **User Interface & Stability:**
    *   RAG settings now have **tooltips** and an improved UI, with more parameters controllable.
    *   Various **bug fixes** related to chat history search, note operations, and indexing have been implemented.
    *   Better logging and feedback for note operations.

In essence, it's about making notes more accessible, searchable, and integrated, while making the AI's tool use smarter and less intrusive.