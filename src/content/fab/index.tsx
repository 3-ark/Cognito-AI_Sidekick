import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const hostId = 'cognito-fab-host';

if (!document.getElementById(hostId)) {
  const host = document.createElement('div');
  host.id = hostId;
  document.body.appendChild(host);

  const shadowRoot = host.attachShadow({ mode: 'open' });
  const appContainer = document.createElement('div');
  shadowRoot.appendChild(appContainer);

  const cssUrl = chrome.runtime.getURL('fab.css');
  fetch(cssUrl)
    .then(response => response.text())
    .then(css => {
      const style = document.createElement('style');
      style.textContent = css;
      shadowRoot.appendChild(style);
    });

  const root = createRoot(appContainer);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
