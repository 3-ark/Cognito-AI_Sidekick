import storage from '../../background/storageUtil';

/**
 * Clears page-specific context items from storage.
 */
export const clearPageContextFromStorage = async (): Promise<void> => {
  try {
    await storage.deleteItem('pagestring');
    await storage.deleteItem('pagehtml');
    await storage.deleteItem('alttexts');
    await storage.deleteItem('tabledata');
    console.log('[Cognito] Cleared page context from storage.');
  } catch (error) {
    console.error('[Cognito] Error clearing page context from storage:', error);
  }
};
