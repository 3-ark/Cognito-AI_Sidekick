![](docs/banner.png)
# Cognito: AI-Powered Web Notes Assistant 🚀

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub version](https://img.shields.io/github/v/release/3-ark/Cognito)](https://github.com/3-ark/Cognito-AI_Sidekick/releases/latest)

Cognito is your intelligent browser companion — combining RAG, TTS/STT, note-taking, and customizable personas into a sleek sidebar assistant. Now with hybrid retrieval using **BM25 + semantic embeddings**!

---

## ✨ Features

* **Customizable UI**: Includes theme options and a redesigned, two-tab settings layout.
### 🖱️ One-Click Note Capture

* **Right-click any page** to instantly add it to your notes.
* Automatically captures title, URL, and context.
* Uses AI to clean and structure the content.

### 👨 **Persona Support** & **Model Selection**
* Pick your assistant style and model from the header.

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
* **Hybrid RAG**: Combine classic BM25 scores with semantic embeddings (private); weight-adjustable for optimal retrieval.
* **Note System** & **Chat History**: Save, organize, and retrieve past conversations effortlessly.

---

## 🔧 How Hybrid RAG Works

1. **BM25 Search** retrieves document chunks based on keywords.
2. **Semantic Embeddings** (only available in private/dev builds) score based on meaning.
3. **Score Fusion**:

   ```
   final_score = α * BM25_score + (1 – α) * semantic_score
   ```
4. Top-ranked chunks are fed into the assistant as context.

You control `α` to balance keyword precision vs. semantic understanding.

---

## ⚙️ Setup & Usage

### 0. Chrome Webstore
Search for `Cognito - AI Sidekick`

### 1. Install

Clone and install dependencies:

```bash
git clone https://github.com/3-ark/Cognito-AI_Sidekick.git
cd Cognito-AI_Sidekick
npm install
```

### 2. Load in Chrome

* Enable *Developer mode* in `chrome://extensions`
* Click **Load unpacked** and select the `dist/` folder

### 3. Configure

* **General tab**: Choose your model and persona
* **Assistant Memory tab**:

  * Manage notes
  * Rebuild RAG index
  * Adjust BM25/semantic weights
  * View or clear chat history

### 4. Start Chatting

* Model & persona visible in the chat header
* Switch models with a dropdown
* Use normal messages or data-related queries — RAG kicks in automatically

---

## 🔁 Rebuilding the RAG Index

Whenever you:

* Add/remove notes
* Change fusion weights
* Modify indexing settings

Use **Rebuild Index** in the settings to reprocess everything.

---

## 📁 Note System & Chat History

* Save snapshots and highlights as notes
* Retrieve notes in chat with `@note_title`
* Review, search, or wipe history as needed
* Export your notes as markdown with yaml. Ready for obsidian.

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
*   **Connect to Local LLM:** If you have Ollama running with a model like Llama3, go to Cognito's settings, select Ollama, enter your model details (e.g., `http://localhost:11434` and model name `llama3`), and start chatting with your local AI.
*   **Save Notes:** During a chat, if the AI provides a useful snippet or you want to remember a key piece of information, click the "Add to Note" button (or a similar function) to save it for later reference within Cognito's notes feature.

## 🗺️ Roadmap

*   Ongoing bug fixes and performance improvements.
*   Evaluation and integration of community pull requests.
*   **Enhanced Agent Capabilities:**
    *   ~"Memory" for chat history with RAG (Retrieval Augmented Generation) and semantic search.~
    *   ~Autonomously invoke internal tools (like ~“save note”~, “search note”, “summarize page”) without switching modes. Here’s how to pull it off: Adding a small tool-invoking agent layer; Capturing tool-friendly intent (few-shot or system prompt); Internally calling functions when confidence is high.~
    *   Better websearch with [Deepsearch](https://github.com/google-gemini/gemini-fullstack-langgraph-quickstart)
    *   "Short-term Memory" (state management) for multi-step tasks within the same context (e.g., web search followed by page parsing and comparison). Note would be used for this.
    *   Direct text editing/interaction on web pages via the side panel – extending Cognito towards an "AI agent" experience.
*   Improved local TTS/STT integration (e.g., exploring options like [KokoroJS](https://github.com/hexgrad/kokoro/tree/main/kokoro.js) and even 0 shot voice generation chatterbox, try it on [huggingface](https://huggingface.co/spaces/ResembleAI/Chatterbox).)
*   Potential support for image and voice API interactions for multimodal capabilities.
*   Task planning (`plan`, `remindMe`)
*   Timeline view for notes
*   Local-first note editor


*(This section will be regularly updated based on project progress)*

## 🤝 Contributing

Contributions are welcome! If you'd like to help improve Cognito, please:

1.  Fork the repository.
2.  Create a new branch for your feature or bug fix: `git checkout -b feature/your-feature-name` or `bugfix/issue-number`.
3.  Make your changes.
4.  Ensure your code lints (e.g., `npm run lint` if a lint script is configured) and builds correctly (`npm start`).
5.  Push your branch to the remote repository. The `-u` flag links it for future pushes.
    ```bash
    git push -u origin feature/your-feature-name
    ```
6.  Submit a pull request with a clear description of your changes.

*(Consider adding details on coding style, development setup, or linking to a dedicated CONTRIBUTING.md file if one is created in the future.)*

## 🙏 Acknowledgments

*   Cognito was originally built upon and inspired by [sidellama](https://github.com/gyopak/sidellama).
*   Inspiration and ideas from projects like Stanford's [WikiChat](https://github.com/stanford-oval/WikiChat), [StreamingKokoroJS](https://github.com/rhulha/StreamingKokoroJS), [WebAgent](https://github.com/Alibaba-NLP/WebAgent), [chatterbox](https://github.com/resemble-ai/chatterbox), [kokoro and kokoro.js](https://github.com/hexgrad/kokoro/tree/main/kokoro.js) and the [piper-browser-extension](https://github.com/ken107/piper-browser-extension).
*   Thanks to all the developers of the open-source libraries and tools that make Cognito possible.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
