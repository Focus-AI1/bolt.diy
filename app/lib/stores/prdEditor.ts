import { atom, map } from 'nanostores';
import { createScopedLogger } from '~/utils/logger';
import { prdStreamingState } from './streaming';

const logger = createScopedLogger('prdEditorStore');

// Storage key for persisting editor state
const EDITOR_STATE_STORAGE_KEY = 'prd_editor_state';

// Type definition for the editor state
interface EditorState {
  originalContent: string;
  currentContent: string;
  isManuallyEdited: boolean;
  hasUnsavedChanges: boolean;
  editorInstanceId: string;
  userEditLock: boolean;
  lastEditTimestamp: number;
}

// Default state
const defaultState: EditorState = {
  originalContent: '',
  currentContent: '',
  isManuallyEdited: false,
  hasUnsavedChanges: false,
  editorInstanceId: '',
  userEditLock: false,
  lastEditTimestamp: 0,
};

// Initialize the store with persisted data if available
const initializeStore = (): EditorState => {
  // Try to load from sessionStorage
  try {
    const storedState = sessionStorage.getItem(EDITOR_STATE_STORAGE_KEY);
    if (storedState) {
      return JSON.parse(storedState);
    }
  } catch (error) {
    logger.error('Error loading editor state from sessionStorage:', error);
  }
  
  // Return default state if nothing is persisted
  return defaultState;
};

// PRD Editor state store to track edit state outside of React's render cycle
export const prdEditorStore = map<EditorState>(initializeStore());

// Subscribe to store changes to persist in sessionStorage
prdEditorStore.listen((state) => {
  try {
    sessionStorage.setItem(EDITOR_STATE_STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    logger.error('Error saving editor state to sessionStorage:', error);
  }
});

// Re-export the streamingState for use in components
export { prdStreamingState };

// Helper functions to manipulate the store

/**
 * Initialize the editor with content
 */
export function initializeEditor(content: string) {
  // Only initialize if the content is different or the editor is in a clean state
  const state = prdEditorStore.get();
  if (content !== state.originalContent && !state.hasUnsavedChanges) {
    prdEditorStore.setKey('originalContent', content);
    prdEditorStore.setKey('currentContent', content);
    prdEditorStore.setKey('isManuallyEdited', false);
    prdEditorStore.setKey('hasUnsavedChanges', false);
    logger.debug('Editor initialized with content');
  } else {
    logger.debug('Editor already initialized with this content or has unsaved changes');
  }
}

/**
 * Register a manual edit from the user
 */
export function registerManualEdit(newContent: string) {
  const state = prdEditorStore.get();
  
  // Set the edit lock to prevent programmatic updates
  prdEditorStore.setKey('userEditLock', true);
  prdEditorStore.setKey('currentContent', newContent);
  prdEditorStore.setKey('isManuallyEdited', true);
  
  // Only set hasUnsavedChanges if content actually changed
  const hasChanged = newContent !== state.originalContent;
  prdEditorStore.setKey('hasUnsavedChanges', hasChanged);
  
  // Update timestamp
  prdEditorStore.setKey('lastEditTimestamp', Date.now());
  
  logger.debug('Manual edit registered, hasUnsavedChanges:', hasChanged);
  return hasChanged;
}

/**
 * Save the current content as the new original content
 */
export function saveEditorContent() {
  const state = prdEditorStore.get();
  prdEditorStore.setKey('originalContent', state.currentContent);
  prdEditorStore.setKey('hasUnsavedChanges', false);
  // Keep isManuallyEdited true to remember this was user-edited content
  logger.debug('Editor content saved');
}

/**
 * Update content programmatically (e.g., from chat)
 * Returns true if update was applied, false if blocked by user edit lock
 */
export function updateContentProgrammatically(newContent: string): boolean {
  const state = prdEditorStore.get();
  
  // If user edit lock is active, don't override user's changes
  if (state.userEditLock) {
    logger.debug('Programmatic update blocked by user edit lock');
    return false;
  }
  
  prdEditorStore.setKey('originalContent', newContent);
  prdEditorStore.setKey('currentContent', newContent);
  prdEditorStore.setKey('isManuallyEdited', false);
  prdEditorStore.setKey('hasUnsavedChanges', false);
  logger.debug('Content updated programmatically');
  return true;
}

/**
 * Release the user edit lock
 */
export function releaseUserEditLock() {
  prdEditorStore.setKey('userEditLock', false);
  logger.debug('User edit lock released');
}

/**
 * Reset the editor state
 */
export function resetEditorState() {
  const state = prdEditorStore.get();
  prdEditorStore.setKey('currentContent', state.originalContent);
  prdEditorStore.setKey('isManuallyEdited', false);
  prdEditorStore.setKey('hasUnsavedChanges', false);
  prdEditorStore.setKey('userEditLock', false);
  logger.debug('Editor state reset');
}

/**
 * Start streaming mode
 */
export function startStreaming() {
  prdStreamingState.set(true);
  logger.debug('PRD Streaming started');
}

/**
 * End streaming mode
 */
export function endStreaming() {
  prdStreamingState.set(false);
  logger.debug('PRD Streaming ended');
}
