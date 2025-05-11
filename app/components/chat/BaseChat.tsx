/*
 * @ts-nocheck
 * Preventing TS checks with files presented in the video for a better presentation.
 */
import type { JSONValue, Message } from 'ai';
import React, { type RefCallback, useEffect, useState, useRef } from 'react';
import { ClientOnly } from 'remix-utils/client-only';
import { Menu } from '~/components/sidebar/Menu.client';
import { IconButton } from '~/components/ui/IconButton';
import { Workbench } from '~/components/workbench/Workbench.client';
import { classNames } from '~/utils/classNames';
import { PROVIDER_LIST } from '~/utils/constants';
import { Messages } from './Messages.client';
import { SendButton } from './SendButton.client';
import { APIKeyManager, getApiKeysFromCookies } from './APIKeyManager';
import Cookies from 'js-cookie';
import * as Tooltip from '@radix-ui/react-tooltip';
import { useStore } from '@nanostores/react';
import { motion } from 'framer-motion';

import styles from './BaseChat.module.scss';
import { ExportChatButton } from '~/components/chat/chatExportAndImport/ExportChatButton';
import { ImportButtons } from '~/components/chat/chatExportAndImport/ImportButtons';
import { ExamplePrompts } from '~/components/chat/ExamplePrompts';
import GitCloneButton from './GitCloneButton';

import FilePreview from './FilePreview';
import { ModelSelector } from '~/components/chat/ModelSelector';
import { SpeechRecognitionButton } from '~/components/chat/SpeechRecognition';
import type { ProviderInfo } from '~/types/model';
import { ScreenshotStateManager } from './ScreenshotStateManager';
import { toast } from 'react-toastify';
import StarterTemplates from './StarterTemplates';
import type { ActionAlert, SupabaseAlert, DeployAlert } from '~/types/actions';
import DeployChatAlert from '~/components/deploy/DeployAlert';
import ChatAlert from './ChatAlert';
import type { ModelInfo } from '~/lib/modules/llm/types';
import ProgressCompilation from './ProgressCompilation';
import type { ProgressAnnotation } from '~/types/context';
import type { ActionRunner } from '~/lib/runtime/action-runner';
import { LOCAL_PROVIDERS } from '~/lib/stores/settings';
import { SupabaseChatAlert } from '~/components/chat/SupabaseAlert';
import { SupabaseConnection } from './SupabaseConnection';
import PRDChat from './PRDChat.client';
import PRDWorkbench from '../workbench/PRDWorkbench.client';
import { workbenchStore } from '~/lib/stores/workbench';
import { atom } from 'nanostores';
import TicketChat from './TicketChat.client';
import TicketWorkbench from '../workbench/TicketWorkbench.client';
import ResearchChat from './ResearchChat.client';
import ResearchWorkbench from '../workbench/ResearchWorkbench.client';
import { UpdateNotification } from './UpdateNotification';
import { StickToBottom, useStickToBottomContext } from '~/lib/hooks';

const TEXTAREA_MIN_HEIGHT = 76;

interface BaseChatProps {
  textareaRef?: React.RefObject<HTMLTextAreaElement> | undefined;
  messageRef?: RefCallback<HTMLDivElement> | undefined;
  scrollRef?: RefCallback<HTMLDivElement> | undefined;
  showChat?: boolean;
  chatStarted?: boolean;
  isStreaming?: boolean;
  onStreamingChange?: (streaming: boolean) => void;
  messages?: Message[];
  description?: string;
  enhancingPrompt?: boolean;
  promptEnhanced?: boolean;
  input?: string;
  model?: string;
  setModel?: (model: string) => void;
  provider?: ProviderInfo;
  setProvider?: (provider: ProviderInfo) => void;
  providerList?: ProviderInfo[];
  handleStop?: () => void;
  sendMessage?: (event: React.UIEvent, messageInput?: string) => void;
  triggerChatStart?: () => Promise<void>;
  handleInputChange?: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  enhancePrompt?: () => void;
  importChat?: (description: string, messages: Message[]) => Promise<void>;
  exportChat?: () => void;
  uploadedFiles?: File[];
  setUploadedFiles?: (files: File[]) => void;
  imageDataList?: string[];
  setImageDataList?: (dataList: string[]) => void;
  actionAlert?: ActionAlert;
  clearAlert?: () => void;
  supabaseAlert?: SupabaseAlert;
  clearSupabaseAlert?: () => void;
  deployAlert?: DeployAlert;
  clearDeployAlert?: () => void;
  data?: JSONValue[] | undefined;
  actionRunner?: ActionRunner;
  showPRDUpdateNotification?: boolean;
  showTicketUpdateNotification?: boolean;
  handleRegeneratePrototype?: () => void;
  prdUpdateDetails?: { title?: string; lastUpdated?: string };
  ticketUpdateDetails?: { id?: string; title?: string; lastUpdated?: string };
  handleValidatePrototype?: () => void;
}

export const initialPrdMessageStore = atom<{
  text: string;
  files: File[];
  imageDataList: string[];
  autoSubmit: boolean;
}>({
  text: '',
  files: [],
  imageDataList: [],
  autoSubmit: false,
});

export const initialTicketMessageStore = atom<{
  text: string;
  files: File[];
  imageDataList: string[];
  autoSubmit: boolean;
}>({
  text: '',
  files: [],
  imageDataList: [],
  autoSubmit: false,
});

export const initialResearchMessageStore = atom<{
  text: string;
  files: File[];
  imageDataList: string[];
  autoSubmit: boolean;
}>({
  text: '',
  files: [],
  imageDataList: [],
  autoSubmit: false,
});

type ChatMode = 'chat' | 'prd' | 'ticket' | 'research';

const RotatingText = () => {
  const words = ["Prototypes", "PRDs", "Tickets", "Research"];
  const [currentIndex, setCurrentIndex] = useState(0);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % words.length);
    }, 2000); // Change word every 2 seconds
    
    return () => clearInterval(interval);
  }, []);
  
  return (
    <div className="relative inline-block overflow-hidden">
      {words.map((word, index) => (
        <div
          key={word}
          className={classNames(
            "absolute transition-all duration-500 ease-in-out whitespace-nowrap",
            index === currentIndex 
              ? "opacity-100 transform-none" 
              : "opacity-0 translate-y-8"
          )}
        >
          {word}
        </div>
      ))}
    </div>
  );
};

function ScrollToBottom() {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  return (
    !isAtBottom && (
      <button
        className="absolute z-50 top-[0%] translate-y-[-100%] text-4xl rounded-lg left-[50%] translate-x-[-50%] px-1.5 py-0.5 flex items-center gap-2 bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor text-bolt-elements-textPrimary text-sm"
        onClick={() => scrollToBottom()}
      >
        Go to last message
        <span className="i-ph:arrow-down animate-bounce" />
      </button>
    )
  );
}

// Add this new component for the typing animation
const TypingPlaceholder = () => {
  const [displayText, setDisplayText] = useState("");
  const [currentPhrase, setCurrentPhrase] = useState(0);
  const [isTyping, setIsTyping] = useState(true);
  const [charIndex, setCharIndex] = useState(0);
  
  const phrases = [
    "create an awesome prototype",
    "draft a product requirements doc",
    "write and push tickets to Linear or Jira",
    "put together a market research report"
  ];
  
  useEffect(() => {
    const typingSpeed = 70; // ms per character
    const backspaceSpeed = 30; // ms per character
    const pauseBeforeBackspace = 1500; // ms to wait before backspacing
    
    let timer: ReturnType<typeof setTimeout>;
    
    if (isTyping) {
      // Typing forward
      if (charIndex < phrases[currentPhrase].length) {
        timer = setTimeout(() => {
          setDisplayText(phrases[currentPhrase].substring(0, charIndex + 1));
          setCharIndex(charIndex + 1);
        }, typingSpeed);
      } else {
        // Finished typing current phrase
        timer = setTimeout(() => {
          setIsTyping(false);
        }, pauseBeforeBackspace);
      }
    } else {
      // Backspacing
      if (charIndex > 0) {
        timer = setTimeout(() => {
          setDisplayText(phrases[currentPhrase].substring(0, charIndex - 1));
          setCharIndex(charIndex - 1);
        }, backspaceSpeed);
      } else {
        // Finished backspacing, move to next phrase
        setCurrentPhrase((currentPhrase + 1) % phrases.length);
        setIsTyping(true);
      }
    }
    
    return () => clearTimeout(timer);
  }, [charIndex, currentPhrase, isTyping, phrases]);
  
  return (
    <>
      Focus can help you {displayText}
      <span className="animate-blink">|</span>
    </>
  );
};

export const BaseChat = React.forwardRef<HTMLDivElement, BaseChatProps>(
  (
    {
      textareaRef,
      messageRef,
      scrollRef,
      showChat = true,
      chatStarted = false,
      isStreaming = false,
      onStreamingChange,
      model,
      setModel,
      provider,
      setProvider,
      providerList,
      input = '',
      enhancingPrompt,
      handleInputChange,

      // promptEnhanced,
      enhancePrompt,
      sendMessage,
      triggerChatStart,
      handleStop,
      importChat,
      exportChat,
      uploadedFiles = [],
      setUploadedFiles,
      imageDataList = [],
      setImageDataList,
      messages,
      actionAlert,
      clearAlert,
      deployAlert,
      clearDeployAlert,
      supabaseAlert,
      clearSupabaseAlert,
      data,
      actionRunner,
      showPRDUpdateNotification,
      showTicketUpdateNotification,
      handleRegeneratePrototype,
      prdUpdateDetails,
      ticketUpdateDetails,
      handleValidatePrototype,
    },
    ref,
  ) => {
    const TEXTAREA_MAX_HEIGHT = chatStarted ? 400 : 200;
    const [apiKeys, setApiKeys] = useState<Record<string, string>>(getApiKeysFromCookies());
    const [modelList, setModelList] = useState<ModelInfo[]>([]);
    const [isModelSettingsCollapsed, setIsModelSettingsCollapsed] = useState(true);
    const [isListening, setIsListening] = useState(false);
    const [recognition, setRecognition] = useState<SpeechRecognition | null>(null);
    const [transcript, setTranscript] = useState('');
    const [isModelLoading, setIsModelLoading] = useState<string | undefined>('all');
    const [progressAnnotations, setProgressAnnotations] = useState<ProgressAnnotation[]>([]);
    const [chatMode, setChatMode] = useState<ChatMode>('chat');
    const [isPrdModeToggleOn, setIsPrdModeToggleOn] = useState(true);
    const [isTicketModeToggleOn, setIsTicketModeToggleOn] = useState(true);
    const [isResearchModeToggleOn, setIsResearchModeToggleOn] = useState(false);
    const showWorkbench = useStore(workbenchStore.showWorkbench);

    useEffect(() => {
      if (data) {
        const progressList = data.filter(
          (x) => typeof x === 'object' && (x as any).type === 'progress',
        ) as ProgressAnnotation[];
        setProgressAnnotations(progressList);
      }
    }, [data]);

    useEffect(() => {
      onStreamingChange?.(isStreaming);
    }, [isStreaming, onStreamingChange]);

    useEffect(() => {
      if (typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onresult = (event) => {
          const transcript = Array.from(event.results)
            .map((result) => result[0])
            .map((result) => result.transcript)
            .join('');

          setTranscript(transcript);

          if (handleInputChange) {
            const syntheticEvent = {
              target: { value: transcript },
            } as React.ChangeEvent<HTMLTextAreaElement>;
            handleInputChange(syntheticEvent);
          }
        };

        recognition.onerror = (event) => {
          console.error('Speech recognition error:', event.error);
          setIsListening(false);
        };

        setRecognition(recognition);
      }
    }, []);

    useEffect(() => {
      if (typeof window !== 'undefined') {
        let parsedApiKeys: Record<string, string> | undefined = {};

        try {
          parsedApiKeys = getApiKeysFromCookies();
          setApiKeys(parsedApiKeys);
        } catch (error) {
          console.error('Error loading API keys from cookies:', error);
          Cookies.remove('apiKeys');
        }

        setIsModelLoading('all');
        fetch('/api/models')
          .then((response) => response.json())
          .then((data) => {
            const typedData = data as { modelList: ModelInfo[] };
            setModelList(typedData.modelList);
          })
          .catch((error) => {
            console.error('Error fetching model list:', error);
          })
          .finally(() => {
            setIsModelLoading(undefined);
          });
      }
    }, [providerList, provider]);

    const onApiKeysChange = async (providerName: string, apiKey: string) => {
      const newApiKeys = { ...apiKeys, [providerName]: apiKey };
      setApiKeys(newApiKeys);
      Cookies.set('apiKeys', JSON.stringify(newApiKeys));

      setIsModelLoading(providerName);

      let providerModels: ModelInfo[] = [];

      try {
        const response = await fetch(`/api/models/${encodeURIComponent(providerName)}`);
        const data = await response.json();
        providerModels = (data as { modelList: ModelInfo[] }).modelList;
      } catch (error) {
        console.error('Error loading dynamic models for:', providerName, error);
      }

      // Only update models for the specific provider
      setModelList((prevModels) => {
        const otherModels = prevModels.filter((model) => model.provider !== providerName);
        return [...otherModels, ...providerModels];
      });
      setIsModelLoading(undefined);
    };

    const startListening = () => {
      if (recognition) {
        recognition.start();
        setIsListening(true);
      }
    };

    const stopListening = () => {
      if (recognition) {
        recognition.stop();
        setIsListening(false);
      }
    };

    const handleSendMessage = (event: React.UIEvent, messageInput?: string) => {
      event.preventDefault();

      const messageContent = messageInput ?? input;

      if (!messageContent && uploadedFiles.length === 0) {
        return;
      }

      // Logic for handling the first message
      if (!chatStarted && triggerChatStart) {
        // For the first message, if we are in browser environment, send a message to the parent
        // to check for authentication before proceeding
        if (typeof window !== 'undefined') {
          // Always send a message to parent frame to check authentication and process message,
          // regardless of whether user is already authenticated
          window.parent.postMessage({
            type: 'SEND_MESSAGE',
            prompt: messageContent,
            files: uploadedFiles || [],
            imageDataList: imageDataList || []
          }, '*');

          // Listen for a PROCESS_PENDING_PROMPT message from the parent frame
          // This will be sent after authentication is complete
          const processPendingPromptHandler = (event: MessageEvent) => {
            if (event.data && event.data.type === 'PROCESS_PENDING_PROMPT') {
              console.log('Received pending prompt to process:', event.data.prompt);
              
              // Remove the event listener to avoid duplicate handling
              window.removeEventListener('message', processPendingPromptHandler);
              
              try {
                // Now trigger the chat start and send the message
                triggerChatStart().then(() => {
                  // If PRD mode is on, store the message for PRD processing but don't switch UI
                  if (isPrdModeToggleOn) {
                    // First reset the store to clear any previous data
                    initialPrdMessageStore.set({
                      text: '',
                      files: [],
                      imageDataList: [],
                      autoSubmit: false
                    });
                    
                    // Then store the message content and files in the store for PRDChat to use in background
                    initialPrdMessageStore.set({
                      text: event.data.prompt,
                      files: event.data.files || [],
                      imageDataList: event.data.imageDataList || [],
                      autoSubmit: true
                    });
                  }
                  
                  // If Ticket mode is on, store the message for Ticket processing but don't switch UI
                  if (isTicketModeToggleOn) {
                    // First reset the store to clear any previous data
                    initialTicketMessageStore.set({
                      text: '',
                      files: [],
                      imageDataList: [],
                      autoSubmit: false
                    });
                    
                    // Then store the message content and files in the store for TicketChat to use in background
                    initialTicketMessageStore.set({
                      text: event.data.prompt,
                      files: event.data.files || [],
                      imageDataList: event.data.imageDataList || [],
                      autoSubmit: true
                    });
                  }
                  
                  // If Research mode is on, store the message for Research processing but don't switch UI
                  if (isResearchModeToggleOn) {
                    // First reset the store to clear any previous data
                    initialResearchMessageStore.set({
                      text: '',
                      files: [],
                      imageDataList: [],
                      autoSubmit: false
                    });
                    
                    // Then store the message content and files in the store for ResearchChat to use in background
                    initialResearchMessageStore.set({
                      text: event.data.prompt,
                      files: event.data.files || [],
                      imageDataList: event.data.imageDataList || [],
                      autoSubmit: true
                    });
                  }
                  
                  // Send the message to the chat
                  if (sendMessage) {
                    console.log('Sending message after authentication:', event.data.prompt);
                    sendMessage({} as any, event.data.prompt);
                    
                    // Let parent know the message was sent successfully
                    window.parent.postMessage({
                      type: 'MESSAGE_SENT_SUCCESS',
                      promptProcessed: true
                    }, '*');
                  }
                }).catch(error => {
                  console.error('Error processing prompt after authentication:', error);
                  
                  // Let parent know there was an error
                  window.parent.postMessage({
                    type: 'MESSAGE_SENT_ERROR',
                    error: error.message
                  }, '*');
                });
              } catch (error) {
                console.error('Exception during prompt processing:', error);
              }
            }
          };
          
          // Add the event listener for the PROCESS_PENDING_PROMPT message
          window.addEventListener('message', processPendingPromptHandler);
          
          // Also send a message to confirm we're listening
          window.parent.postMessage({
            type: 'READY_FOR_PROMPT',
            timestamp: Date.now()
          }, '*');
          
          console.log('Ready to receive PROCESS_PENDING_PROMPT message');
          
          // Return early to prevent the regular flow
          return;
        }

        // If we're not in the browser or we didn't return above, continue with the regular flow
        triggerChatStart(); // Mark chat as started regardless of mode
        
        // If PRD mode is on, store the message for PRD processing but don't switch UI
        if (isPrdModeToggleOn) {
          // First reset the store to clear any previous data
          initialPrdMessageStore.set({
            text: '',
            files: [],
            imageDataList: [],
            autoSubmit: false
          });
          
          // Then store the message content and files in the store for PRDChat to use in background
          initialPrdMessageStore.set({
            text: messageContent,
            files: uploadedFiles || [],
            imageDataList: imageDataList || [],
            autoSubmit: true
          });
          
          // Don't switch to PRD mode UI, but still process in background
          // Keep the regular chat UI visible
        }
        
        // If Ticket mode is on, store the message for Ticket processing but don't switch UI
        if (isTicketModeToggleOn) {
          // First reset the store to clear any previous data
          initialTicketMessageStore.set({
            text: '',
            files: [],
            imageDataList: [],
            autoSubmit: false
          });
          
          // Then store the message content and files in the store for TicketChat to use in background
          initialTicketMessageStore.set({
            text: messageContent,
            files: uploadedFiles || [],
            imageDataList: imageDataList || [],
            autoSubmit: true
          });
          
          // Don't switch to Ticket mode UI, but still process in background
          // Keep the regular chat UI visible
        }
        
        // Commenting out as BETA feature DO NOT DELETE!!!!
        // // If Research mode is on, store the message for Research processing but don't switch UI
        // if (isResearchModeToggleOn) {
        //   // First reset the store to clear any previous data
        //   initialResearchMessageStore.set({
        //     text: '',
        //     files: [],
        //     imageDataList: [],
        //     autoSubmit: false
        //   });
          
        //   // Then store the message content and files in the store for ResearchChat to use in background
        //   initialResearchMessageStore.set({
        //     text: messageContent,
        //     files: uploadedFiles || [],
        //     imageDataList: imageDataList || [],
        //     autoSubmit: true
        //   });
          
        //   // Don't switch to Research mode UI, but still process in background
        //   // Keep the regular chat UI visible
        // }
      }

      // Always proceed with sending the message to the regular chat endpoint
      // unless we returned early above
      if (sendMessage) {
        sendMessage(event, messageInput);

        if (recognition && isListening) {
          recognition.abort();
          setTranscript('');
          setIsListening(false);

          // Clear the input by triggering handleInputChange with empty value
          if (handleInputChange) {
            const syntheticEvent = {
              target: { value: '' },
            } as React.ChangeEvent<HTMLTextAreaElement>;
            handleInputChange(syntheticEvent);
          }
        }
      }
    };

    // Add PING_CHECK handler right after other useEffects
    useEffect(() => {
      if (typeof window !== 'undefined') {
        // Listen for parent window messages
        const handleParentMessage = (event: MessageEvent) => {
          if (event.data && event.data.type === 'PING_CHECK') {
            // Respond to ping to confirm we're alive
            window.parent.postMessage({
              type: 'PONG_RESPONSE',
              timestamp: Date.now(),
              originalTimestamp: event.data.timestamp
            }, '*');
            console.log('Received ping, sent pong response');
          }
        };
        
        window.addEventListener('message', handleParentMessage);
        
        return () => {
          window.removeEventListener('message', handleParentMessage);
        };
      }
    }, []);

    const handleFileUpload = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';

      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];

        if (file) {
          const reader = new FileReader();

          reader.onload = (e) => {
            const base64Image = e.target?.result as string;
            setUploadedFiles?.([...uploadedFiles, file]);
            setImageDataList?.([...imageDataList, base64Image]);
          };
          reader.readAsDataURL(file);
        }
      };

      input.click();
    };

    const handlePaste = async (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;

      if (!items) {
        return;
      }

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();

          const file = item.getAsFile();

          if (file) {
            const reader = new FileReader();

            reader.onload = (e) => {
              const base64Image = e.target?.result as string;
              setUploadedFiles?.([...uploadedFiles, file]);
              setImageDataList?.([...imageDataList, base64Image]);
            };
            reader.readAsDataURL(file);
          }

          break;
        }
      }
    };

    const baseChat = (
      <div
        ref={ref}
        className={classNames(styles.BaseChat, 'relative flex h-full w-full overflow-hidden')}
        data-chat-visible={showChat}
      >
        <ClientOnly>{() => <Menu />}</ClientOnly>
        <div ref={scrollRef} className="flex flex-col lg:flex-row w-full h-full overflow-hidden">
          <div className={classNames(styles.Chat, 'flex flex-col flex-grow lg:min-w-[var(--chat-min-width)] h-full overflow-hidden')}>
            {/* Hidden PRDChat component that runs in the background when isPrdModeToggleOn is true */}
            {isPrdModeToggleOn && chatStarted && chatMode === 'chat' && (
              <div className="hidden">
                <ClientOnly>{() => <PRDChat backgroundMode={true} />}</ClientOnly>
              </div>
            )}
            
            {/* Hidden TicketChat component that runs in the background when isTicketModeToggleOn is true */}
            {isTicketModeToggleOn && chatStarted && chatMode === 'chat' && (
                <div className="hidden">
                    <ClientOnly>{() => <TicketChat backgroundMode={true} />}</ClientOnly>
                </div>
            )}
            
            {/* Hidden ResearchChat component that runs in the background when isResearchModeToggleOn is true */}
            {isResearchModeToggleOn && chatStarted && chatMode === 'chat' && (
                <div className="hidden">
                    <ClientOnly>{() => <ResearchChat backgroundMode={true} />}</ClientOnly>
                </div>
            )}
            
            {!chatStarted && chatMode === 'chat' && (
              <div className="flex flex-col h-full overflow-y-auto">
                <div id="intro" className="mt-[6vh] mb-8 max-w-[90%] mx-auto text-center px-4 lg:px-0">
                  <h1 className="text-3xl lg:text-5xl font-bold text-bolt-elements-textPrimary mb-4 animate-fade-in flex items-center justify-center gap-2 flex-wrap lg:flex-nowrap">
                    <span>Create something in seconds</span>
                    <span className="text-bolt-elements-item-contentAccent">
                      <RotatingText />
                    </span>
                  </h1>
                  <p className="text-sm lg:text-base mb-6 text-bolt-elements-textSecondary animate-fade-in animation-delay-200">
                    Focus creates prototypes, PRDs, tickets, and research reports from a single prompt
                  </p>
                </div>
                
                {/* Input area positioned between intro and import buttons */}
                <div className="w-full max-w-chat mx-auto mb-8 px-4 lg:px-0">
                  <div className={classNames(
                    'bg-bolt-elements-background-depth-2 p-3 rounded-lg border border-bolt-elements-borderColor relative w-full',
                  )}>
                    <svg className={classNames(styles.PromptEffectContainer)}>
                      <defs>
                        <linearGradient
                          id="line-gradient"
                          x1="20%"
                          y1="0%"
                          x2="-14%"
                          y2="10%"
                          gradientUnits="userSpaceOnUse"
                          gradientTransform="rotate(-45)"
                        >
                          <stop offset="0%" stopColor="#00536b" stopOpacity="0%"></stop>
                          <stop offset="40%" stopColor="#00536b" stopOpacity="80%"></stop>
                          <stop offset="50%" stopColor="#00536b" stopOpacity="80%"></stop>
                          <stop offset="100%" stopColor="#00536b" stopOpacity="0%"></stop>
                        </linearGradient>
                        <linearGradient id="shine-gradient">
                          <stop offset="0%" stopColor="white" stopOpacity="0%"></stop>
                          <stop offset="40%" stopColor="#ffffff" stopOpacity="80%"></stop>
                          <stop offset="50%" stopColor="#ffffff" stopOpacity="80%"></stop>
                          <stop offset="100%" stopColor="white" stopOpacity="0%"></stop>
                        </linearGradient>
                      </defs>
                      <rect className={classNames(styles.PromptEffectLine)} pathLength="100" strokeLinecap="round"></rect>
                      <rect className={classNames(styles.PromptShine)} x="48" y="24" width="70" height="1"></rect>
                    </svg>
                    <div>
                      <ClientOnly>
                        {() => (
                          <div className={isModelSettingsCollapsed ? 'hidden' : ''}>
                            <ModelSelector
                              key={provider?.name + ':' + modelList.length}
                              model={model}
                              setModel={setModel}
                              modelList={modelList}
                              provider={provider}
                              setProvider={setProvider}
                              providerList={providerList || (PROVIDER_LIST as ProviderInfo[])}
                              apiKeys={apiKeys}
                              modelLoading={isModelLoading}
                            />
                            {(providerList || []).length > 0 &&
                              provider &&
                              (!LOCAL_PROVIDERS.includes(provider.name) || 'OpenAILike') && (
                                <APIKeyManager
                                  provider={provider}
                                  apiKey={apiKeys[provider.name] || ''}
                                  setApiKey={(key) => {
                                    onApiKeysChange(provider.name, key);
                                  }}
                                />
                              )}
                          </div>
                        )}
                      </ClientOnly>
                    </div>
                    <FilePreview
                      files={uploadedFiles}
                      imageDataList={imageDataList}
                      onRemove={(index) => {
                        setUploadedFiles?.(uploadedFiles.filter((_, i) => i !== index));
                        setImageDataList?.(imageDataList.filter((_, i) => i !== index));
                      }}
                    />
                    <ClientOnly>
                      {() => (
                        <ScreenshotStateManager
                          setUploadedFiles={setUploadedFiles}
                          setImageDataList={setImageDataList}
                          uploadedFiles={uploadedFiles}
                          imageDataList={imageDataList}
                        />
                      )}
                    </ClientOnly>
                    <div
                      className={classNames(
                        'relative shadow-xs border border-bolt-elements-borderColor backdrop-blur rounded-lg',
                      )}
                    >
                      <textarea
                        ref={textareaRef}
                        className={classNames(
                          'w-full pl-4 pt-4 pr-16 outline-none resize-none text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary bg-transparent text-sm',
                          'transition-all duration-200',
                          'hover:border-bolt-elements-focus',
                        )}
                        onDragEnter={(e) => {
                          e.preventDefault();
                          e.currentTarget.style.border = '2px solid #1488fc';
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.currentTarget.style.border = '2px solid #1488fc';
                        }}
                        onDragLeave={(e) => {
                          e.preventDefault();
                          e.currentTarget.style.border = '1px solid var(--bolt-elements-borderColor)';
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.currentTarget.style.border = '1px solid var(--bolt-elements-borderColor)';

                          const files = Array.from(e.dataTransfer.files);
                          files.forEach((file) => {
                            if (file.type.startsWith('image/')) {
                              const reader = new FileReader();

                              reader.onload = (e) => {
                                const base64Image = e.target?.result as string;
                                setUploadedFiles?.([...uploadedFiles, file]);
                                setImageDataList?.([...imageDataList, base64Image]);
                              };
                              reader.readAsDataURL(file);
                            }
                          });
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                            event.preventDefault();
                            if (isStreaming) {
                              handleStop?.();
                            } else {
                              handleSendMessage?.(event);
                            }
                          }
                        }}
                        value={input}
                        onChange={(event) => handleInputChange?.(event)}
                        onPaste={handlePaste}
                        style={{
                          minHeight: TEXTAREA_MIN_HEIGHT,
                          maxHeight: TEXTAREA_MAX_HEIGHT,
                        }}
                        placeholder={chatStarted ? "How can Focus help you today?" : ""}
                        translate="no"
                      />
                      {!chatStarted && input.length === 0 && (
                        <div className="absolute top-0 left-0 w-full flex items-start px-4 pt-4 text-bolt-elements-textTertiary pointer-events-none">
                          <TypingPlaceholder />
                        </div>
                      )}
                      <ClientOnly>
                        {() => (
                          <SendButton
                            show={input.length > 0 || isStreaming || uploadedFiles.length > 0}
                            isStreaming={isStreaming}
                            onClick={(event) => {
                              if (isStreaming) {
                                handleStop?.();
                              } else if (input.length > 0 || uploadedFiles.length > 0) {
                                handleSendMessage?.(event);
                              }
                            }}
                          />
                        )}
                      </ClientOnly>
                      <div className="flex justify-between items-center text-sm p-4 pt-2">
                        <div className="flex gap-1 items-center">
                          <IconButton 
                            title="Upload file" 
                            className="transition-all" 
                            onClick={() => handleFileUpload()} 
                          >
                            <div className="i-ph:paperclip text-xl"></div>
                          </IconButton>
                          <IconButton
                            title="Enhance prompt"
                            disabled={input.length === 0 || enhancingPrompt}
                            className={classNames('transition-all', enhancingPrompt ? 'opacity-100' : '')}
                            onClick={() => {
                              enhancePrompt?.();
                              toast.success('Prompt enhanced!');
                            }}
                          >
                            {enhancingPrompt ? (
                              <div className="i-svg-spinners:90-ring-with-bg text-bolt-elements-loader-progress text-xl animate-spin"></div>
                            ) : (
                              <div className="i-bolt:stars text-xl"></div>
                            )}
                          </IconButton>
                          <SpeechRecognitionButton
                            isListening={isListening}
                            onStart={startListening}
                            onStop={stopListening}
                            disabled={isStreaming}
                          />
                          {chatStarted && <ClientOnly>{() => <ExportChatButton exportChat={exportChat} />}</ClientOnly>}
                          <IconButton
                            title="Model Settings"
                            className={classNames(
                              'transition-all flex items-center gap-1',
                              {
                                'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent':
                                  isModelSettingsCollapsed,
                                'bg-bolt-elements-item-backgroundDefault text-bolt-elements-item-contentDefault':
                                  !isModelSettingsCollapsed,
                              })}
                            onClick={() => setIsModelSettingsCollapsed(!isModelSettingsCollapsed)}
                            disabled={!providerList || providerList.length === 0}
                          >
                            <div className={`i-ph:caret-${isModelSettingsCollapsed ? 'right' : 'down'} text-lg`} />
                            {isModelSettingsCollapsed ? <span className="text-xs">{model}</span> : <span />}
                          </IconButton>
                        </div>
                        <div className="flex gap-2 items-center">
                        <Tooltip.Root>
                            <Tooltip.Trigger asChild>
                              <button
                                type="button"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '4px 8px',
                                  borderRadius: '6px',
                                  border: '1px solid',
                                  fontSize: '0.8rem',
                                  fontWeight: 500,
                                  lineHeight: 1.2,
                                  cursor: chatStarted ? 'not-allowed' : 'pointer',
                                  opacity: chatStarted ? 0.5 : 1,
                                  transition: 'background-color 0.2s ease-in-out, border-color 0.2s ease-in-out, color 0.2s ease-in-out',
                                  backgroundColor: isResearchModeToggleOn
                                    ? 'var(--bolt-elements-item-backgroundAccentMuted, #eef2ff)'
                                    : 'var(--bolt-elements-background-depth-3, #f9fafb)',
                                  color: isResearchModeToggleOn
                                    ? 'var(--bolt-elements-item-contentAccent, #4f46e5)'
                                    : 'var(--bolt-elements-textSecondary, #6b7280)',
                                  borderColor: isResearchModeToggleOn
                                    ? 'var(--bolt-elements-item-borderAccent, #c7d2fe)'
                                    : 'var(--bolt-elements-borderColor, #e5e7eb)',
                                }}
                                onClick={() => !chatStarted && setIsResearchModeToggleOn(!isResearchModeToggleOn)}
                                disabled={chatStarted}
                              >
                                <span style={{}}>
                                  Research:
                                </span>
                                <span style={{ fontWeight: 600 }}>
                                  {isResearchModeToggleOn ? 'ON' : 'OFF'}
                                </span>
                              </button>
                            </Tooltip.Trigger>
                            <Tooltip.Portal>
                              <Tooltip.Content
                                className="bg-gray-800 text-white text-xs px-2 py-1 rounded shadow-lg z-50"
                                sideOffset={5}
                              >
                                Generate Research first!
                                <Tooltip.Arrow className="fill-gray-800" />
                              </Tooltip.Content>
                            </Tooltip.Portal>
                          </Tooltip.Root>
                          <Tooltip.Root>
                            <Tooltip.Trigger asChild>
                              <button
                                title={`PRD Mode: ${isPrdModeToggleOn ? 'ON' : 'OFF'}`}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '4px 8px',
                                  borderRadius: '6px',
                                  border: '1px solid',
                                  fontSize: '0.8rem',
                                  fontWeight: 500,
                                  lineHeight: 1.2,
                                  cursor: chatStarted ? 'not-allowed' : 'pointer',
                                  opacity: chatStarted ? 0.5 : 1,
                                  transition: 'background-color 0.2s ease-in-out, border-color 0.2s ease-in-out, color 0.2s ease-in-out',
                                  backgroundColor: isPrdModeToggleOn
                                    ? 'var(--bolt-elements-item-backgroundAccentMuted, #eef2ff)'
                                    : 'var(--bolt-elements-background-depth-3, #f9fafb)',
                                  color: isPrdModeToggleOn
                                    ? 'var(--bolt-elements-item-contentAccent, #4f46e5)'
                                    : 'var(--bolt-elements-textSecondary, #6b7280)',
                                  borderColor: isPrdModeToggleOn
                                    ? 'var(--bolt-elements-item-borderAccent, #c7d2fe)'
                                    : 'var(--bolt-elements-borderColor, #e5e7eb)',
                                }}
                                onClick={() => !chatStarted && setIsPrdModeToggleOn(!isPrdModeToggleOn)} //working great!
                                disabled={chatStarted}
                              >
                                <span style={{}}>
                                  PRD:
                                </span>
                                <span style={{ fontWeight: 600 }}>
                                  {isPrdModeToggleOn ? 'ON' : 'OFF'}
                                </span>
                              </button>
                            </Tooltip.Trigger>
                            <Tooltip.Portal>
                              <Tooltip.Content
                                className="bg-gray-800 text-white text-xs px-2 py-1 rounded shadow-lg z-50"
                                sideOffset={5}
                              >
                                Generate PRD first!
                                <Tooltip.Arrow className="fill-gray-800" />
                              </Tooltip.Content>
                            </Tooltip.Portal>
                          </Tooltip.Root>
                          <Tooltip.Root>
                            <Tooltip.Trigger asChild>
                              <button
                                title={`Ticket Mode: ${isTicketModeToggleOn ? 'ON' : 'OFF'}`}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '4px 8px',
                                  borderRadius: '6px',
                                  border: '1px solid',
                                  fontSize: '0.8rem',
                                  fontWeight: 500,
                                  lineHeight: 1.2,
                                  cursor: chatStarted ? 'not-allowed' : 'pointer',
                                  opacity: chatStarted ? 0.5 : 1,
                                  transition: 'background-color 0.2s ease-in-out, border-color 0.2s ease-in-out, color 0.2s ease-in-out',
                                  backgroundColor: isTicketModeToggleOn
                                    ? 'var(--bolt-elements-item-backgroundAccentMuted, #eef2ff)'
                                    : 'var(--bolt-elements-background-depth-3, #f9fafb)',
                                  color: isTicketModeToggleOn
                                    ? 'var(--bolt-elements-item-contentAccent, #4f46e5)'
                                    : 'var(--bolt-elements-textSecondary, #6b7280)',
                                  borderColor: isTicketModeToggleOn
                                    ? 'var(--bolt-elements-item-borderAccent, #c7d2fe)'
                                    : 'var(--bolt-elements-borderColor, #e5e7eb)',
                                }}
                                onClick={() => !chatStarted && setIsTicketModeToggleOn(!isTicketModeToggleOn)}
                                disabled={chatStarted}
                              >
                                <span style={{}}>
                                  Ticket:
                                </span>
                                <span style={{ fontWeight: 600 }}>
                                  {isTicketModeToggleOn ? 'ON' : 'OFF'}
                                </span>
                              </button>
                            </Tooltip.Trigger>
                            <Tooltip.Portal>
                              <Tooltip.Content
                                className="bg-gray-800 text-white text-xs px-2 py-1 rounded shadow-lg z-50"
                                sideOffset={5}
                              >
                                Generate Tickets first!
                                <Tooltip.Arrow className="fill-gray-800" />
                              </Tooltip.Content>
                            </Tooltip.Portal>
                          </Tooltip.Root>
                          {input.length > 3 ? (
                            <div className="text-xs text-bolt-elements-textTertiary">
                              Use <kbd className="kdb px-1.5 py-0.5 rounded bg-bolt-elements-background-depth-2">Shift</kbd>{' '}
                              + <kbd className="kdb px-1.5 py-0.5 rounded bg-bolt-elements-background-depth-2">Return</kbd>{' '}
                              a new line
                            </div>
                          ) : null}
                          <SupabaseConnection />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div id="examples" className="flex flex-col justify-center gap-2 mt-4 pb-4 px-2 sm:px-6">
                  <div className="flex justify-center gap-2">
                    {ImportButtons(importChat)}
                    <GitCloneButton importChat={importChat} />
                  </div>
                  {ExamplePrompts((event, messageInput) => {
                    if (handleSendMessage) {
                      handleSendMessage?.(event, messageInput);
                    }
                  })}
                  <StarterTemplates />
                </div>
              </div>
            )}
            {chatStarted && (
              <div className={classNames(
                "sticky top-0 z-10 bg-bolt-elements-background-default border-b border-bolt-elements-borderColor flex-shrink-0 transition-all duration-200 ease-in-out",
                {
                  "mr-[var(--workbench-width)]": showWorkbench && (chatMode === 'prd' || chatMode === 'ticket' || chatMode === 'research') 
                }
              )}>
                <div className="flex items-center justify-center px-6 py-3">
                  <div className="flex items-center gap-2 p-1 bg-bolt-elements-background-depth-3 rounded-lg shadow-sm">
                    {['chat', 'research', 'prd', 'ticket'].map((mode) => (
                      mode === 'research' ? (
                        // Will be enabled in the future. Leave it for now.
                        <Tooltip.Root key={mode}>
                          <Tooltip.Trigger asChild>
                            <button
                              className={classNames(
                                'px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 relative flex items-center justify-center',
                                'text-bolt-elements-textSecondary opacity-70 cursor-not-allowed'
                              )}
                              disabled={true}
                            >
                              {mode.charAt(0).toUpperCase() + mode.slice(1)}
                              <span className="ml-1 px-1 py-0.5 bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent text-[10px] font-semibold rounded">BETA</span>
                            </button>
                          </Tooltip.Trigger>
                          <Tooltip.Portal>
                            <Tooltip.Content
                              className="bg-gray-800 text-white text-xs px-2 py-1 rounded shadow-lg z-50"
                              sideOffset={5}
                            >
                              Your administrator must enable a search tool to use research
                              <Tooltip.Arrow className="fill-gray-800" />
                            </Tooltip.Content>
                          </Tooltip.Portal>
                        </Tooltip.Root>
                      ) : (
                        <button
                          key={mode}
                          onClick={() => setChatMode(mode as ChatMode)}
                          className={classNames(
                            'px-4 py-2 text-sm font-medium rounded-md transition-all duration-200',
                            chatMode === mode
                              ? 'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent shadow-sm'
                              : 'text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-4'
                          )}
                        >
                          {mode.charAt(0).toUpperCase() + mode.slice(1)}
                        </button>
                      )
                    ))}
                  </div>
                </div>
              </div>
            )}
            {chatMode === 'chat' ? (
              <StickToBottom
                className="flex-1 overflow-y-auto pt-2 flex flex-col"
                resize="smooth"
                initial="smooth"
              >
                <StickToBottom.Content className="flex flex-col gap-4">
                  <div className="flex-1 w-full max-w-chat mx-auto">
                    <ClientOnly>
                      {() => {
                        return chatStarted ? (
                          <div className={styles.chatContainer}>
                            <div className="flex flex-col h-full">
                              <div className="flex flex-col flex-1 overflow-hidden">
                                <div className="flex-1 overflow-y-auto px-4 pt-4 pb-0 sm:px-6 sm:pt-6">
                                  <Messages
                                    ref={messageRef}
                                    messages={messages}
                                    isStreaming={isStreaming}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : <div className="flex-1"></div>;
                      }}
                    </ClientOnly>
                  </div>
                </StickToBottom.Content>
                <div className="w-full max-w-chat mx-auto mb-6 space-y-4 flex-shrink-0">
                  {deployAlert && (
                    <DeployChatAlert
                      alert={deployAlert}
                      clearAlert={() => clearDeployAlert?.()}
                      postMessage={(message: string | undefined) => {
                        sendMessage?.({} as any, message);
                        clearSupabaseAlert?.();
                      }}
                    />
                  )}
                  {supabaseAlert && (
                    <SupabaseChatAlert
                      alert={supabaseAlert}
                      clearAlert={() => clearSupabaseAlert?.()}
                      postMessage={(message) => {
                        sendMessage?.({} as any, message);
                        clearSupabaseAlert?.();
                      }}
                    />
                  )}
                </div>
                <div className="w-full max-w-chat mx-auto z-prompt mb-6 flex-shrink-0 relative">
                  <ScrollToBottom />
                  <div className="bg-bolt-elements-background-depth-2 mb-4">
                    {actionAlert && (
                      <ChatAlert
                        alert={actionAlert}
                        clearAlert={() => clearAlert?.()}
                        postMessage={(message) => {
                          sendMessage?.({} as any, message);
                          clearAlert?.();
                        }}
                      />
                    )}
                  </div>
                  {showPRDUpdateNotification && !actionAlert && (
                    <div className="px-4 pb-3 flex-shrink-0">
                      <UpdateNotification
                        type="ticket" // Ticket is CORRECT here!
                        details={prdUpdateDetails}
                        onRegenerateClick={handleRegeneratePrototype || (() => {})}
                        onValidateClick={handleValidatePrototype || (() => {})}
                        />
                    </div>
                  )}
                  {showTicketUpdateNotification && !actionAlert && (
                    <div className="px-4 pb-3 flex-shrink-0">
                      <UpdateNotification
                        type="prd" // PRD is CORRECT here!
                        details={ticketUpdateDetails}
                        onRegenerateClick={handleRegeneratePrototype || (() => {})}
                        onValidateClick={handleValidatePrototype || (() => {})}
                        />
                    </div>
                  )}
                  {progressAnnotations && <ProgressCompilation data={progressAnnotations} />}
                  <div
                    className={classNames(
                      'bg-bolt-elements-background-depth-2 p-3 rounded-lg border border-bolt-elements-borderColor relative w-full',
                    )}
                  >
                    <svg className={classNames(styles.PromptEffectContainer)}>
                      <defs>
                        <linearGradient
                          id="line-gradient"
                          x1="20%"
                          y1="0%"
                          x2="-14%"
                          y2="10%"
                          gradientUnits="userSpaceOnUse"
                          gradientTransform="rotate(-45)"
                        >
                          <stop offset="0%" stopColor="#00536b" stopOpacity="0%"></stop>
                          <stop offset="40%" stopColor="#00536b" stopOpacity="80%"></stop>
                          <stop offset="50%" stopColor="#00536b" stopOpacity="80%"></stop>
                          <stop offset="100%" stopColor="#00536b" stopOpacity="0%"></stop>
                        </linearGradient>
                        <linearGradient id="shine-gradient">
                          <stop offset="0%" stopColor="white" stopOpacity="0%"></stop>
                          <stop offset="40%" stopColor="#ffffff" stopOpacity="80%"></stop>
                          <stop offset="50%" stopColor="#ffffff" stopOpacity="80%"></stop>
                          <stop offset="100%" stopColor="white" stopOpacity="0%"></stop>
                        </linearGradient>
                      </defs>
                      <rect className={classNames(styles.PromptEffectLine)} pathLength="100" strokeLinecap="round"></rect>
                      <rect className={classNames(styles.PromptShine)} x="48" y="24" width="70" height="1"></rect>
                    </svg>
                    <div>
                      <ClientOnly>
                        {() => (
                          <div className={isModelSettingsCollapsed ? 'hidden' : ''}>
                            <ModelSelector
                              key={provider?.name + ':' + modelList.length}
                              model={model}
                              setModel={setModel}
                              modelList={modelList}
                              provider={provider}
                              setProvider={setProvider}
                              providerList={providerList || (PROVIDER_LIST as ProviderInfo[])}
                              apiKeys={apiKeys}
                              modelLoading={isModelLoading}
                            />
                            {(providerList || []).length > 0 &&
                              provider &&
                              (!LOCAL_PROVIDERS.includes(provider.name) || 'OpenAILike') && (
                                <APIKeyManager
                                  provider={provider}
                                  apiKey={apiKeys[provider.name] || ''}
                                  setApiKey={(key) => {
                                    onApiKeysChange(provider.name, key);
                                  }}
                                />
                              )}
                          </div>
                        )}
                      </ClientOnly>
                    </div>
                    <FilePreview
                      files={uploadedFiles}
                      imageDataList={imageDataList}
                      onRemove={(index) => {
                        setUploadedFiles?.(uploadedFiles.filter((_, i) => i !== index));
                        setImageDataList?.(imageDataList.filter((_, i) => i !== index));
                      }}
                    />
                    <ClientOnly>
                      {() => (
                        <ScreenshotStateManager
                          setUploadedFiles={setUploadedFiles}
                          setImageDataList={setImageDataList}
                          uploadedFiles={uploadedFiles}
                          imageDataList={imageDataList}
                        />
                      )}
                    </ClientOnly>
                    <div
                      className={classNames(
                        'relative shadow-xs border border-bolt-elements-borderColor backdrop-blur rounded-lg',
                      )}
                    >
                      <textarea
                        ref={textareaRef}
                        className={classNames(
                          'w-full pl-4 pt-4 pr-16 outline-none resize-none text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary bg-transparent text-sm',
                          'transition-all duration-200',
                          'hover:border-bolt-elements-focus',
                        )}
                        onDragEnter={(e) => {
                          e.preventDefault();
                          e.currentTarget.style.border = '2px solid #1488fc';
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.currentTarget.style.border = '2px solid #1488fc';
                        }}
                        onDragLeave={(e) => {
                          e.preventDefault();
                          e.currentTarget.style.border = '1px solid var(--bolt-elements-borderColor)';
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.currentTarget.style.border = '1px solid var(--bolt-elements-borderColor)';

                          const files = Array.from(e.dataTransfer.files);
                          files.forEach((file) => {
                            if (file.type.startsWith('image/')) {
                              const reader = new FileReader();

                              reader.onload = (e) => {
                                const base64Image = e.target?.result as string;
                                setUploadedFiles?.([...uploadedFiles, file]);
                                setImageDataList?.([...imageDataList, base64Image]);
                              };
                              reader.readAsDataURL(file);
                            }
                          });
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                            event.preventDefault();
                            if (isStreaming) {
                              handleStop?.();
                            } else {
                              handleSendMessage?.(event);
                            }
                          }
                        }}
                        value={input}
                        onChange={(event) => handleInputChange?.(event)}
                        onPaste={handlePaste}
                        style={{
                          minHeight: TEXTAREA_MIN_HEIGHT,
                          maxHeight: TEXTAREA_MAX_HEIGHT,
                        }}
                        placeholder="How can Focus help you today?"
                        translate="no"
                      />
                      {!chatStarted && (
                        <div className="absolute top-0 left-0 w-full flex items-start px-4 pt-4 text-bolt-elements-textTertiary pointer-events-none">
                          <TypingPlaceholder />
                        </div>
                      )}
                      <ClientOnly>
                        {() => (
                          <SendButton
                            show={input.length > 0 || isStreaming || uploadedFiles.length > 0}
                            isStreaming={isStreaming}
                            onClick={(event) => {
                              if (isStreaming) {
                                handleStop?.();
                              } else if (input.length > 0 || uploadedFiles.length > 0) {
                                handleSendMessage?.(event);
                              }
                            }}
                          />
                        )}
                      </ClientOnly>
                      <div className="flex justify-between items-center text-sm p-4 pt-2">
                        <div className="flex gap-1 items-center">
                          <IconButton 
                            title="Upload file" 
                            className="transition-all" 
                            onClick={() => handleFileUpload()} 
                          >
                            <div className="i-ph:paperclip text-xl"></div>
                          </IconButton>
                          <IconButton
                            title="Enhance prompt"
                            disabled={input.length === 0 || enhancingPrompt}
                            className={classNames('transition-all', enhancingPrompt ? 'opacity-100' : '')}
                            onClick={() => {
                              enhancePrompt?.();
                              toast.success('Prompt enhanced!');
                            }}
                          >
                            {enhancingPrompt ? (
                              <div className="i-svg-spinners:90-ring-with-bg text-bolt-elements-loader-progress text-xl animate-spin"></div>
                            ) : (
                              <div className="i-bolt:stars text-xl"></div>
                            )}
                          </IconButton>
                          <SpeechRecognitionButton
                            isListening={isListening}
                            onStart={startListening}
                            onStop={stopListening}
                            disabled={isStreaming}
                          />
                          {chatStarted && <ClientOnly>{() => <ExportChatButton exportChat={exportChat} />}</ClientOnly>}
                          <IconButton
                            title="Model Settings"
                            className={classNames(
                              'transition-all flex items-center gap-1',
                              {
                                'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent':
                                  isModelSettingsCollapsed,
                                'bg-bolt-elements-item-backgroundDefault text-bolt-elements-item-contentDefault':
                                  !isModelSettingsCollapsed,
                              })}
                            onClick={() => setIsModelSettingsCollapsed(!isModelSettingsCollapsed)}
                            disabled={!providerList || providerList.length === 0}
                          >
                            <div className={`i-ph:caret-${isModelSettingsCollapsed ? 'right' : 'down'} text-lg`} />
                            {isModelSettingsCollapsed ? <span className="text-xs">{model}</span> : <span />}
                          </IconButton>
                        </div>
                        <div className="flex gap-2 items-center">
                        <Tooltip.Root>
                            <Tooltip.Trigger asChild>
                              <button
                                type="button"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '4px 8px',
                                  borderRadius: '6px',
                                  border: '1px solid',
                                  fontSize: '0.8rem',
                                  fontWeight: 500,
                                  lineHeight: 1.2,
                                  cursor: chatStarted ? 'not-allowed' : 'pointer',
                                  opacity: chatStarted ? 0.5 : 1,
                                  transition: 'background-color 0.2s ease-in-out, border-color 0.2s ease-in-out, color 0.2s ease-in-out',
                                  backgroundColor: isResearchModeToggleOn
                                    ? 'var(--bolt-elements-item-backgroundAccentMuted, #eef2ff)'
                                    : 'var(--bolt-elements-background-depth-3, #f9fafb)',
                                  color: isResearchModeToggleOn
                                    ? 'var(--bolt-elements-item-contentAccent, #4f46e5)'
                                    : 'var(--bolt-elements-textSecondary, #6b7280)',
                                  borderColor: isResearchModeToggleOn
                                    ? 'var(--bolt-elements-item-borderAccent, #c7d2fe)'
                                    : 'var(--bolt-elements-borderColor, #e5e7eb)',
                                }}
                                onClick={() => !chatStarted && setIsResearchModeToggleOn(!isResearchModeToggleOn)}
                                disabled={chatStarted}
                              >
                                <span style={{}}>
                                  Research:
                                </span>
                                <span style={{ fontWeight: 600 }}>
                                  {isResearchModeToggleOn ? 'ON' : 'OFF'}
                                </span>
                              </button>
                            </Tooltip.Trigger>
                            <Tooltip.Portal>
                              <Tooltip.Content
                                className="bg-gray-800 text-white text-xs px-2 py-1 rounded shadow-lg z-50"
                                sideOffset={5}
                              >
                                Generate Research first!
                                <Tooltip.Arrow className="fill-gray-800" />
                              </Tooltip.Content>
                            </Tooltip.Portal>
                          </Tooltip.Root>
                          <Tooltip.Root>
                            <Tooltip.Trigger asChild>
                              <button
                                title={`PRD Mode: ${isPrdModeToggleOn ? 'ON' : 'OFF'}`}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '4px 8px',
                                  borderRadius: '6px',
                                  border: '1px solid',
                                  fontSize: '0.8rem',
                                  fontWeight: 500,
                                  lineHeight: 1.2,
                                  cursor: chatStarted ? 'not-allowed' : 'pointer',
                                  opacity: chatStarted ? 0.5 : 1,
                                  transition: 'background-color 0.2s ease-in-out, border-color 0.2s ease-in-out, color 0.2s ease-in-out',
                                  backgroundColor: isPrdModeToggleOn
                                    ? 'var(--bolt-elements-item-backgroundAccentMuted, #eef2ff)'
                                    : 'var(--bolt-elements-background-depth-3, #f9fafb)',
                                  color: isPrdModeToggleOn
                                    ? 'var(--bolt-elements-item-contentAccent, #4f46e5)'
                                    : 'var(--bolt-elements-textSecondary, #6b7280)',
                                  borderColor: isPrdModeToggleOn
                                    ? 'var(--bolt-elements-item-borderAccent, #c7d2fe)'
                                    : 'var(--bolt-elements-borderColor, #e5e7eb)',
                                }}
                                onClick={() => !chatStarted && setIsPrdModeToggleOn(!isPrdModeToggleOn)} //working great!
                                disabled={chatStarted}
                              >
                                <span style={{}}>
                                  PRD:
                                </span>
                                <span style={{ fontWeight: 600 }}>
                                  {isPrdModeToggleOn ? 'ON' : 'OFF'}
                                </span>
                              </button>
                            </Tooltip.Trigger>
                            <Tooltip.Portal>
                              <Tooltip.Content
                                className="bg-gray-800 text-white text-xs px-2 py-1 rounded shadow-lg z-50"
                                sideOffset={5}
                              >
                                Generate PRD first!
                                <Tooltip.Arrow className="fill-gray-800" />
                              </Tooltip.Content>
                            </Tooltip.Portal>
                          </Tooltip.Root>
                          <Tooltip.Root>
                            <Tooltip.Trigger asChild>
                              <button
                                title={`Ticket Mode: ${isTicketModeToggleOn ? 'ON' : 'OFF'}`}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '4px 8px',
                                  borderRadius: '6px',
                                  border: '1px solid',
                                  fontSize: '0.8rem',
                                  fontWeight: 500,
                                  lineHeight: 1.2,
                                  cursor: chatStarted ? 'not-allowed' : 'pointer',
                                  opacity: chatStarted ? 0.5 : 1,
                                  transition: 'background-color 0.2s ease-in-out, border-color 0.2s ease-in-out, color 0.2s ease-in-out',
                                  backgroundColor: isTicketModeToggleOn
                                    ? 'var(--bolt-elements-item-backgroundAccentMuted, #eef2ff)'
                                    : 'var(--bolt-elements-background-depth-3, #f9fafb)',
                                  color: isTicketModeToggleOn
                                    ? 'var(--bolt-elements-item-contentAccent, #4f46e5)'
                                    : 'var(--bolt-elements-textSecondary, #6b7280)',
                                  borderColor: isTicketModeToggleOn
                                    ? 'var(--bolt-elements-item-borderAccent, #c7d2fe)'
                                    : 'var(--bolt-elements-borderColor, #e5e7eb)',
                                }}
                                onClick={() => !chatStarted && setIsTicketModeToggleOn(!isTicketModeToggleOn)}
                                disabled={chatStarted}
                              >
                                <span style={{}}>
                                  Ticket:
                                </span>
                                <span style={{ fontWeight: 600 }}>
                                  {isTicketModeToggleOn ? 'ON' : 'OFF'}
                                </span>
                              </button>
                            </Tooltip.Trigger>
                            <Tooltip.Portal>
                              <Tooltip.Content
                                className="bg-gray-800 text-white text-xs px-2 py-1 rounded shadow-lg z-50"
                                sideOffset={5}
                              >
                                Generate Tickets first!
                                <Tooltip.Arrow className="fill-gray-800" />
                              </Tooltip.Content>
                            </Tooltip.Portal>
                          </Tooltip.Root>
                          {input.length > 3 ? (
                            <div className="text-xs text-bolt-elements-textTertiary">
                              Use <kbd className="kdb px-1.5 py-0.5 rounded bg-bolt-elements-background-depth-2">Shift</kbd>{' '}
                              + <kbd className="kdb px-1.5 py-0.5 rounded bg-bolt-elements-background-depth-2">Return</kbd>{' '}
                              a new line
                            </div>
                          ) : null}
                          <SupabaseConnection />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </StickToBottom>
            ) : chatMode === 'prd' ? (
              <div className="flex-1 flex flex-col h-full overflow-hidden">
                <ClientOnly>{() => <PRDChat />}</ClientOnly>
              </div>
            ) : chatMode === 'ticket' ? (
              <div className="flex-1 flex flex-col h-full overflow-hidden">
                <ClientOnly>{() => <TicketChat />}</ClientOnly>
              </div>
            ) : chatMode === 'research' ? (
              <div className="flex-1 flex flex-col h-full overflow-hidden">
                <ClientOnly>{() => <ResearchChat />}</ClientOnly>
              </div>
            ) : null}
          </div>
          <ClientOnly>
            {() =>
              chatMode === 'chat' ? (
                <Workbench
                  actionRunner={actionRunner ?? ({} as ActionRunner)}
                  chatStarted={chatStarted}
                  isStreaming={isStreaming}
                />
              ) : chatMode === 'prd' ? (
                <PRDWorkbench />
              ) : chatMode === 'ticket' ? (
                <TicketWorkbench />
              ) : chatMode === 'research' ? (
                <ResearchWorkbench />
              ) : null
            }
          </ClientOnly>
        </div>
      </div>
    );

    return <Tooltip.Provider delayDuration={200}>{baseChat}</Tooltip.Provider>;
  },
);
