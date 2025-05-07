/*
 * @ts-nocheck
 * Preventing TS checks with files presented in the video for a better presentation.
 */
import { useStore } from '@nanostores/react';
import type { Message } from 'ai';
import { useChat } from 'ai/react';
import { useAnimate } from 'framer-motion';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { cssTransition, toast, ToastContainer } from 'react-toastify';
import { useMessageParser, usePromptEnhancer, useShortcuts } from '~/lib/hooks';
import { description, useChatHistory, chatType } from '~/lib/persistence/useChatHistory';
import { chatStore } from '~/lib/stores/chat';
import { workbenchStore } from '~/lib/stores/workbench';
import { DEFAULT_MODEL, DEFAULT_PROVIDER, PROMPT_COOKIE_KEY, PROVIDER_LIST } from '~/utils/constants';
import { cubicEasingFn } from '~/utils/easings';
import { createScopedLogger, renderLogger } from '~/utils/logger';
import { BaseChat } from './BaseChat';
import Cookies from 'js-cookie';
import { debounce } from '~/utils/debounce';
import { useSettings } from '~/lib/hooks/useSettings';
import type { ProviderInfo } from '~/types/model';
import { useSearchParams } from '@remix-run/react';
import { createSampler } from '~/utils/sampler';
import { getTemplates, selectStarterTemplate } from '~/utils/selectStarterTemplate';
import { logStore } from '~/lib/stores/logs';
import { streamingState } from '~/lib/stores/streaming';
import { filesToArtifacts } from '~/utils/fileUtils';
import { supabaseConnection } from '~/lib/stores/supabase';
import { useStickToBottom } from '~/lib/hooks/useStickToBottom';

const toastAnimation = cssTransition({
  enter: 'animated fadeInRight',
  exit: 'animated fadeOutRight',
});

const logger = createScopedLogger('Chat');

export function Chat() {
  renderLogger.trace('Chat');

  const { ready, initialMessages, storeMessageHistory, importChat, exportChat, setChatType } = useChatHistory();
  const title = useStore(description);
  
  useEffect(() => {
    workbenchStore.setReloadedMessages(initialMessages.map((m) => m.id));
    
    // Set the chat type to 'chat' when the regular chat component is active
    setChatType('chat');
    chatType.set('chat');
    logger.debug('Chat type set to regular chat');
  }, [initialMessages, setChatType]);

  return (
    <>
      {ready && (
        <ChatImpl
          description={title}
          initialMessages={initialMessages}
          exportChat={exportChat}
          storeMessageHistory={storeMessageHistory}
          importChat={importChat}
        />
      )}
      <ToastContainer
        closeButton={({ closeToast }) => {
          return (
            <button className="Toastify__close-button" onClick={closeToast}>
              <div className="i-ph:x text-lg" />
            </button>
          );
        }}
        icon={({ type }) => {
          /**
           * @todo Handle more types if we need them. This may require extra color palettes.
           */
          switch (type) {
            case 'success': {
              return <div className="i-ph:check-bold text-bolt-elements-icon-success text-2xl" />;
            }
            case 'error': {
              return <div className="i-ph:warning-circle-bold text-bolt-elements-icon-error text-2xl" />;
            }
          }

          return undefined;
        }}
        position="bottom-right"
        pauseOnFocusLoss
        transition={toastAnimation}
        autoClose={3000}
      />
    </>
  );
}

const processSampledMessages = createSampler(
  (options: {
    messages: Message[];
    initialMessages: Message[];
    isLoading: boolean;
    parseMessages: (messages: Message[], isLoading: boolean) => void;
    storeMessageHistory: (messages: Message[]) => Promise<void>;
  }) => {
    const { messages, initialMessages, isLoading, parseMessages, storeMessageHistory } = options;
    parseMessages(messages, isLoading);

    if (messages.length > initialMessages.length) {
      storeMessageHistory(messages).catch((error) => toast.error(error.message));
    }
  },
  50,
);

interface ChatProps {
  initialMessages: Message[];
  storeMessageHistory: (messages: Message[]) => Promise<void>;
  importChat: (description: string, messages: Message[]) => Promise<void>;
  exportChat: () => void;
  description?: string;
}

export const ChatImpl = memo(
  ({ description, initialMessages, storeMessageHistory, importChat, exportChat }: ChatProps) => {
    useShortcuts();

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [chatStarted, setChatStarted] = useState(initialMessages.length > 0);
    const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
    const [imageDataList, setImageDataList] = useState<string[]>([]);
    const [searchParams, setSearchParams] = useSearchParams();
    const [fakeLoading, setFakeLoading] = useState(false);
    
    // Add state for tracking PRD and Ticket updates
    const [showPRDUpdateNotification, setShowPRDUpdateNotification] = useState(false);
    const [showTicketUpdateNotification, setShowTicketUpdateNotification] = useState(false);
    const [prdUpdateDetails, setPrdUpdateDetails] = useState<{ 
      title?: string; 
      lastUpdated?: string;
      sections?: { title: string; id: string }[];
      changeCount?: number;
    }>({});
    
    const [ticketUpdateDetails, setTicketUpdateDetails] = useState<{ 
      id?: string; 
      title?: string; 
      lastUpdated?: string;
      type?: string;
      priority?: string;
      status?: string;
      changeCount?: number;
    }>({});
    
    // Get update states from workbench store
    const prdNeedsUpdate = useStore(workbenchStore.prdNeedsUpdate);
    const ticketsNeedUpdate = useStore(workbenchStore.ticketsNeedUpdate);
    
    // Update notification state when workbench store changes
    useEffect(() => {
      setShowPRDUpdateNotification(prdNeedsUpdate);
      
      // Try to get PRD details if update is detected
      if (prdNeedsUpdate) {
        try {
          const prdData = sessionStorage.getItem('current_prd');
          const prevPrdData = sessionStorage.getItem('previous_prd');
          
          if (prdData) {
            const prd = JSON.parse(prdData);
            let changeCount = 0;
            let sectionsChanged = [];
            
            // If we have previous PRD data, compare to find changes
            if (prevPrdData) {
              try {
                const prevPrd = JSON.parse(prevPrdData);
                
                // Count changed sections
                if (prd.sections && prevPrd.sections) {
                  for (const section of prd.sections) {
                    const prevSection = prevPrd.sections.find((s: { id: string }) => s.id === section.id);
                    if (!prevSection || prevSection.content !== section.content) {
                      changeCount++;
                      sectionsChanged.push({ id: section.id, title: section.title });
                    }
                  }
                }
                
                // Check if title or description changed
                if (prd.title !== prevPrd.title || prd.description !== prevPrd.description) {
                  changeCount++;
                }
              } catch (e) {
                console.error('Error comparing PRD versions:', e);
              }
            }
            
            setPrdUpdateDetails({
              title: prd.title || 'Product Requirements',
              lastUpdated: prd.lastUpdated || new Date().toISOString(),
              sections: sectionsChanged.slice(0, 3), // Limit to 3 changed sections
              changeCount: changeCount || undefined
            });
          }
        } catch (error) {
          console.error('Error parsing PRD data:', error);
        }
      }
    }, [prdNeedsUpdate]);
    
    useEffect(() => {
      setShowTicketUpdateNotification(ticketsNeedUpdate);
      
      // Try to get Ticket details if update is detected
      if (ticketsNeedUpdate) {
        try {
          const ticketsData = sessionStorage.getItem('current_tickets');
          const prevTicketsData = sessionStorage.getItem('previous_tickets');
          
          if (ticketsData) {
            const tickets = JSON.parse(ticketsData);
            if (tickets && tickets.length > 0) {
              // Use the most recently updated ticket for the notification
              const latestTicket = [...tickets].sort((a, b) => 
                new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
              )[0];
              
              let changeCount = 0;
              
              // If we have previous tickets data, compare to find changes
              if (prevTicketsData) {
                try {
                  const prevTickets = JSON.parse(prevTicketsData);
                  
                  // Count changed or new tickets
                  if (prevTickets && prevTickets.length > 0) {
                    for (const ticket of tickets) {
                      const prevTicket = prevTickets.find((t: { id: string }) => t.id === ticket.id);
                      if (!prevTicket) {
                        // New ticket
                        changeCount++;
                      } else if (
                        prevTicket.title !== ticket.title || 
                        prevTicket.description !== ticket.description ||
                        prevTicket.priority !== ticket.priority ||
                        prevTicket.status !== ticket.status ||
                        prevTicket.type !== ticket.type
                      ) {
                        // Changed ticket
                        changeCount++;
                      }
                    }
                  } else {
                    // All tickets are new
                    changeCount = tickets.length;
                  }
                } catch (e) {
                  console.error('Error comparing ticket versions:', e);
                }
              } else {
                // All tickets are new
                changeCount = tickets.length;
              }
              
              setTicketUpdateDetails({
                id: latestTicket.id,
                title: latestTicket.title,
                lastUpdated: latestTicket.updatedAt,
                type: latestTicket.type,
                priority: latestTicket.priority,
                status: latestTicket.status,
                changeCount: changeCount || undefined
              });
            }
          }
        } catch (error) {
          console.error('Error parsing Tickets data:', error);
        }
      }
    }, [ticketsNeedUpdate]);
    
    // Listen for storage events to detect changes in PRD and Tickets
    useEffect(() => {
      const handleStorageChange = (event: StorageEvent) => {
        // Listen for PRD updates
        if (event.key === 'current_prd' && event.newValue !== null) {
          workbenchStore.updatePRD();
        }
        
        // Listen for Ticket updates
        if (event.key === 'tickets' && event.newValue !== null) {
          workbenchStore.updateTickets();
        }
      };
      
      window.addEventListener('storage', handleStorageChange);
      
      return () => {
        window.removeEventListener('storage', handleStorageChange);
      };
    }, []);
    
    // Function to handle regeneration of prototype with PRD and Ticket information
    const handleRegeneratePrototype = () => {
      // Get PRD and Ticket data from sessionStorage
      const prdData = sessionStorage.getItem('current_prd');
      const ticketData = sessionStorage.getItem('tickets');
      
      let prdContext = '';
      let ticketsContext = '';
      
      // Parse PRD data
      if (prdData) {
        try {
          const parsedPRD: { title: string; description: string; sections: { title: string; content: string }[] } = JSON.parse(prdData);
          prdContext = `PRD Title: ${parsedPRD.title}\n\nPRD Description: ${parsedPRD.description}\n\nPRD Sections:\n`;
          
          // Add each section
          parsedPRD.sections.forEach((section: { title: string; content: string }, index: number) => {
            prdContext += `${section.title}:\n${section.content}\n\n`;
          });
        } catch (error) {
          logger.error('Error parsing PRD data:', error);
          prdContext = 'Error parsing PRD data. Please check the console for details.';
        }
      }
      
      // Parse Ticket data
      if (ticketData) {
        try {
          const parsedTickets: { title: string; type: string; priority: string; description: string }[] = JSON.parse(ticketData);
          ticketsContext = `Tickets:\n`;
          
          // Add each ticket
          parsedTickets.forEach((ticket: { title: string; type: string; priority: string; description: string }, index: number) => {
            ticketsContext += `Ticket ${index + 1}: ${ticket.title} (${ticket.type}, Priority: ${ticket.priority})\n`;
            ticketsContext += `Description: ${ticket.description}\n\n`;
          });
        } catch (error) {
          logger.error('Error parsing Ticket data:', error);
          ticketsContext = 'Error parsing Ticket data. Please check the console for details.';
        }
      }
      
      // Create regeneration prompt
      const regenerationPrompt = `The PRD and/or Tickets have been updated. Please regenerate the prototype based on the following information:
      
${prdContext}

${ticketsContext}

Please provide a comprehensive prototype design that addresses all the requirements specified in the PRD and tickets.`;
      
      // Append the regeneration prompt as a user message
      append({
        role: 'user',
        content: regenerationPrompt
      });
      
      // Acknowledge updates
      workbenchStore.acknowledgePRDUpdate();
      workbenchStore.acknowledgeTicketsUpdate();
      setShowPRDUpdateNotification(false);
      setShowTicketUpdateNotification(false);
      
      // Notify the user
      toast.info('Regenerating prototype based on updated PRD and Tickets.');
    };
    
    // Function to handle validation of the current prototype
    const handleValidatePrototype = () => {
      // Original detailed validation prompt
      const validationPrompt = 'Please validate the current prototype and identify any issues. Fix these issues and ensure we can display something for the user in preview. Please provide full solution using modern implementation.';
      
      // Add a user-visible notification message in the chat
      append({
        role: 'system',
        content: '🔍 Validating the current prototype and fixing any issues...'
      });
      
      // Send the detailed prompt as a hidden message using the annotations property
      append({
        role: 'user',
        content: validationPrompt,
        annotations: ['hidden'] // This will hide the message in the Messages component
      });
      
      // Acknowledge updates without regenerating
      workbenchStore.acknowledgePRDUpdate();
      workbenchStore.acknowledgeTicketsUpdate();
      setShowPRDUpdateNotification(false);
      setShowTicketUpdateNotification(false);
      
      // Notify the user with a toast
      toast.info('Validating and fixing issues with the current prototype...');
      
      // Scroll to the bottom of the chat
      setTimeout(() => {
        const chatContainer = document.querySelector('.messages-container');
        if (chatContainer) {
          chatContainer.scrollTop = chatContainer.scrollHeight;
        }
      }, 100);
    };
    
    const files = useStore(workbenchStore.files);
    const actionAlert = useStore(workbenchStore.alert);
    const deployAlert = useStore(workbenchStore.deployAlert);
    const supabaseConn = useStore(supabaseConnection); // Add this line to get Supabase connection
    const selectedProject = supabaseConn.stats?.projects?.find(
      (project) => project.id === supabaseConn.selectedProjectId,
    );
    const supabaseAlert = useStore(workbenchStore.supabaseAlert);
    const { activeProviders, promptId, autoSelectTemplate, contextOptimizationEnabled } = useSettings();

    const [model, setModel] = useState(() => {
      const savedModel = Cookies.get('selectedModel');
      return savedModel || DEFAULT_MODEL;
    });
    const [provider, setProvider] = useState(() => {
      const savedProvider = Cookies.get('selectedProvider');
      return (PROVIDER_LIST.find((p) => p.name === savedProvider) || DEFAULT_PROVIDER) as ProviderInfo;
    });

    const { showChat } = useStore(chatStore);

    const [animationScope, animate] = useAnimate();

    const [apiKeys, setApiKeys] = useState<Record<string, string>>({});

    const {
      messages,
      isLoading,
      input,
      handleInputChange,
      setInput,
      stop,
      append,
      setMessages,
      reload,
      error,
      data: chatData,
      setData,
    } = useChat({
      api: '/api/chat',
      body: {
        apiKeys,
        files,
        promptId,
        contextOptimization: contextOptimizationEnabled,
        supabase: {
          isConnected: supabaseConn.isConnected,
          hasSelectedProject: !!selectedProject,
          credentials: {
            supabaseUrl: supabaseConn?.credentials?.supabaseUrl,
            anonKey: supabaseConn?.credentials?.anonKey,
          },
        },
      },
      sendExtraMessageFields: true,
      onError: (e) => {
        logger.error('Request failed\n\n', e, error);
        logStore.logError('Chat request failed', e, {
          component: 'Chat',
          action: 'request',
          error: e.message,
        });
        toast.error(
          'There was an error processing your request: ' + (e.message ? e.message : 'No details were returned'),
        );
      },
      onFinish: (message, response) => {
        const usage = response.usage;
        setData(undefined);

        if (usage) {
          console.log('Token usage:', usage);
          logStore.logProvider('Chat response completed', {
            component: 'Chat',
            action: 'response',
            model,
            provider: provider.name,
            usage,
            messageLength: message.content.length,
          });
        }

        logger.debug('Finished streaming');
      },
      initialMessages,
      initialInput: Cookies.get(PROMPT_COOKIE_KEY) || '',
    });
    useEffect(() => {
      const prompt = searchParams.get('prompt');

      // console.log(prompt, searchParams, model, provider);

      if (prompt) {
        setSearchParams({});
        runAnimation();
        append({
          role: 'user',
          content: [
            {
              type: 'text',
              text: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${prompt}`,
            },
          ] as any, // Type assertion to bypass compiler check
        });
      }
    }, [model, provider, searchParams]);

    const { enhancingPrompt, promptEnhanced, enhancePrompt, resetEnhancer } = usePromptEnhancer();
    const { parsedMessages, parseMessages } = useMessageParser();

    const TEXTAREA_MAX_HEIGHT = chatStarted ? 400 : 200;

    useEffect(() => {
      chatStore.setKey('started', initialMessages.length > 0);
    }, []);

    useEffect(() => {
      processSampledMessages({
        messages,
        initialMessages,
        isLoading,
        parseMessages,
        storeMessageHistory,
      });
    }, [messages, isLoading, parseMessages]);

    const scrollTextArea = () => {
      const textarea = textareaRef.current;

      if (textarea) {
        textarea.scrollTop = textarea.scrollHeight;
      }
    };

    const abort = () => {
      stop();
      chatStore.setKey('aborted', true);
      workbenchStore.abortAllActions();

      logStore.logProvider('Chat response aborted', {
        component: 'Chat',
        action: 'abort',
        model,
        provider: provider.name,
      });
    };

    useEffect(() => {
      const textarea = textareaRef.current;

      if (textarea) {
        textarea.style.height = 'auto';

        const scrollHeight = textarea.scrollHeight;

        textarea.style.height = `${Math.min(scrollHeight, TEXTAREA_MAX_HEIGHT)}px`;
        textarea.style.overflowY = scrollHeight > TEXTAREA_MAX_HEIGHT ? 'auto' : 'hidden';
      }
    }, [input, textareaRef]);

    const runAnimation = async () => {
      if (chatStarted) {
        return;
      }

      await Promise.all([
        animate('#examples', { opacity: 0, display: 'none' }, { duration: 0.1 }),
        animate('#intro', { opacity: 0, flex: 1 }, { duration: 0.2, ease: cubicEasingFn }),
      ]);

      chatStore.setKey('started', true);

      setChatStarted(true);
    };

    const sendMessage = async (_event: React.UIEvent, messageInput?: string) => {
      const messageContent = messageInput || input;

      if (!messageContent?.trim()) {
        return;
      }

      if (isLoading) {
        abort();
        return;
      }

      if (!chatStarted) {
        setFakeLoading(true);

        if (autoSelectTemplate) {
          const { template, title } = await selectStarterTemplate({
            message: messageContent,
            model,
            provider,
          });

          if (template !== 'blank') {
            const temResp = await getTemplates(template, title).catch((e) => {
              if (e.message.includes('rate limit')) {
                toast.warning('Rate limit exceeded. Skipping starter template\n Continuing with blank template');
              } else {
                toast.warning('Failed to import starter template\n Continuing with blank template');
              }

              return null;
            });

            if (temResp) {
              const { assistantMessage, userMessage } = temResp;
              setMessages([
                {
                  id: `1-${new Date().getTime()}`,
                  role: 'user',
                  content: [
                    {
                      type: 'text',
                      text: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${messageContent}`,
                    },
                    ...imageDataList.map((imageData) => ({
                      type: 'image',
                      image: imageData,
                    })),
                  ] as any, // Type assertion to bypass compiler check
                },
                {
                  id: `2-${new Date().getTime()}`,
                  role: 'assistant',
                  content: assistantMessage,
                },
                {
                  id: `3-${new Date().getTime()}`,
                  role: 'user',
                  content: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${userMessage}`,
                  annotations: ['hidden'],
                },
              ]);
              reload();
              setInput('');
              Cookies.remove(PROMPT_COOKIE_KEY);

              setUploadedFiles([]);
              setImageDataList([]);

              resetEnhancer();

              textareaRef.current?.blur();
              setFakeLoading(false);

              return;
            }
          }
        }

        // If autoSelectTemplate is disabled or template selection failed, proceed with normal message
        setMessages([
          {
            id: `${new Date().getTime()}`,
            role: 'user',
            content: [
              {
                type: 'text',
                text: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${messageContent}`,
              },
              ...imageDataList.map((imageData) => ({
                type: 'image',
                image: imageData,
              })),
            ] as any,
          },
        ]);
        reload();
        setFakeLoading(false);
        setInput('');
        Cookies.remove(PROMPT_COOKIE_KEY);

        setUploadedFiles([]);
        setImageDataList([]);

        resetEnhancer();

        textareaRef.current?.blur();

        return;
      }

      if (error != null) {
        setMessages(messages.slice(0, -1));
      }

      const modifiedFiles = workbenchStore.getModifiedFiles();

      chatStore.setKey('aborted', false);

      if (modifiedFiles !== undefined) {
        const userUpdateArtifact = filesToArtifacts(modifiedFiles, `${Date.now()}`);
        append({
          role: 'user',
          content: [
            {
              type: 'text',
              text: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${userUpdateArtifact}${messageContent}`,
            },
            ...imageDataList.map((imageData) => ({
              type: 'image',
              image: imageData,
            })),
          ] as any,
        });

        workbenchStore.resetAllFileModifications();
      } else {
        append({
          role: 'user',
          content: [
            {
              type: 'text',
              text: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${messageContent}`,
            },
            ...imageDataList.map((imageData) => ({
              type: 'image',
              image: imageData,
            })),
          ] as any,
        });
      }

      setInput('');
      Cookies.remove(PROMPT_COOKIE_KEY);

      setUploadedFiles([]);
      setImageDataList([]);

      resetEnhancer();

      textareaRef.current?.blur();
      
      // Make sure we stay in chat mode even if PRD is running in background
      chatType.set('chat');
    };

    /**
     * Handles the change event for the textarea and updates the input state.
     * @param event - The change event from the textarea.
     */
    const onTextareaChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      handleInputChange(event);
    };

    /**
     * Debounced function to cache the prompt in cookies.
     * Caches the trimmed value of the textarea input after a delay to optimize performance.
     */
    const debouncedCachePrompt = useCallback(
      debounce((event: React.ChangeEvent<HTMLTextAreaElement>) => {
        const trimmedValue = event.target.value.trim();
        Cookies.set(PROMPT_COOKIE_KEY, trimmedValue, { expires: 30 });
      }, 1000),
      [],
    );

    const { containerRef, isStickToBottom, scrollToBottom } = useStickToBottom();

    useEffect(() => {
      const storedApiKeys = Cookies.get('apiKeys');

      if (storedApiKeys) {
        setApiKeys(JSON.parse(storedApiKeys));
      }
    }, []);

    const handleModelChange = (newModel: string) => {
      setModel(newModel);
      Cookies.set('selectedModel', newModel, { expires: 30 });
    };

    const handleProviderChange = (newProvider: ProviderInfo) => {
      setProvider(newProvider);
      Cookies.set('selectedProvider', newProvider.name, { expires: 30 });
    };

    return (
      <BaseChat
        ref={animationScope}
        textareaRef={textareaRef}
        input={input}
        showChat={showChat}
        chatStarted={chatStarted}
        isStreaming={isLoading || fakeLoading}
        onStreamingChange={(streaming) => {
          streamingState.set(streaming);
        }}
        enhancingPrompt={enhancingPrompt}
        promptEnhanced={promptEnhanced}
        sendMessage={sendMessage}
        triggerChatStart={runAnimation}
        model={model}
        setModel={handleModelChange}
        provider={provider}
        setProvider={handleProviderChange}
        providerList={activeProviders}
        messageRef={containerRef}
        scrollRef={scrollToBottom}
        handleInputChange={(e) => {
          onTextareaChange(e);
          debouncedCachePrompt(e);
        }}
        handleStop={abort}
        description={description}
        importChat={importChat}
        exportChat={exportChat}
        messages={messages.map((message, i) => {
          if (message.role === 'user') {
            return message;
          }

          return {
            ...message,
            content: parsedMessages[i] || '',
          };
        })}
        enhancePrompt={() => {
          enhancePrompt(
            input,
            (input) => {
              setInput(input);
              scrollTextArea();
            },
            model,
            provider,
            apiKeys,
          );
        }}
        uploadedFiles={uploadedFiles}
        setUploadedFiles={setUploadedFiles}
        imageDataList={imageDataList}
        setImageDataList={setImageDataList}
        actionAlert={actionAlert}
        clearAlert={() => workbenchStore.clearAlert()}
        supabaseAlert={supabaseAlert}
        clearSupabaseAlert={() => workbenchStore.clearSupabaseAlert()}
        deployAlert={deployAlert}
        clearDeployAlert={() => workbenchStore.clearDeployAlert()}
        data={chatData}
        showPRDUpdateNotification={showPRDUpdateNotification}
        showTicketUpdateNotification={showTicketUpdateNotification}
        prdUpdateDetails={prdUpdateDetails}
        ticketUpdateDetails={ticketUpdateDetails}
        handleRegeneratePrototype={handleRegeneratePrototype}
        handleValidatePrototype={handleValidatePrototype}
      />
    );
  },
);
