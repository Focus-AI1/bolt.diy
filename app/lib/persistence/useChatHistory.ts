import { useLoaderData, useNavigate, useSearchParams } from '@remix-run/react';
import { useState, useEffect, useCallback } from 'react';
import { atom } from 'nanostores';
import { generateId, type JSONValue, type Message } from 'ai';
import { toast } from 'react-toastify';
import { workbenchStore } from '~/lib/stores/workbench';
import { logStore } from '~/lib/stores/logs'; // Import logStore
import {
  getMessages,
  getNextId,
  getUrlId,
  openDatabase,
  setMessages,
  duplicateChat,
  createChatFromMessages,
  type IChatMetadata,
} from './db';
import type { FileMap } from '~/lib/stores/files';
import type { Snapshot } from './types';
import { webcontainer } from '~/lib/webcontainer';
import { createCommandsMessage, detectProjectCommands } from '~/utils/projectCommands';
import type { ContextAnnotation } from '~/types/context';
import storageManager from '~/utils/storageManager'; // Import the storage manager utility

export interface ChatHistoryItem {
  id: string;
  urlId?: string;
  description?: string;
  messages: Message[];
  timestamp: string;
  metadata?: IChatMetadata;
  type?: 'chat' | 'prd' | 'ticket' | 'research'; // Add 'research' to the type options
}

const persistenceEnabled = !import.meta.env.VITE_DISABLE_PERSISTENCE;

export const db = persistenceEnabled ? await openDatabase() : undefined;

export const chatId = atom<string | undefined>(undefined);
export const description = atom<string | undefined>(undefined);
export const chatMetadata = atom<IChatMetadata | undefined>(undefined);
export const chatType = atom<'chat' | 'prd' | 'ticket' | 'research'>('chat'); // Add 'research' to the type options

// Add constants for chat types
export const chatTypes = {
  CHAT: 'chat' as const,
  PRD: 'prd' as const,
  TICKET: 'ticket' as const,
  RESEARCH: 'research' as const // Add RESEARCH type
};

export function useChatHistory() {
  const navigate = useNavigate();
  const { id: mixedId } = useLoaderData<{ id?: string }>();
  const [searchParams] = useSearchParams();
  const location = window.location.pathname;
  const isInPRDRoute = location.startsWith('/prd/');
  const isInTicketRoute = location.startsWith('/ticket/');
  const isInResearchRoute = location.startsWith('/research/'); // Check for research route

  const [archivedMessages, setArchivedMessages] = useState<Message[]>([]);
  const [initialMessages, setInitialMessages] = useState<Message[]>([]);
  const [ready, setReady] = useState<boolean>(false);
  const [urlId, setUrlId] = useState<string | undefined>();
  const [currentType, setCurrentType] = useState<'chat' | 'prd' | 'ticket' | 'research'>(
    isInPRDRoute ? 'prd' : isInTicketRoute ? 'ticket' : isInResearchRoute ? 'research' : 'chat' // Set initial type based on route, including research
  );

  useEffect(() => {
    if (!db) {
      setReady(true);

      if (persistenceEnabled) {
        const error = new Error('Chat persistence is unavailable');
        logStore.logError('Chat persistence initialization failed', error);
        toast.error('Chat persistence is unavailable');
      }

      return;
    }

    if (mixedId) {
      getMessages(db, mixedId)
        .then(async (storedMessages) => {
          if (storedMessages && storedMessages.messages.length > 0) {
            // Set the chat type from stored messages or default to 'chat' for backward compatibility
            const type = storedMessages.type || 'chat';
            
            // Check if the chat type matches the current route
            // If we're in a specific route but the chat is not of that type, redirect
            const isChatRoute = !isInPRDRoute && !isInTicketRoute && !isInResearchRoute;
            if ((isInPRDRoute && type !== 'prd') ||
                (isInTicketRoute && type !== 'ticket') ||
                (isInResearchRoute && type !== 'research') || // Check research route
                (isChatRoute && type !== 'chat')) {
              let correctPath = '/chat/' + mixedId;
              if (type === 'prd') correctPath = '/prd/' + mixedId;
              if (type === 'ticket') correctPath = '/ticket/' + mixedId;
              if (type === 'research') correctPath = '/research/' + mixedId; // Add research path
              window.location.href = correctPath;
              return;
            }
            
            setCurrentType(type as 'chat' | 'prd' | 'ticket' | 'research'); // Ensure type assertion includes research
            chatType.set(type as 'chat' | 'prd' | 'ticket' | 'research'); // Ensure type assertion includes research
            
            const snapshotStr = localStorage.getItem(`snapshot:${mixedId}`);
            const snapshot: Snapshot = snapshotStr ? JSON.parse(snapshotStr) : { chatIndex: 0, files: {} };
            const summary = snapshot.summary;

            const rewindId = searchParams.get('rewindTo');
            let startingIdx = -1;
            const endingIdx = rewindId
              ? storedMessages.messages.findIndex((m) => m.id === rewindId) + 1
              : storedMessages.messages.length;
            const snapshotIndex = storedMessages.messages.findIndex((m) => m.id === snapshot.chatIndex);

            if (snapshotIndex >= 0 && snapshotIndex < endingIdx) {
              startingIdx = snapshotIndex;
            }

            if (snapshotIndex > 0 && storedMessages.messages[snapshotIndex].id == rewindId) {
              startingIdx = -1;
            }

            let filteredMessages = storedMessages.messages.slice(startingIdx + 1, endingIdx);
            let archivedMessages: Message[] = [];

            if (startingIdx >= 0) {
              archivedMessages = storedMessages.messages.slice(0, startingIdx + 1);
            }

            setArchivedMessages(archivedMessages);

            if (startingIdx > 0) {
              const files = Object.entries(snapshot?.files || {})
                .map(([key, value]) => {
                  if (value?.type !== 'file') {
                    return null;
                  }

                  return {
                    content: value.content,
                    path: key,
                  };
                })
                .filter((x) => !!x);
              const projectCommands = await detectProjectCommands(files);
              const commands = createCommandsMessage(projectCommands);

              filteredMessages = [
                {
                  id: generateId(),
                  role: 'user',
                  content: `Restore project from snapshot
                  `,
                  annotations: ['no-store', 'hidden'],
                },
                {
                  id: storedMessages.messages[snapshotIndex].id,
                  role: 'assistant',
                  content: ` 📦 Chat Restored from snapshot, You can revert this message to load the full chat history
                  <boltArtifact id="imported-files" title="Project Files Snapshot" type="bundled">
                  ${Object.entries(snapshot?.files || {})
                    .filter((x) => !x[0].endsWith('lock.json'))
                    .map(([key, value]) => {
                      if (value?.type === 'file') {
                        return `
                      <boltAction type="file" filePath="${key}">
${value.content}
                      </boltAction>
                      `;
                      } else {
                        return ``;
                      }
                    })
                    .join('\n')}
                  </boltArtifact>
                  `,
                  annotations: [
                    'no-store',
                    ...(summary
                      ? [
                          {
                            chatId: storedMessages.messages[snapshotIndex].id,
                            type: 'chatSummary',
                            summary,
                          } satisfies ContextAnnotation,
                        ]
                      : []),
                  ],
                },
                ...(commands !== null
                  ? [
                      {
                        id: `${storedMessages.messages[snapshotIndex].id}-2`,
                        role: 'user' as const,
                        content: `setup project`,
                        annotations: ['no-store', 'hidden'],
                      },
                      {
                        ...commands,
                        id: `${storedMessages.messages[snapshotIndex].id}-3`,
                        annotations: [
                          'no-store',
                          ...(commands.annotations || []),
                          ...(summary
                            ? [
                                {
                                  chatId: `${storedMessages.messages[snapshotIndex].id}-3`,
                                  type: 'chatSummary',
                                  summary,
                                } satisfies ContextAnnotation,
                              ]
                            : []),
                        ],
                      },
                    ]
                  : []),
                ...filteredMessages,
              ];
              restoreSnapshot(mixedId);
            }

            setInitialMessages(filteredMessages);

            setUrlId(storedMessages.urlId);
            description.set(storedMessages.description);
            chatId.set(storedMessages.id);
            chatMetadata.set(storedMessages.metadata);
          } else {
            navigate('/', { replace: true });
          }

          setReady(true);
        })
        .catch((error) => {
          console.error(error);

          logStore.logError('Failed to load chat messages', error);
          toast.error(error.message);
        });
    }
  }, [mixedId]);

  // Function to take a snapshot of the current chat and files
  // Enhanced with storage management to prevent quota exceeded errors
  const takeSnapshot = useCallback((chatIndex: string, files: FileMap, chatId?: string, summary?: string) => {
    if (!chatId) {
      return;
    }

    const snapshot: Snapshot = {
      chatIndex,
      files,
      summary,
    };

    try {
      // Use the storage manager to safely store the snapshot
      // This handles quota management and will clean up old snapshots if needed
      const snapshotKey = `snapshot:${chatId}`;
      const success = storageManager.safeSetItem(snapshotKey, JSON.stringify(snapshot));
      
      if (!success) {
        console.warn(`[Chat] Failed to store snapshot for chat ${chatId}, storage may be full`);
        // Perform a storage health check to clean up
        storageManager.performStorageHealthCheck();
      }
    } catch (error) {
      console.error('[Chat] Error taking snapshot:', error);
    }
  }, []);

  // Restore a snapshot with improved error handling
  // This maintains all existing functionality while adding robustness
  const restoreSnapshot = useCallback(async (id: string) => {
    try {
      // Use the storage manager to safely get the snapshot
      // This handles decompression if the snapshot was compressed
      const snapshotStr = storageManager.safeGetItem(`snapshot:${id}`);
      if (!snapshotStr) {
        console.warn(`[Chat] No snapshot found for chat ${id}`);
        return;
      }
      
      const snapshot: Snapshot = JSON.parse(snapshotStr);
      
      if (snapshot.files) {
        workbenchStore.files.set(snapshot.files);
        // Trigger file system update if needed
        const container = await webcontainer;
        
        // Update the file system with the snapshot files
        for (const [path, fileData] of Object.entries(snapshot.files)) {
          if (fileData && typeof fileData === 'object' && 'type' in fileData) {
            const typedFileData = fileData as { type: string; content?: string };
            
            if (typedFileData.type === 'file' && typedFileData.content !== undefined) {
              try {
                await container.fs.writeFile(path, typedFileData.content);
              } catch (e) {
                console.error(`[Chat] Error writing file ${path}:`, e);
              }
            } else if (typedFileData.type === 'folder' || typedFileData.type === 'directory') {
              try {
                await container.fs.mkdir(path, { recursive: true });
              } catch (e) {
                // Directory might already exist, which is fine
                console.debug(`[Chat] Directory ${path} might already exist:`, e);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('[Chat] Error restoring snapshot:', error);
      toast.error('Failed to restore chat snapshot');
    }
  }, []);

  // Add a function to check and clean localStorage when approaching quota
  // This helps prevent quota exceeded errors by proactively managing storage
  const cleanupLocalStorage = () => {
    try {
      // Check if we're close to quota (80% used as a threshold)
      const totalSpace = 5 * 1024 * 1024; // Assume 5MB quota (conservative estimate)
      let usedSpace = 0;
      
      // Calculate current usage
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          usedSpace += (localStorage.getItem(key) || '').length * 2; // UTF-16 chars are 2 bytes
        }
      }
      
      // If we're using more than 80% of quota, clean up old items
      if (usedSpace > 0.8 * totalSpace) {
        console.log('[Storage] Cleaning up localStorage, used:', Math.round(usedSpace / 1024), 'KB');
        
        // Get all snapshot keys and sort by timestamp (assuming format snapshot:id)
        const snapshotKeys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('snapshot:')) {
            snapshotKeys.push(key);
          }
        }
        
        // If we have more than 20 snapshots, remove the oldest ones
        if (snapshotKeys.length > 20) {
          // Sort by extraction of numeric ID (if possible) or alphabetically
          snapshotKeys.sort((a, b) => {
            const idA = parseInt(a.split(':')[1]) || 0;
            const idB = parseInt(b.split(':')[1]) || 0;
            return idA - idB;
          });
          
          // Remove oldest snapshots (keep the 20 most recent)
          const toRemove = snapshotKeys.slice(0, snapshotKeys.length - 20);
          toRemove.forEach(key => {
            console.log('[Storage] Removing old snapshot:', key);
            localStorage.removeItem(key);
          });
        }
      }
    } catch (error) {
      console.error('[Storage] Error cleaning up localStorage:', error);
    }
  };

  return {
    ready: !mixedId || ready,
    initialMessages,
    urlId,
    chatType: currentType,
    setChatType: (type: 'chat' | 'prd' | 'ticket' | 'research') => {
      setCurrentType(type);
      chatType.set(type);
    },
    updateChatMestaData: async (metadata: IChatMetadata) => {
      const id = chatId.get();

      if (!db || !id) {
        return;
      }

      try {
        await setMessages(db, id, initialMessages, urlId, description.get(), undefined, metadata);
        chatMetadata.set(metadata);
      } catch (error) {
        toast.error('Failed to update chat metadata');
        console.error(error);
      }
    },
    storeMessageHistory: async (messages: Message[]) => {
      if (!db || messages.length === 0) {
        return;
      }

      const { firstArtifact } = workbenchStore;
      messages = messages.filter((m) => !m.annotations?.includes('no-store'));

      let _urlId = urlId;

      if (!urlId && firstArtifact?.id) {
        const urlId = await getUrlId(db, firstArtifact.id);
        _urlId = urlId;
        navigateChat(urlId);
        setUrlId(urlId);
      }

      let chatSummary: string | undefined = undefined;
      const lastMessage = messages[messages.length - 1];

      if (lastMessage.role === 'assistant') {
        const annotations = lastMessage.annotations as JSONValue[];
        const filteredAnnotations = (annotations?.filter(
          (annotation: JSONValue) =>
            annotation && typeof annotation === 'object' && Object.keys(annotation).includes('type'),
        ) || []) as { type: string; value: any } & { [key: string]: any }[];

        if (filteredAnnotations.find((annotation) => annotation.type === 'chatSummary')) {
          chatSummary = filteredAnnotations.find((annotation) => annotation.type === 'chatSummary')?.summary;
        }
      }

      // Clean up localStorage before taking a new snapshot
      cleanupLocalStorage();

      try {
        takeSnapshot(messages[messages.length - 1].id, workbenchStore.files.get(), _urlId, chatSummary);
      } catch (error) {
        console.error('[Storage] Error taking snapshot, likely quota exceeded:', error);
        // Continue with the rest of the function even if snapshot fails
      }

      if (!description.get() && firstArtifact?.title) {
        description.set(firstArtifact?.title);
      }

      if (initialMessages.length === 0 && !chatId.get()) {
        const nextId = await getNextId(db);

        chatId.set(nextId);

        if (!urlId) {
          navigateChat(nextId);
        }
      }

      // Get the current chat type from the store
      const type = currentType;
      
      await setMessages(
        db,
        chatId.get() as string,
        [...archivedMessages, ...messages],
        urlId,
        description.get(),
        undefined,
        chatMetadata.get(),
        type, // Pass the current chat type (already includes research)
      );
    },
    duplicateCurrentChat: async (listItemId: string) => {
      if (!db || (!mixedId && !listItemId)) {
        return;
      }

      try {
        const newId = await duplicateChat(db, mixedId || listItemId);
        navigate(`/chat/${newId}`);
        toast.success('Chat duplicated successfully');
      } catch (error) {
        toast.error('Failed to duplicate chat');
        console.log(error);
      }
    },
    importChat: async (description: string, messages: Message[], metadata?: IChatMetadata, type: 'chat' | 'prd' | 'ticket' | 'research' = 'chat') => {
      if (!db) {
        return;
      }

      try {
        const newId = await createChatFromMessages(db, description, messages, metadata, type);
        let redirectPath = `/chat/${newId}`;
        if (type === 'prd') redirectPath = `/prd/${newId}`;
        if (type === 'ticket') redirectPath = `/ticket/${newId}`;
        if (type === 'research') redirectPath = `/research/${newId}`; // Add research redirect path
        window.location.href = redirectPath;
        toast.success('Chat imported successfully');
      } catch (error) {
        if (error instanceof Error) {
          toast.error('Failed to import chat: ' + error.message);
        } else {
          toast.error('Failed to import chat');
        }
      }
    },
    exportChat: async (id = urlId) => {
      if (!db || !id) {
        return;
      }

      const chat = await getMessages(db, id);
      const chatData = {
        messages: chat.messages,
        description: chat.description,
        exportDate: new Date().toISOString(),
      };

      const blob = new Blob([JSON.stringify(chatData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chat-${new Date().toISOString()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
  };
}

function navigateChat(nextId: string) {
  /**
   * FIXME: Using the intended navigate function causes a rerender for <Chat /> that breaks the app.
   *
   * `navigate(`/chat/${nextId}`, { replace: true });`
   */
  const url = new URL(window.location.href);
  url.pathname = `/chat/${nextId}`;

  window.history.replaceState({}, '', url);
}
