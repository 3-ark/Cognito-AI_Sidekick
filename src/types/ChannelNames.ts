enum ChannelNames {
  ContentPort = 'content',
  SidePanelPort = 'sidePanel',
  
  // Existing
  SAVE_NOTE_TO_FILE= 'save-note-to-file',
  SEARCH_NOTES_REQUEST= 'search-notes-request', // This will be our global search for now
  SEARCH_NOTES_RESPONSE= 'search-notes-response',

  // Note CRUD
  GET_ALL_NOTES_REQUEST = 'get-all-notes-request',
  GET_ALL_NOTES_RESPONSE = 'get-all-notes-response',
  SAVE_NOTE_REQUEST = 'save-note-request',
  SAVE_NOTE_RESPONSE = 'save-note-response',
  DELETE_NOTE_REQUEST = 'delete-note-request',
  DELETE_NOTE_RESPONSE = 'delete-note-response',
  DELETE_ALL_NOTES_REQUEST = 'delete-all-notes-request',
  DELETE_ALL_NOTES_RESPONSE = 'delete-all-notes-response',
  EXPORT_NOTES_REQUEST = 'export-notes-request',
  EXPORT_NOTES_RESPONSE = 'export-notes-response',

  // Chat CRUD
  GET_ALL_CHATS_REQUEST = 'get-all-chats-request',
  GET_ALL_CHATS_RESPONSE = 'get-all-chats-response',
  GET_CHAT_MESSAGES_REQUEST = 'get-chat-messages-request',
  SAVE_CHAT_REQUEST = 'save-chat-request',
  SAVE_CHAT_RESPONSE = 'save-chat-response',
  DELETE_CHAT_REQUEST = 'delete-chat-request',
  DELETE_CHAT_RESPONSE = 'delete-chat-response',
  DELETE_CHAT_MESSAGE_REQUEST = 'delete-chat-message-request',
  DELETE_ALL_CHATS_REQUEST = 'delete-all-chats-request',
  DELETE_ALL_CHATS_RESPONSE = 'delete-all-chats-response',
  GENERATE_TITLE_REQUEST = 'generate-title-request',

  // Other UI actions that might imply data change and thus indexing
  ACTIVATE_NOTE_SYSTEM_VIEW = "ACTIVATE_NOTE_SYSTEM_VIEW", // Already exists in Cognito
  CREATE_NOTE_FROM_PAGE_CONTENT = "CREATE_NOTE_FROM_PAGE_CONTENT", // Already exists in Cognito
  ERROR_OCCURRED = "ERROR_OCCURRED", // Already exists in Cognito

  // Search index rebuild
  BM25_REBUILD_START = 'bm25-rebuild-start',
  BM25_REBUILD_END = 'bm25-rebuild-end',
  BUILD_ALL_EMBEDDINGS_REQUEST = 'build-all-embeddings-request',

  // Getters for individual items
  GET_NOTE_REQUEST = 'get-note-request',
  GET_CONVERSATION_REQUEST = 'get-conversation-request',
  // Tool-related channels
  OPEN_TAB = 'open-tab',
}

export default ChannelNames;
