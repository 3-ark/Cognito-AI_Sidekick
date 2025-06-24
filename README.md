![](docs/banner.png)
# Cognito: AI-Powered Web Notes Assistant 🚀

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub version](https://img.shields.io/github/v/release/3-ark/Cognito)](https://github.com/3-ark/Cognito/releases/latest)

**Cognito A lightweight yet powerful Chrome extension and assistant system that combines LLM tools, web search, a smart note-taking workflow, and interact naturally with web content. - designed for effortless research, contextual memory, and semantic search (coming soon).**

<!-- Optional: Add a slightly larger, more engaging screenshot or GIF here if available. docs/screenshot.png is good. -->
![](docs/web.gif) ![](docs/local.gif) 


---

## ✨ Features

### 🖱️ One-Click Note Capture

* **Right-click any page** to instantly add it to your notes.
* Automatically captures title, URL, and context.
* Uses AI to clean and structure the content.

### 🔎 Smart Web & Wiki Search

* AI chooses **semantic keywords** for Wikipedia or full web search.
* Automatically summarizes results or extracts key content.
* Use inside chat, or directly trigger via tools.

### 💾 Structured Note System

* Notes include:

  * `title`, `content`, `tags`, `url`, and `id`
* Supports **Markdown with YAML frontmatter** for easy export.
* Great for syncing with Obsidian or static site knowledge bases.

### 🛠️ Tool-Based LLM Interaction

* Uses tools like:

  * `saveNote`
  * `updateMemory`
  * `searchWeb`
* Responses are structured in **pure JSON**, enabling predictable parsing and automation.
* System prompts enforce tool discipline per persona.

### 🧠 Memory & Context Engine

* Short- and long-term memory support via `updateMemory`.
* Auto-injects parsed web page content for interactive Q\&A.
* Future-proofed for RAG/vector integration.

---

## 🧩 Architecture Overview

```
[User Interaction]
     ↓
[Chat UI / Page UI]
     ↓
[LLM + Personas]
     ↓                ↘
[Tool Call JSON]   [Page Context Parser]
     ↓                ↓
[Tool Engine] ← [Web Scraper / Wiki Search]
     ↓
[Note System + Memory Manager]
```

---

## 🧙‍♂️ Personas

Each persona defines an LLM **policy** and **tool behavior**. For example:

* 🧠 `strictJsonAgent`: Only uses tools, outputs raw JSON, never explains.
* 🔍 `researchAssistant`: Uses `searchWeb` intelligently, stores structured summaries.
* 🗃️ `memoryCurator`: Organizes long-term memory, updates facts via `updateMemory`.

---

## 🚀 Getting Started

### Prerequisites

*   Google Chrome

### Installation

#### Option 1: From Chrome Web Store (Recommended for most users)
*   Install from the [Chrome Web Store](https://chromewebstore.google.com/detail/pphjdjdoclkedgiaahmiahladgcpohca?utm_source=item-share-cb).

#### Option 2: From Release (Manual Install)
1.  Download the latest file from the [Releases page](https://github.com/3-ark/Cognito/releases).
2.  Extract the downloaded ZIP file to a permanent folder on your computer.
3.  Open Chrome and navigate to `chrome://extensions`.
4.  Enable **Developer mode** using the toggle in the top-right corner.
5.  Click the **Load unpacked** button.
6.  Select the folder where you extracted the ZIP file.

#### Option 3: From Source (For Developers)
1.  Clone the repository:
    ```bash
    git clone https://github.com/3-ark/Cognito.git
    cd Cognito
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Build the extension:
    ```bash
    npm start
    ```
    This will generate the bundled extension in the `dist/chrome` folder.
4.  Open Chrome and navigate to `chrome://extensions`.
5.  Enable **Developer mode**.
6.  Click **Load unpacked** and select the `dist/chrome` folder.

---

## 📦 Exports

Each note is exported as:

```yaml
---
title: "Understanding Transformers"
tags: ["AI", "LLM", "Deep Learning"]
url: "https://example.com/article"
id: "note-xyz123"
---

Transformers are a deep learning architecture...
```


---

## 🛠️ How It Works

Cognito is a Chrome extension built with a modular architecture:

*   **Side Panel (React & Redux):** The main user interface where you interact with the AI, manage settings, and view results. Built with React for a dynamic experience and Redux (via `webext-redux`) for robust state management.
*   **Background Script:** The engine of the extension. It handles communication with AI services, manages long-running tasks, injects content scripts, and coordinates actions across the extension.
*   **Content Scripts:** Injected into web pages to securely access and relay page content (text, HTML) to the Side Panel and Background Script for processing by the AI.

This setup allows Cognito to understand the context of your browsing and provide relevant AI assistance without leaving your current tab.

## 💻 Technology Stack

*   **React:** For building the interactive Side Panel UI.
*   **TypeScript:** For robust and maintainable code.
*   **Redux & `webext-redux`:** For state management across the extension components.
*   **Tailwind CSS:** For styling the user interface.
*   **Webpack:** For bundling the extension.
*   Various UI libraries (Radix UI components like `@radix-ui/react-accordion`, `lucide-react` for icons) for a polished look and feel.


## 📖 Usage Examples

*   **Summarize a News Article:** Open a lengthy article, open the Cognito side panel, and click "Summarize Page" or type "Summarize this page."
*   **Ask About Page Content:** While viewing a complex technical document, select a confusing paragraph and ask Cognito, "Explain this selected text in simpler terms."
*   **Perform Deep Research:** Use a Persona like "Ein (Academic Researcher)" and a "Medium" or "High" Computation Level to ask, "What are the latest advancements in renewable energy storage and their potential impacts?" Cognito can perform web searches and synthesize information.
*   **Connect to Local LLM:** If you have Ollama running with a model like Llama3, go to Cognito's settings, select Ollama, enter your model details (e.g., `http://localhost:11434` and model name `llama3`), and start chatting with your local AI.
*   **Save Notes:** During a chat, if the AI provides a useful snippet or you want to remember a key piece of information, click the "Add to Note" button (or a similar function) to save it for later reference within Cognito's notes feature.

## ⚙️ Configuration

*   **Connecting to AI Models:** Access the settings panel to configure connections to various supported LLMs (OpenAI, Gemini, Ollama, Groq, OpenRouter, Custom). You'll typically need API keys for cloud services or endpoint URLs for local models.
*   **Choosing Personas:** Select from available personas (Ein: Academic researcher, Warren: Business analyst, Jet: Friendly assistant, Agatha: Creative thinker, Jan: Strategist, Sherlock: Detective, Spike: All-around assistant) to tailor the AI's tone and expertise, or create your own.
*   **TTS Settings:** Configure text-to-speech options, including browser-based TTS or integration with external services like Piper (via compatible extensions).
*   **Theme Customization:** Personalize the appearance of the side panel.

## 🗺️ Roadmap

*   Ongoing bug fixes and performance improvements.
*   Evaluation and integration of community pull requests.
*   **Enhanced Agent Capabilities:**
    *   "Memory" for chat history with RAG (Retrieval Augmented Generation) and semantic search.
    *   Autonomously invoke internal tools (like ~“save note”~, “search note”, “summarize page”) without switching modes. Here’s how to pull it off: Adding a small tool-invoking agent layer; Capturing tool-friendly intent (few-shot or system prompt); Internally calling functions when confidence is high.
    *   Better websearch with [Deepsearch](https://github.com/google-gemini/gemini-fullstack-langgraph-quickstart)
    *   "Short-term Memory" (state management) for multi-step tasks within the same context (e.g., web search followed by page parsing and comparison). Note would be used for this.
    *   Direct text editing/interaction on web pages via the side panel – extending Cognito towards an "AI agent" experience.
*   Improved local TTS/STT integration (e.g., exploring options like [KokoroJS](https://github.com/hexgrad/kokoro/tree/main/kokoro.js) and even 0 shot voice generation chatterbox, try it on [huggingface](https://huggingface.co/spaces/ResembleAI/Chatterbox).)
*   Potential support for image and voice API interactions for multimodal capabilities.
*   Task planning (`plan`, `remindMe`)
*   Timeline view for notes
*   Local-first note editor

---
* **task outline for building RAG + memory integration** based on my current design with `note` (short-term memory) and `note system` (long-term searchable notes).

## 🧩 **PHASE 1: Foundation - Memory Layers + Indexing**

### ✅ 1. **Solidify Data Layers**

* [x] Confirm schema for:

  * `note` (live memory)
  * `note system` (archived knowledge base)
* [x] Ensure `note system` entries have:

  * `id`, `title`, `content`, `created`, `tags`
  * `embedding` (Float32Array), or deferred embedding
* [x] Track whether a note has already been embedded/indexed

---

## 📦 **PHASE 2: RAG Indexing (Hybrid Search)**

### ✅ 2. **BM25 Engine (keyword search)**

* [X] Build or plug in a BM25 scorer (your own or `MiniSearch`)
* [X] Tokenize `note system` content (can use your tokenizer or wink-nlp)
* [ ] Score/query notes using BM25 at search time

### ✅ 3. **Semantic Embedding + Cosine Similarity**

* [ ] Use `@xenova/transformers` to embed:

  * Each `note system` entry once
  * Each user query at runtime
* [ ] Store embeddings in LocalForage alongside note ID
* [ ] On query, compare query embedding to all stored vectors

  * Use cosine similarity
  * Return top-K

### ✅ 4. **Hybrid Fusion**

* [ ] Implement score fusion:

  * Normalize BM25 + vector scores
  * Combine: `finalScore = α * bm25 + (1 - α) * vector`
  * Or use Reciprocal Rank Fusion (RRF)

---

## 💡 **PHASE 3: Context Construction (RAG Assembly)**

### ✅ 5. **Context Builder**

* [ ] Deduplicate overlapping results (BM25 and vector)
* [ ] Chunk or truncate large notes to fit LLM context
* [ ] Package selected top results as `ragContext[]`

---

## 🧠 **PHASE 4: Note Mode Integration (Short-Term Memory)**

### ✅ 6. **`note` Integration for Chat Context**

* [x] Inject live `note` into every chat context as memory
* [x] Style/label this separately from RAG-based retrievals

---

## 📥 **PHASE 5: Archiving / Promoting Notes**

### ✅ 7. **Archive Path: `note` → `note system`**

* [x] Add “Archive to Note System” button in UI
* [ ] When archiving:

  * Trigger embedding generation
  * Add to BM25 index and vector store

---

## 🔍 **PHASE 6: Search Tooling (Optional UI Enhancements)**

* [ ] Add search bar to test hybrid search (notes only)
* [ ] Display search scores for debugging
* [ ] Add filters (by tag/date) to restrict RAG input

---

## ⚡ **PHASE 7: Optimization + Scalability (Optional, Later)**

* [ ] Add GPU acceleration (WebGPU)
* [ ] Shard large note sets (if >20k)
* [ ] Implement incremental embedding updates
* [ ] Add embedding model selection
* [ ] Cache common queries

---

## 🧪 Dev Tip: Test Stages in Isolation

Test each module independently:

1. Search query → BM25 result ✅
2. Query → embedding → cosine results ✅
3. Fusion logic ✅
4. Final context builder ✅
5. Inject into LLM/chat ✅

---

## ✅ You're Building:

| Component     | Purpose                             |
| ------------- | ----------------------------------- |
| `note`        | live memory, always-injected        |
| `note system` | long-term searchable memory         |
| Hybrid search | fast + accurate retrieval           |
| RAG engine    | builds best context on demand       |
| Archive path  | user-controlled knowledge promotion |

---

*(This section will be regularly updated based on project progress)*

## 🤝 Contributing

Contributions are welcome! If you'd like to help improve Cognito, please:

1.  Fork the repository.
2.  Create a new branch for your feature or bug fix: `git checkout -b feature/your-feature-name` or `bugfix/issue-number`.
3.  Make your changes.
4.  Ensure your code lints (e.g., `npm run lint` if a lint script is configured) and builds correctly (`npm start`).
5.  Submit a pull request with a clear description of your changes.

*(Consider adding details on coding style, development setup, or linking to a dedicated CONTRIBUTING.md file if one is created in the future.)*

## 🙏 Acknowledgments

*   Cognito was originally built upon and inspired by [sidellama](https://github.com/gyopak/sidellama).
*   Inspiration and ideas from projects like Stanford's [WikiChat](https://github.com/stanford-oval/WikiChat), [highCompute.py](https://github.com/AlexBefest/highCompute.py) by AlexBefest, [StreamingKokoroJS](https://github.com/rhulha/StreamingKokoroJS), [WebAgent](https://github.com/Alibaba-NLP/WebAgent), [chatterbox](https://github.com/resemble-ai/chatterbox), [kokoro and kokoro.js](https://github.com/hexgrad/kokoro/tree/main/kokoro.js) and the [piper-browser-extension](https://github.com/ken107/piper-browser-extension).
*   Thanks to all the developers of the open-source libraries and tools that make Cognito possible.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
