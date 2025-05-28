import { clsx, type ClassValue } from "clsx"
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
      files: ['assets/vendor.js', 'content.js']
    }).catch(err => {
      console.debug('Script injection failed:', err);
    });
  } catch (err) {
    console.debug('Tab access failed:', err);
    return;
  }
}

/**
 * Normalizes a custom API endpoint URL to extract its origin (scheme + hostname + port).
 * Strips any path, query parameters, or hash. Handles common variations.
 * @param endpoint - The user-provided endpoint URL string.
 * @returns The normalized base URL (origin) or an empty string if input is invalid or empty.
 */
export const normalizeApiEndpoint = (endpoint?: string): string => {
  if (!endpoint) {
    return '';
  }

  let urlStr = endpoint.trim();

  if (!urlStr.startsWith('http://') && !urlStr.startsWith('https://')) {
     if (urlStr.startsWith('localhost') || /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(urlStr.split(':')[0])) {
        urlStr = 'http://' + urlStr;
     } else {
        urlStr = 'https://' + urlStr;
     }
  }

  try {
    const parsedUrl = new URL(urlStr);

    return parsedUrl.origin;

  } catch (error) {
    console.error(`Invalid URL provided for normalization: "${endpoint}". Could not parse as URL.`);
    return '';
  }
};

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

