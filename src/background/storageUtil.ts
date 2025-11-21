import { Config } from '../types/config'; // Import Config and RagConfig

// Key for storing the main application configuration in chrome.storage.local
// This should match the key used in ConfigContext.tsx
const APP_CONFIG_STORAGE_KEY = 'config';

// Default values for BM25 parameters, used if not found in stored settings
const DEFAULT_BM25_K = 1.2;
const DEFAULT_BM25_B = 0.75;
const DEFAULT_BM25_D = 0.5; // For BM25+

/**
 * Represents the application settings structure, mirroring the Config interface.
 * This type alias is used for clarity within this file.
 */
export type AppSettings = Config;

/**
 * Retrieves the full application settings object from chrome.storage.local.
 *
 * @returns A Promise that resolves to the AppSettings object, or null if not found or error.
 */
export async function getStoredAppSettings(): Promise<AppSettings | null> {
  try {
    const data = await chrome.storage.local.get(APP_CONFIG_STORAGE_KEY);
    const configString = data[APP_CONFIG_STORAGE_KEY];

    if (configString && typeof configString === 'string') {
      const parsedConfig = JSON.parse(configString) as AppSettings;

      // Basic validation: check if ragConfig exists, as it's crucial for BM25 params
      if (parsedConfig && typeof parsedConfig === 'object') {
        return parsedConfig;
      }

      console.warn('[storageUtil.getStoredAppSettings] Parsed config is not a valid object or missing essential parts.');

      return null;
    }

    // console.log('[storageUtil.getStoredAppSettings] No config string found in storage or not a string.');
    return null;
  } catch (error) {
    console.error('[storageUtil.getStoredAppSettings] Error retrieving or parsing app settings:', error);

    return null;
  }
}

/**
 * Retrieves the effective BM25 parameters (k, b, d) from stored application settings.
 * Falls back to default values if settings are not found or specific parameters are missing.
 *
 * @returns A Promise that resolves to an object containing { k, b, d }.
 */
export async function getEffectiveBm25Params(): Promise<{ k: number; b: number; d: number }> {
  const appSettings = await getStoredAppSettings();

  const ragConfig = appSettings?.ragConfig;

  const k = ragConfig?.k ?? DEFAULT_BM25_K; // Changed from k1 to k
  const b = ragConfig?.b ?? DEFAULT_BM25_B;
  const d = ragConfig?.d ?? DEFAULT_BM25_D; // Uses the 'd?' from RagConfig

  return {
 k, b, d, 
};
}

// The existing simple storage wrapper (can be kept if used elsewhere, or removed if not)
// For the purpose of this refactor, getStoredAppSettings is more specific.
// If ConfigContext.tsx directly uses `storage.getItem('config')`, then this generic storage object is fine.
// Let's assume ConfigContext continues to use its own `storage.getItem` which is this default export.

interface Storage {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: unknown) => Promise<void>;
  deleteItem: (key: string) => Promise<void>;
}

const storage: Storage = {
  getItem: async (key: string) => {
    const data = await chrome.storage.local.get(key);
    const value = data[key];

    if (value === undefined || value === null) {
      return null;
    }

    // Ensure the item is returned as a string, as ConfigContext expects to parse it.
    if (typeof value === 'string') {
      return value;
    }

    try {
      return JSON.stringify(value);
    } catch (e) {
      console.error(`[storageUtil.getItem] Error stringifying value for key "${key}":`, e);

      return null;
    }
  },
  setItem: async (key: string, value: unknown) => {
    // ConfigContext stringifies before calling setItem, so value here should already be a string.
    // If not, ensure it's stringified.
    const serializableValue = typeof value === 'string' ? value : JSON.stringify(value);

    await chrome.storage.local.set({ [key]: serializableValue });
  },
  deleteItem: async (key: string) => {
    await chrome.storage.local.remove(key);
  },
};

export default storage;
