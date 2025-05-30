![](docs/banner.png)
# Cognito: Your AI Sidekick for Chrome 🚀

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub version](https://img.shields.io/github/v/release/3-ark/Cognito)](https://github.com/3-ark/Cognito/releases/latest)

**Cognito supercharges your Chrome browser with AI, acting as your intelligent sidekick to interpret your needs, guide your browsing, query information, and interact naturally with web content.**

<!-- Optional: Add a slightly larger, more engaging screenshot or GIF here if available. docs/screenshot.png is good. -->
![](docs/web.gif) ![](docs/local.gif) 


## ✨ Core Features

*   **Seamless AI Integration:** Connect to a wide array of powerful AI models:
    *   **Local Models:** Ollama, LM Studio
    *   **Cloud Services:** OpenAI (ChatGPT), Gemini, Groq, OpenRouter
    *   **Custom Connections:** Configure custom model endpoints.
*   **Intelligent Content Interaction:**
    *   **Instant Summaries:** Get the gist of any webpage in seconds.
    *   **Contextual Q&A:** Ask questions about the current page, PDFs, or selected text.
    *   **Smart Web Search:** Conduct context-aware searches using Google, DuckDuckGo, and Wikipedia, with the ability to fetch and analyze content from search results.
*   **Personalized Experience:**
    *   **Customizable Personas:** Choose from 7 pre-built AI personalities (Researcher, Strategist, etc.) or create your own.
    *   **Computation Levels:** Adjust AI's problem-solving approach from quick answers (Low) to multi-step task decomposition (Medium, High) for complex queries. *(Beta: Note token usage - High Compute can use 100-150x more tokens than Low Compute.)*
    *   **Themes & Appearance:** Customize the look and feel.
*   **Productivity Boosters:**
    *   **Note Taking:** Save context, chat snippets, and important information directly within the side panel.
    *   **Text-to-Speech (TTS):** Hear AI responses read aloud (supports browser TTS and integration with external services like Piper).
    *   **Chat History:** Keep track of your interactions.
*   **Developer-Friendly:** Built with a modern tech stack, open-source, and ready for contributions.

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

## 📖 Usage Examples

*   **Summarize a News Article:** Open a lengthy article, open the Cognito side panel, and click "Summarize Page" or type "Summarize this page."
*   **Ask About Page Content:** While viewing a complex technical document, select a confusing paragraph and ask Cognito, "Explain this selected text in simpler terms."
*   **Perform Deep Research:** Use a Persona like "Ein (Academic Researcher)" and a "Medium" or "High" Computation Level to ask, "What are the latest advancements in renewable energy storage and their potential impacts?" Cognito can perform web searches and synthesize information.
*   **Connect to Local LLM:** If you have Ollama running with a model like Llama3, go to Cognito's settings, select Ollama, enter your model details (e.g., `http://localhost:11434` and model name `llama3`), and start chatting with your local AI.
*   **Save Notes:** During a chat, if the AI provides a useful snippet or you want to remember a key piece of information, click the "Add to Note" button (or a similar function) to save it for later reference within Cognito's notes feature.

## ⚙️ Configuration

*   **Connecting to AI Models:** Access the settings panel to configure connections to various supported LLMs (OpenAI, Gemini, Ollama, Groq, OpenRouter, Custom). You'll typically need API keys for cloud services or endpoint URLs for local models.
*   **Choosing Personas:** Select from available personas (Ein: Academic researcher, Warren: Business analyst, Jet: Friendly assistant, Agatha: Creative thinker, Jan: Strategist, Sherlock: Detective, Spike: All-around assistant) to tailor the AI's tone and expertise, or create your own.
*   **Adjusting Computation Levels:** Experiment with Low (direct query for simple questions), Medium (single-level task decomposition for moderately complex queries), and High (two-level task decomposition for highly complex tasks) computation levels. Be mindful of increased token usage (High Compute can use 100-150x more tokens) and processing time with higher levels. This feature is in beta.
*   **TTS Settings:** Configure text-to-speech options, including browser-based TTS or integration with external services like Piper (via compatible extensions).
*   **Theme Customization:** Personalize the appearance of the side panel.

## 🗺️ Roadmap

*   Ongoing bug fixes and performance improvements.
*   Evaluation and integration of community pull requests.
*   **Enhanced Agent Capabilities:**
    *   "Memory" for chat history with RAG (Retrieval Augmented Generation) and semantic search.
    *   Better websearch with [WebDancer](https://github.com/Alibaba-NLP/WebAgent/tree/main/WebDancer)
    *   "Short-term Memory" (state management) for multi-step tasks within the same context (e.g., web search followed by page parsing and comparison).
    *   Direct text editing/interaction on web pages via the side panel – extending Cognito towards an "AI agent" experience.
*   Improved local TTS/STT integration (e.g., exploring options like [KokoroJS](https://github.com/hexgrad/kokoro/tree/main/kokoro.js) and even 0 shot voice generation chatterbox, try it on [huggingface](https://huggingface.co/spaces/ResembleAI/Chatterbox).)
*   Potential support for image and voice API interactions for multimodal capabilities.
*   Add some shortcuts like modes shifting, cancel editing or saving editing.
*   Add stop to "isloading" icon

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
