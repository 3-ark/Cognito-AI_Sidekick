import { contentLoaded } from 'src/state/slices/content';
import { createStoreProxy } from 'src/state/store';
import ChannelNames from '../types/ChannelNames';
import Defuddle from 'defuddle';
import * as turndownPluginGfm from 'turndown-plugin-gfm';
import TurndownService from 'turndown';

(async () => {
  try {
    if (
      window.location.protocol === 'chrome:' ||
      window.location.protocol === 'chrome-extension:'
    ) {
      return;
    }
    console.log('[Cognito Content Script] Initializing...');

    const store = createStoreProxy(ChannelNames.ContentPort);
    console.log('[Cognito Content Script] Store proxy created.');

    try {
      await store.ready();
      console.log('[Cognito Content Script] Store ready.');
      store.dispatch(contentLoaded());
      console.log('[Cognito Content Script] contentLoaded dispatched.');
    } catch (initError) {
      console.error('Cognito - Content script store init error:', initError);
    }
  } catch (err) {
    console.error('Cognito - Content script main initialization error:', err);
  }
})();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'DEFUDDLE_PAGE_CONTENT') {
    let turndownService: TurndownService | null = null;

    console.log('[Cognito Content Script] Received DEFUDDLE_PAGE_CONTENT request for URL:', document.location.href);

    try {
      if (document.contentType === 'application/pdf') {
        sendResponse({
          success: false,
          error: 'Cannot defuddle PDF content directly. Please save or copy text manually.',
          title: document.title || 'PDF Document'
        });
        return true;
      }

      if (typeof Defuddle === 'undefined') {
        console.error('[Cognito Content Script] Defuddle library is undefined. Make sure it is imported and bundled correctly.');
        sendResponse({ success: false, error: 'Defuddle library not available.', title: document.title });
        return true;
      }
      console.log('[Cognito Content Script] Defuddle library seems available. Type:', typeof Defuddle);

      const defuddleInstance = new Defuddle(document, {
        markdown: false,
        url: document.location.href
      });
      console.log('[Cognito Content Script] Defuddle instance created. Starting parse...');
      const defuddleResult = defuddleInstance.parse();
      console.log('[Cognito Content Script] Defuddle HTML parse complete. Title:', defuddleResult.title, 'HTML Content length:', defuddleResult.content?.length);

      if (typeof TurndownService === 'undefined') {
        console.error('[Cognito Content Script] TurndownService library is undefined. Make sure it is imported and bundled correctly.');
        sendResponse({ success: false, error: 'TurndownService library not available.', title: document.title });
        return true;
      }

      turndownService = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' })
        .use(turndownPluginGfm.gfm);

      const markdownContent = turndownService.turndown(defuddleResult.content || '');
      console.log('[Cognito Content Script] Turndown conversion complete. Markdown length:', markdownContent?.length);

      const firstHeading = document.querySelector('h1, h2, h3')?.textContent?.trim();
      const fallbackTitle = document.title || 'Untitled Note';

      sendResponse({
        success: true,
        title: firstHeading || defuddleResult.title || fallbackTitle,
        content: markdownContent
     });

      console.log('[Cognito Content Script] Sent successful defuddle response to background.');
    } catch (error: any) {
      console.error('[Cognito Content Script] Error running Defuddle:', error, error.stack);
      sendResponse({ success: false, error: error.message, title: document.title });
    }
    
    return true;
  }

});

export {};