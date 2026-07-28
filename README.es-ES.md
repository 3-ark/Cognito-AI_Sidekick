![](docs/banner.png)
# Cognito: Asistente Web de Notas Impulsado por IA 🚀

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub version](https://img.shields.io/github/v/release/3-ark/Cognito)](https://github.com/3-ark/Cognito-AI_Sidekick/releases/latest)

Cognito es tu compañero de navegador inteligente: combina RAG, TTS/STT, toma de notas y personas personalizables en un elegante asistente de barra lateral. Ahora con recuperación híbrida utilizando **BM25 + embeddings semánticos**, **Orquestación de Herramientas** y **Servidores MCP**.

---

## ✨ Características

* **UI Personalizable**: Incluye opciones de temas y un diseño de configuración rediseñado de dos pestañas.
### 🖱️ Captura de Notas en un Clic

* **Haz clic derecho en cualquier página** para agregarla instantáneamente a tus notas.
* Captura automáticamente el título, la URL y el contexto.
* Utiliza IA para limpiar y estructurar el contenido.

### 👨 **Soporte de Personas** y **Selección de Modelo**
* Elige el estilo de tu asistente y el modelo desde el encabezado.

### 🔎 Búsqueda Inteligente en Web y Wiki

* La IA elige **palabras clave semánticas** para Wikipedia o búsquedas web completas.
* Resume automáticamente los resultados o extrae el contenido clave.
* Úsalo dentro del chat o actívalo directamente a través de herramientas.

### 💾 Sistema de Notas Estructurado

* Las notas incluyen:

  * `title`, `content`, `tags`, `url`, e `id`
* Soporta **Markdown con YAML frontmatter** para una exportación sencilla.
* Ideal para sincronizar con Obsidian o bases de conocimientos de sitios estáticos.

### 🛠️ Interacción con LLM Basada en Herramientas

* Utiliza herramientas como:

  * `Save Note`
  * `UpdateMemory`
  * `Web Search`
  * `Planner`
 etc.

* Las respuestas están estructuradas en **JSON puro**, lo que permite un análisis y automatización predecibles.
* Los prompts del sistema imponen la disciplina de herramientas según la persona.
* 9 herramientas nativas más herramientas MCP que puedes añadir.

### 🧠 Motor de Memoria y Contexto

* Soporte de memoria a corto y largo plazo mediante `updateMemory`.
* Inyecta automáticamente el contenido analizado de la página web para preguntas y respuestas interactivas.
* **RAG Híbrido**: Combina puntuaciones clásicas de BM25 con embeddings semánticos (privados); peso ajustable para una recuperación óptima.
* **Sistema de Notas** e **Historial de Chat**: Guarda, organiza y recupera conversaciones pasadas sin esfuerzo.

---

## 🔧 Cómo funciona el RAG Híbrido

1. La **Búsqueda BM25** recupera fragmentos de documentos basados en palabras clave.
2. Los **Embeddings Semánticos** (solo disponibles en versiones privadas/dev) puntúan basándose en el significado.
3. **Fusión de Puntuaciones**:

   ```
   final_score = α * BM25_score + (1 – α) * semantic_score
   ```
4. Los fragmentos mejor rankeados se envían al asistente como contexto.

Tú controlas `α` para equilibrar la precisión de las palabras clave frente a la comprensión semántica.

---

## ⚙️ Configuración y Uso

### 0. Chrome Webstore
Busca `Cognito - AI Sidekick`

### 1. Instalación

Clona e instala las dependencias:

```bash
git clone https://github.com/3-ark/Cognito-AI_Sidekick.git
cd Cognito-AI_Sidekick
npm install
```

### 2. Cargar en Chrome

* Activa el *Modo de desarrollador* en `chrome://extensions`
* Haz clic en **Cargar descomprimida** y selecciona la carpeta `dist/`

### 3. Configuración

* **Pestaña General**: Elige tu modelo y persona.
* **Pestaña Memoria del Asistente**:

  * Gestionar notas.
  * Reconstruir el índice RAG.
  * Ajustar pesos BM25/semánticos.
  * Ver o borrar el historial de chat.

### 4. Comenzar a Chatear

* Modelo y persona visibles en el encabezado del chat.
* Cambia de modelo con un menú desplegable.
* Usa mensajes normales o consultas relacionadas con datos; el RAG se activa automáticamente.

---

## 🔁 Reconstrucción del Índice RAG

Siempre que:

* Agregues/elimines notas.
* Cambies los pesos de fusión.
* Modifiques la configuración de indexación.

Usa **Rebuild Index** en la configuración para procesar todo nuevamente.

---

## 📁 Sistema de Notas e Historial de Chat

* Guarda instantáneas y destacados como notas.
* Recupera notas en el chat con `@note_title`.
* Revisa, busca o borra el historial según sea necesario.
* Exporta tus notas como markdown con yaml. Listo para Obsidian.

---

## 🧩 Descripción General de la Arquitectura

```
[Interacción del Usuario]
     ↓
[UI de Chat / UI de Página]
     ↓
[LLM + Personas]
     ↓                ↘
[Tool Call JSON]   [Analizador de Contexto de Página]
     ↓                ↓
[Motor de Herramientas] ← [Web Scraper / Búsqueda Wiki]
     ↓
[Sistema de Notas + Gestor de Memoria]
```

---

## 🛠️ Cómo Funciona

Cognito es una extensión de Chrome construida con una arquitectura modular:

*   **Panel Lateral (React & Redux):** La interfaz de usuario principal donde interactúas con la IA, gestionas la configuración y ves los resultados. Construido con React para una experiencia dinámica y Redux (vía `webext-redux`) para una gestión de estado robusta.
*   **Script de Fondo (Background Script):** El motor de la extensión. Maneja la comunicación con los servicios de IA, gestiona tareas de larga duración, inyecta scripts de contenido y coordina acciones en toda la extensión.
*   **Scripts de Contenido (Content Scripts):** Inyectados en las páginas web para acceder de forma segura y transmitir el contenido de la página (texto, HTML) al Panel Lateral y al Script de Fondo para su procesamiento por la IA.

Esta configuración permite que Cognito comprenda el contexto de tu navegación y proporcione asistencia de IA relevante sin salir de la pestaña actual.

## 💻 Stack Tecnológico

*   **React:** Para construir la interfaz interactiva del Panel Lateral.
*   **TypeScript:** Para un código robusto y mantenible.
*   **Redux & `webext-redux`:** Para la gestión de estado entre los componentes de la extensión.
*   **Tailwind CSS:** Para el estilo de la interfaz de usuario.
*   **Webpack:** Para el empaquetado de la extensión.
*   Diversas librerías de UI (componentes de Radix UI como `@radix-ui/react-accordion`, `lucide-react` para iconos) para un aspecto y tacto pulido.


## 📖 Ejemplos de Uso

*   **Resumir un artículo de noticias:** Abre un artículo extenso, abre el panel lateral de Cognito y haz clic en "Summarize Page" o escribe "Resume esta página".
*   **Preguntar sobre el contenido de la página:** Mientras ves un documento técnico complejo, selecciona un párrafo confuso y pregunta a Cognito: "Explica este texto seleccionado en términos más sencillos".
*   **Conectarse a un LLM Local:** Si tienes Ollama ejecutándose con un modelo como Llama3, ve a la configuración de Cognito, selecciona Ollama, ingresa los detalles de tu modelo (por ejemplo, `http://localhost:11434` y el nombre del modelo `llama3`), y comienza a chatear con tu IA local.
*   **Guardar Notas:** Durante un chat, si la IA proporciona un fragmento útil o quieres recordar una pieza clave de información, haz clic en el botón "Add to Note" (o una función similar) para guardarlo para referencia posterior dentro de la función de notas de Cognito.

## 🤝 Contribuir

¡Las contribuciones son bienvenidas! Si deseas ayudar a mejorar Cognito, por favor:

1.  Haz un fork del repositorio.
2.  Crea una nueva rama para tu funcionalidad o corrección de errores: `git checkout -b feature/nombre-de-tu-feature` o `bugfix/numero-de-issue`.
3.  Realiza tus cambios.
4.  Asegúrate de que tu código pase el linting (por ejemplo, `npm run lint` si hay un script configurado) y se compile correctamente (`npm start`).
5.  Sube tu rama al repositorio remoto. La bandera `-u` la vincula para futuros pushes.
    ```bash
    git push -u origin feature/nombre-de-tu-feature
    ```
6.  Envía un pull request con una descripción clara de tus cambios.

*(Considera añadir detalles sobre el estilo de codificación, configuración de desarrollo o enlaces a un archivo CONTRIBUTING.md dedicado si se crea uno en el futuro.)*

## 🙏 Agradecimientos

*   Cognito fue construido originalmente basándose e inspirado en [sidellama](https://github.com/gyopak/sidellama).
*   Inspiración e ideas de proyectos como [WikiChat](https://github.com/stanford-oval/WikiChat) de Stanford, [StreamingKokoroJS](https://github.com/rhulha/StreamingKokoroJS), [WebAgent](https://github.com/Alibaba-NLP/WebAgent), [chatterbox](https://github.com/resemble-ai/chatterbox), [kokoro and kokoro.js](https://github.com/hexgrad/kokoro/tree/main/kokoro.js) y la [piper-browser-extension](https://github.com/ken107/piper-browser-extension).
*   Gracias a todos los desarrolladores de las librerías y herramientas de código abierto que hacen posible Cognito.
