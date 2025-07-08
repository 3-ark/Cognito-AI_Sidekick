Find the latest release and full changelog here [Cognito - AI Sidekick](https://github.com/3-ark/Cognito-AI_Sidekick/releases).

## [3.8.6] - 2024-07-11

Prepare the new UI/UX for new functions, refine the welcome modal and quick guide.

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
