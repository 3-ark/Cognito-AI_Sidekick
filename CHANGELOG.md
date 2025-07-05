Find the latest release and full changelog here [Cognito - AI Sidekick](https://github.com/3-ark/Cognito-AI_Sidekick/releases).

## [3.8.4] - 2024-07-05

The initial *hybrid RAG* is set up, which retrieves BM25+Semantic search results based on weight average score for the chat history and notes. I hope it can maintain a fast processing speed for more than 10K~50k notes/chats in the future. For a lightweight chrome extension, this is more than enough. This new function needs to be polished before it looks great, like the citation is just too long and without a format. But it's working properly with **some extra attention.** Before I bump the version to 3.9.0, you can see this as testing, so any bug report is welcome.

**How to use RAG**:
1. Go to RAG Settings panel in Configuration. 
2. Set your favorite embedding models (better start it before embedding).
3. Start embedding manually from the RAG Settings in Configuration by clicking on rebuild embedding button for the first time.
4. BM25 indexing will happen automatically, but you can rebuild it anyway.
5. Update embedding is needed when you are in manual mode. Auto model needs you keep your local embedding model mounted with your LLM if you are running  a local llm. So it affects the generation speed. For API it will cost more because you won't want everything to be embedded normally. 
6. You are all set now. In the input bar, type '/r [your query]', then your LLM will return response with retrieved context. *Note: you have to use the same embedding model in this step, and you have to keep it running with LLM you use for generation.*


*   **Notes & Search:**
    *   You can now **import various file types** (PDF, MD, TXT, HTML) into notes.
    *   **Notes can be directly injected into chat context** using '@'.
    *   **Hovercard previews for notes are enhanced**, handling large text files better and dynamically resizing. You can put your novel, your long document inside.
    *   Improved **ObsidianMD support** for importing and exporting notes.
    *   **Bulk export of notes** to a zip file is now possible.
*   **Tool Usage & AI Behavior:**
    *   **Now you can switch off the tool use in the popover notes on the input bar**
    *   When an assistant uses a tool, you'll now **only see the tool's output and the assistant's follow-up**, not the tool call message itself (though it's still indexed and exportable).
    *   Fixes were implemented for **multi-turn tool calls**.
*   **User Interface & Stability:**
    *   Various **bug fixes** related to chat history search, note operations, and indexing have been implemented.
