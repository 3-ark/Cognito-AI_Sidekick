import { type ClassValue,clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export async function getCurrentTab() {
  const queryOptions = { active: true, lastFocusedWindow: true };
  const [tab] = await chrome.tabs.query(queryOptions);

  return tab;
}

export async function injectContentScript(tabId: number) {
  try {
    const tab = await chrome.tabs.get(tabId);

    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      console.debug('Skipping content script injection for restricted URL:', tab.url);

      return;
    }

    console.log('injecting content script');
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['assets/vendor-content.js', 'content.js'],
    }).catch(err => {
      console.debug('Script injection failed:', err);
    });
  } catch (err) {
    console.debug('Tab access failed:', err);

    return;
  }
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
