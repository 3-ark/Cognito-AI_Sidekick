const permissions = require('./permissions');
const {
 name, description, version
} = require('./app_info');

module.exports = {
  version,
  manifest_version: 3,
  name,
  description,
  permissions,
  minimum_chrome_version: '114',
  action: { default_title: 'Click to open panel' },
  side_panel: { default_path: 'assets/sidePanel.html' },
  icons: {
    16: 'assets/images/cognito.png',
    48: 'assets/images/cognito.png',
    128: 'assets/images/cognito.png'
  },
  background: { service_worker: 'background.js' },
  content_scripts: [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "css": ["index.css"]
    },
    {
      "matches": ["<all_urls>"],
      "js": ["fab.js"]
    }
  ],
  web_accessible_resources: [{
    resources: ['assets/**', 'content.js.map', 'fab.css'],
    matches: ['<all_urls>']
  }],
  "host_permissions": ["<all_urls>"],
  content_security_policy: {
    "extension_pages": "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; font-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com https://cdn.jsdelivr.net; img-src 'self' data: http://localhost:* http://127.0.0.1:* https:; connect-src 'self' file: http: https: http://localhost:* http://127.0.0.1:* https://duckduckgo.com https://*.duckduckgo.com https://search.brave.com https://www.google.com https://google.com https://api.groq.com https://generativelanguage.googleapis.com https://api.openai.com https://openrouter.ai/ https://api.anthropic.com/ https://api.deepseek.com/ https://api.together.xyz/ https://api.cohere.ai/ https://api.perplexity.ai/ https://api.mistral.ai/;"
  },
  "commands": {
    "toggle-floating-button": {
      "suggested_key": {
        "default": "Ctrl+Shift+F",
        "mac": "MacCtrl+Shift+F"
      },
      "description": "Toggle the floating button"
    },
    "open-floating-button": {
      "suggested_key": {
        "default": "Alt+O",
        "mac": "Alt+O"
      },
      "description": "Open the floating button window"
    }
  }
}
