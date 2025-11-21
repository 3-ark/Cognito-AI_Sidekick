import storage from '../../background/storageUtil';

import { clearPageContextFromStorage } from './storageUtils';

import { bridge } from '../../utils/html';

export async function injectBridge() {
  const queryOptions = { active: true, lastFocusedWindow: true };

  // Check if chrome.tabs is available (it won't be in a regular web page context)
  if (!chrome.tabs || !chrome.scripting) {
    console.warn('[Cognito injectBridge] Chrome APIs not available. Skipping injection.');
    await clearPageContextFromStorage(); // Clear storage if we can't inject

    return;
  }

  const [tab] = await chrome.tabs.query(queryOptions);

  if (!tab?.id || tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://') || tab.url?.startsWith('about:')) {
    await clearPageContextFromStorage();

    return;
  }

  await clearPageContextFromStorage(); // Clear before attempting to set new values

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: bridge, // bridge function is self-contained and doesn't need args from here
    });

    if (!results || !Array.isArray(results) || results.length === 0 || !results[0] || typeof results[0].result !== 'string') {
        console.error('[Cognito injectBridge] Bridge function execution returned invalid or unexpected results structure:', results);

        return;
    }

    const rawResult = results[0].result;
    let res: any;

    try {
        res = JSON.parse(rawResult);
    } catch (parseError) {
        console.error('[Cognito injectBridge] Failed to parse JSON result from bridge:', parseError, 'Raw result string:', rawResult);

        return;
    }

    if (res.error) {
        console.error('[Cognito injectBridge] Bridge function reported an error:', res.error, 'Title:', res.title);

        // Potentially set some error state or specific values in storage if needed
        return;
    }

    // Store extracted content
    try {
      await storage.setItem('pagestring', res?.text ?? '');
      await storage.setItem('pagehtml', res?.html ?? '');
      await storage.setItem('alttexts', res?.altTexts ?? '');
      await storage.setItem('tabledata', res?.tableData ?? '');
    } catch (storageError) {
        console.error('[Cognito injectBridge] Storage error after successful extraction:', storageError);
        await clearPageContextFromStorage(); // Clear storage on error
    }
  } catch (execError) {
    console.error('[Cognito injectBridge] Bridge function execution failed:', execError);

    if (execError instanceof Error && (execError.message.includes('Cannot access contents of url "chrome://') || execError.message.includes('Cannot access a chrome extension URL') || execError.message.includes('Cannot access contents of url "about:'))) {
        console.warn('[Cognito injectBridge] Cannot access restricted URL.');
    }

    // Ensure storage is cleared if execution fails for restricted URLs or other reasons
    await clearPageContextFromStorage();
  }
}
