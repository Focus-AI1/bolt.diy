import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useChat } from 'ai/react';
import { toast } from 'react-toastify';
import { useStore } from '@nanostores/react';
import { classNames } from '~/utils/classNames';
import { Messages } from './Messages.client';
import { SendButton } from './SendButton.client';
import { IconButton } from '~/components/ui/IconButton';
import { useChatHistory, chatType } from '~/lib/persistence/useChatHistory';
import { streamingState } from '~/lib/stores/streaming';
import { createScopedLogger } from '~/utils/logger';
import { createSampler } from '~/utils/sampler';
import FilePreview from './FilePreview';
import type { Message } from 'ai';
import { motion } from 'framer-motion';
import { initialTicketMessageStore } from './BaseChat';
import { workbenchStore } from '~/lib/stores/workbench';

const logger = createScopedLogger('TicketChat');
const TEXTAREA_MIN_HEIGHT = 76;
const TEXTAREA_MAX_HEIGHT = 200;

// Define content types for message content
interface TextContent {
  type: 'text';
  text: string;
}

interface ImageContent {
  type: 'image';
  image: string;
}

type MessageContent = TextContent | ImageContent;

// Define Ticket document structure
interface Ticket {
  id: string;
  title: string;
  description: string;
  type: string;
  priority: string;
  status: string;
  assignee?: string;
  tags?: string[];
  estimatedTime?: string;
  createdAt: string;
  updatedAt: string;
  _manuallyEdited?: boolean;
}

// Function to extract tickets from messages
const extractTicketsFromMessages = (messages: Message[]): Ticket[] | null => {
  const assistantMessages = messages.filter(msg => msg.role === 'assistant');
  if (assistantMessages.length === 0) return null;

  // Find the latest assistant message that contains the start tag
  const latestTicketMessage = assistantMessages
    .slice()
    .reverse()
    .find(msg => typeof msg.content === 'string' && msg.content.includes('<tickets>'));

  if (!latestTicketMessage || typeof latestTicketMessage.content !== 'string') {
    return null;
  }

  const content = latestTicketMessage.content;
  const startIndex = content.indexOf('<tickets>');
  
  if (startIndex === -1) {
    return null;
  }
  
  const endIndex = content.indexOf('</tickets>', startIndex);
  let ticketsContent = '';
  
  if (endIndex !== -1) {
    // Complete tickets section found
    ticketsContent = content.substring(startIndex + '<tickets>'.length, endIndex).trim();
  } else {
    // Potentially partial content (streaming)
    ticketsContent = content.substring(startIndex + '<tickets>'.length).trim();
  }

  if (!ticketsContent) {
    return null;
  }

  // Parse XML-like structure to extract tickets
  const newTickets: Ticket[] = [];
  const ticketRegex = /<ticket>([\s\S]*?)<\/ticket>/g;
  let ticketMatch;

  while ((ticketMatch = ticketRegex.exec(ticketsContent)) !== null) {
    const ticketContent = ticketMatch[1];
    
    // Extract individual fields
    const extractField = (field: string, isMultiline = false): string => {
      const startTag = `<${field}>`;
      const endTag = `</${field}>`;
      const startIdx = ticketContent.indexOf(startTag);
      if (startIdx === -1) return '';
      
      const endIdx = ticketContent.indexOf(endTag, startIdx);
      if (endIdx === -1) return '';
      
      const value = ticketContent.substring(startIdx + startTag.length, endIdx).trim();
      return value;
    };

    // Extract tags as array
    const extractTags = (): string[] => {
      const tagsStr = extractField('tags');
      if (!tagsStr) return [];
      return tagsStr.split(',').map(tag => tag.trim()).filter(Boolean);
    };

    const ticket: Ticket = {
      id: extractField('id') || crypto.randomUUID().substring(0, 8),
      title: extractField('title'),
      description: extractField('description'),
      type: extractField('type'),
      priority: extractField('priority'),
      status: extractField('status'),
      assignee: extractField('assignee'),
      tags: extractTags(),
      createdAt: extractField('createdAt') || new Date().toISOString(),
      updatedAt: extractField('updatedAt') || new Date().toISOString(),
      _manuallyEdited: false
    };

    newTickets.push(ticket);
  }

  if (newTickets.length === 0) {
    return null;
  }

  // Get existing tickets from session storage to preserve manually edited ones
  try {
    const existingTicketsJson = sessionStorage.getItem('tickets');
    if (existingTicketsJson) {
      const existingTickets: Ticket[] = JSON.parse(existingTicketsJson);
      
      // Create a map of existing tickets by ID for quick lookup
      const existingTicketsMap = new Map<string, Ticket>();
      existingTickets.forEach(ticket => {
        existingTicketsMap.set(ticket.id, ticket);
      });
      
      // Get the last updated timestamp from workbench store
      const ticketsLastUpdated = workbenchStore.getTicketsLastUpdated();
      
      // Merge new tickets with existing ones that have been manually edited
      const mergedTickets: Ticket[] = [];
      
      // Process new tickets
      for (const newTicket of newTickets) {
        const existingTicket = existingTicketsMap.get(newTicket.id);
        
        // If ticket exists and was manually edited 
        // (has _manuallyEdited flag or has a more recent update timestamp)
        if (existingTicket && (
            existingTicket._manuallyEdited || 
            (ticketsLastUpdated && new Date(existingTicket.updatedAt) > new Date(ticketsLastUpdated))
        )) {
          // Keep the existing ticket (preserve manual edits)
          mergedTickets.push(existingTicket);
          // If the existing ticket had a different type/priority/status, log it
          if (existingTicket.type !== newTicket.type || 
              existingTicket.priority !== newTicket.priority || 
              existingTicket.status !== newTicket.status) {
            logger.debug(`Preserving edited ticket #${existingTicket.id}: "${existingTicket.title}"`);
          }
          existingTicketsMap.delete(newTicket.id); // Remove from map to track processed tickets
        } else {
          // Use the new ticket but preserve any existing _manuallyEdited flag
          mergedTickets.push({
            ...newTicket,
            _manuallyEdited: existingTicket?._manuallyEdited || false
          });
          existingTicketsMap.delete(newTicket.id); // Remove from map to track processed tickets
        }
      }
      
      // Add any remaining existing tickets that weren't in the new set
      // This preserves manually created/edited tickets not present in the regenerated set
      existingTicketsMap.forEach(ticket => {
        mergedTickets.push(ticket);
      });
      
      return mergedTickets;
    }
  } catch (error) {
    logger.error('Error merging tickets:', error);
    // Fall back to just the new tickets if there's an error
  }
  
  return newTickets;
};

// Ticket Chat component
const TicketChat: React.FC<{ backgroundMode?: boolean }> = ({ backgroundMode = false }) => {
  // State for chat functionality
  const [chatInput, setChatInput] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [imageDataList, setImageDataList] = useState<string[]>([]);
  const [showTicketTips, setShowTicketTips] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initialMessage = useStore(initialTicketMessageStore);
  const initialMessageProcessedRef = useRef(false);
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [chatStarted, setChatStarted] = useState(false);
  const showWorkbench = useStore(workbenchStore.showWorkbench);
  const isStreaming = useStore(streamingState);
  const { ready, initialMessages, storeMessageHistory, exportChat } = useChatHistory();

  // Get chat history functions
  // Removed: const { storeMessageHistory, setChatType } = useChatHistory();

  // Set chat type to 'ticket' when component mounts
  // Removed: useEffect(() => { setChatType('ticket'); }, [setChatType]);
  useEffect(() => {
    chatType.set('ticket'); // Set using nanostore
    logger.debug('Chat type set to Ticket');
  }, []);

  const storeTicketMessages = useCallback((messages: Message[]) => {
    chatType.set('ticket'); // Ensure type is set
    return storeMessageHistory(messages);
  }, [storeMessageHistory]);

  // Add this useEffect to sync with initialTicketMessageStore
  useEffect(() => {
    if (initialMessage.text) {
      setChatInput(initialMessage.text);
    }
    if (initialMessage.files.length > 0) {
      setUploadedFiles(initialMessage.files);
    }
    if (initialMessage.imageDataList.length > 0) {
      setImageDataList(initialMessage.imageDataList);
    }
    if (initialMessage.autoSubmit) {
      // Handle auto-submit if needed
      initialTicketMessageStore.set({
        ...initialMessage,
        autoSubmit: false
      });
    }
  }, [initialMessage]);

  const {
    messages,
    append,
    reload,
    stop,
    isLoading,
    input,
    setInput,
    setMessages,
    handleInputChange,
    handleSubmit,
  } = useChat({
    api: '/api/ticket-chat',
    id: 'ticket-chat',
    initialMessages: initialMessages,
    onFinish: (message) => {
      logger.debug('Chat finished', message);
      const finishTimestamp = new Date().toISOString(); // Get timestamp when generation finishes

      // Store messages in history using the dedicated function
      storeTicketMessages([...messages, message]); // Include the final message

      // Extract tickets from completed message set
      const finalTickets = extractTicketsFromMessages([...messages, message]);
      if (finalTickets) {
        // Save the final tickets to session storage
        sessionStorage.setItem('tickets', JSON.stringify(finalTickets));
        logger.debug('Tickets extracted and saved onFinish (final)');
        
        // Trigger storage event to update any listening components
        window.dispatchEvent(new StorageEvent('storage', { 
          key: 'tickets', 
          newValue: JSON.stringify(finalTickets), 
          storageArea: sessionStorage 
        }));
      }
      
      // Update the last generated timestamp *after* processing and storing
      workbenchStore.updateTicketsLastGenerated(finishTimestamp);
      streamingState.set(false); // Update streaming state store
    },
    onError: (error) => {
      logger.error('Chat error', error);
      toast.error('An error occurred during the chat.');
      streamingState.set(false); // Reset streaming state on error
      // Also potentially reset the last generated timestamp or handle differently? For now, just reset streaming.
    },
    onResponse: (response) => {
      logger.debug('Chat response started', response);
      if (response.ok) {
         streamingState.set(true); // Update streaming state store
      }
    },
  });

  // This is the primary callback for progressive extraction
  const extractTicketContent = useCallback((currentMessages: Message[]) => {
    const currentTickets = extractTicketsFromMessages(currentMessages);
    if (currentTickets) {
      // Store the newly extracted tickets
      sessionStorage.setItem('tickets', JSON.stringify(currentTickets));
      
      // Trigger storage event for workbench updates
      window.dispatchEvent(new StorageEvent('storage', { 
        key: 'tickets', 
        storageArea: sessionStorage 
      }));
      
      // Show workbench if tickets are found and not in background mode
      if (!workbenchStore.showWorkbench.get() && !backgroundMode) {
        workbenchStore.showWorkbench.set(true);
        logger.debug('Showing workbench as Ticket content is streaming.');
      }
    }
  }, [backgroundMode]);

  // Process messages with throttling (reuse PRDChat sampler)
  const processSampledMessages = createSampler(
     (options: {
       messages: Message[];
       initialMessages: Message[];
       isLoading: boolean;
       parseMessages: (messages: Message[], isLoading: boolean) => void;
       storeMessageHistory: (messages: Message[]) => Promise<void>;
       extractContent?: (messages: Message[]) => void; // Generic name
     }) => {
       const { messages, initialMessages, isLoading, parseMessages, storeMessageHistory, extractContent } = options;

       if (messages.length > initialMessages.length || isLoading) {
         parseMessages(messages, isLoading); // Handles setting chatStarted and streamingState
         storeMessageHistory(messages).catch((error) => toast.error(error.message)); // Store history
       }

       if (extractContent) {
         extractContent(messages);
       }
     },
     50 // Sampling interval in ms
   );

   // Load chat history
   useEffect(() => {
    if (ready && initialMessages.length > 0) {
      if (messages.length === 0) { // Only set if useChat hasn't populated messages yet
        logger.debug('Ticket chat history ready with', initialMessages.length, 'messages.');
        setChatStarted(true); // Mark chat started if history exists
      }
      // Extract from history immediately
      extractTicketContent(initialMessages);
    } else if (ready) {
      logger.debug('Ticket chat history ready but empty.');
      if (messages.length > 0 && !chatStarted) {
          setChatStarted(true);
      }
    }
  }, [ready, initialMessages, extractTicketContent, messages.length, chatStarted]); // Added dependencies


  // Effect for sampling messages, storing history, and triggering progressive extraction
  useEffect(() => {
    processSampledMessages({
      messages,
      initialMessages, // Use initialMessages from history
      isLoading, // Use isLoading from useChat hook
      parseMessages: (msgs, loading) => {
        // Set chatStarted flag
        if (msgs.length > initialMessages.length && !chatStarted) {
          setChatStarted(true);
        }
      },
      storeMessageHistory: storeTicketMessages, // Use the specific Ticket storage function
      extractContent: extractTicketContent, // Pass the extraction function
    });
  }, [messages, isLoading, initialMessages, storeTicketMessages, extractTicketContent, chatStarted]); // Added dependencies

  // Check for initial message data and auto-submit if needed
  useEffect(() => {
    if (!initialMessageProcessedRef.current &&
        initialMessage.autoSubmit &&
        (initialMessage.text || initialMessage.imageDataList.length > 0)) {

      initialMessageProcessedRef.current = true;

      setChatInput(initialMessage.text); // Use hook's setter

      setUploadedFiles(initialMessage.files);
      setImageDataList(initialMessage.imageDataList);

      setTimeout(() => {
        const messageContent: Array<MessageContent> = [
          { type: 'text', text: initialMessage.text }
        ];

        if (initialMessage.imageDataList.length > 0) {
          initialMessage.imageDataList.forEach(imageData => {
            messageContent.push({ type: 'image', image: imageData });
          });
        }

        // Use append for multimodal content
        append({
          role: 'user',
          content: messageContent as any, // Cast for Vercel AI SDK
          data: { // Pass files via data if needed by API
             files: initialMessage.files.map(f => ({ name: f.name, type: f.type, size: f.size })) // Example: send metadata
          }
        });

        // Show workbench when sending first message if not already shown
        if (!backgroundMode && !workbenchStore.showWorkbench.get()) {
            workbenchStore.showWorkbench.set(true);
        }

        initialTicketMessageStore.set({
          text: '',
          files: [],
          imageDataList: [],
          autoSubmit: false
        });

        setChatStarted(true);
        // Clear local input state if it exists, and hook state
        // setInput(''); // Clear local state if it was different from hook state
        setChatInput(''); // Use hook's setter

      }, 100);
    }
  }, [initialMessage, ready, append, backgroundMode, setChatInput]); // Added setChatInput

  // Auto-resize textarea as content changes
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(
        Math.max(scrollHeight, TEXTAREA_MIN_HEIGHT),
        TEXTAREA_MAX_HEIGHT
      )}px`;
    }
  }, [input]); // Depend on input from useChat

  // Add state for tickets update notification
  const [showUpdateNotification, setShowUpdateNotification] = useState(false);

  // Get the needsUpdate status from the store
  const needsUpdate = useStore(workbenchStore.ticketsNeedUpdate);

  // Check if tickets need update based on PRD changes AND if chat is idle
  useEffect(() => {
    // Show notification only if an update is needed AND the chat is not currently loading/streaming
    setShowUpdateNotification(needsUpdate && !isLoading);

    // Optional: Add periodic check if needed, though store updates should trigger this effect.
    // The interval logic previously here might be redundant if the store updates reliably trigger the effect.
    // Let's rely on the store listener and isLoading state changes.

  }, [needsUpdate, isLoading]); // Depend on store value and isLoading

  // Function to handle tickets regeneration based on updated PRD
  const handleRegenerateTickets = () => {
    // Acknowledge the update immediately to hide the button
    workbenchStore.acknowledgeTicketsUpdate();
    setShowUpdateNotification(false); // Hide manually as well

    // Get the latest PRD data from sessionStorage
    const latestPRD = sessionStorage.getItem('current_prd');
    let prdContext = '';

    if (latestPRD) {
      try {
        const prdData = JSON.parse(latestPRD);
        
        // Define an interface for PRD sections
        interface PRDSection {
          title: string;
          content: string;
        }
        
        prdContext = `Based on the following updated PRD:
Title: ${prdData.title}
Description: ${prdData.description}
${prdData.sections.map((section: PRDSection) => `${section.title}: ${section.content.substring(0, 100)}...`).join('\n')}`;
      } catch (error) {
        logger.error('Error parsing PRD data:', error);
      }
    }

    // Get existing tickets to provide context for what should be preserved
    let existingTicketsContext = '';
    try {
      const existingTicketsJson = sessionStorage.getItem('tickets');
      if (existingTicketsJson) {
        const existingTickets = JSON.parse(existingTicketsJson);
        if (Array.isArray(existingTickets) && existingTickets.length > 0) {
          // Create a compact representation of existing tickets for the prompt
          existingTicketsContext = `\n\nExisting tickets to preserve and update:\n${
            existingTickets.map(ticket => 
              `ID: ${ticket.id} | Title: ${ticket.title} | Type: ${ticket.type} | Priority: ${ticket.priority} | Status: ${ticket.status}${
                ticket._manuallyEdited ? ' [MANUALLY EDITED]' : ''
              }`
            ).join('\n')
          }`;
          
          logger.debug(`Including ${existingTickets.length} existing tickets in regeneration context`);
        }
      }
    } catch (error) {
      logger.error('Error parsing existing tickets:', error);
    }

    // Get the last user message or create a new one asking to update based on PRD
    const lastUserMessage = messages.filter(m => m.role === 'user').pop();
    // Construct the prompt more clearly indicating it's an update request
    const updatePrompt = `The PRD has been updated. Please regenerate the tickets considering these changes.\n\n${prdContext}\n\n${existingTicketsContext}\n\n(Context from original request if available: ${lastUserMessage?.content ?? 'Generate initial tickets based on the PRD.'})`;

    // Submit the regeneration request using append
    append({
      role: 'user',
      content: updatePrompt
    });

    // Ensure chat starts if it hasn't
    if (!chatStarted) {
      setChatStarted(true);
    }
    // Show workbench if hidden
    if (!backgroundMode && !workbenchStore.showWorkbench.get()) {
      workbenchStore.showWorkbench.set(true);
    }
  };

  // Listen for storage events to detect changes in PRD from the workbench
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'current_prd' && event.newValue !== null) {
        // PRD has been updated in the workbench, call the store method
        // The store method now handles the logic of comparing timestamps
        workbenchStore.updatePRD();
      }
       // Add listener for ticket updates potentially triggered by workbench edits
       if (event.key === 'tickets' && event.newValue !== null) {
         workbenchStore.updateTickets();
       }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []); // No dependencies needed as workbenchStore methods are stable

  // Handle file upload button click
  const handleFileUpload = () => {
    fileInputRef.current?.click();
  };

  // Handle textarea input change and auto-resize
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    handleInputChange(e); // Use hook's handler
    // Auto-resize is handled by useEffect depending on 'input'
  };

  // Handle file selection
  const handleFileSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      setUploadedFiles((prev) => [...prev, ...newFiles]);
      // Update store if needed (removed for brevity, assume initialMessageStore is handled elsewhere or not needed after initial load)
      // initialTicketMessageStore.set(...)

      newFiles.forEach((file) => {
        if (file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = (event) => {
             if (event.target?.result) {
                setImageDataList((prev) => [...prev, event.target!.result as string]);
                // Update store if needed
                // initialTicketMessageStore.set(...)
             }
          };
          reader.readAsDataURL(file);
        }
      });
    }
  };

  // Handle paste event for images
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          setUploadedFiles((prev) => [...prev, file]);
          // Update store if needed
          const reader = new FileReader();
          reader.onload = (event) => {
             if (event.target?.result) {
                setImageDataList((prev) => [...prev, event.target!.result as string]);
                // Update store if needed
             }
          };
          reader.readAsDataURL(file);
        }
      }
    }
  };

  // Function to select a template and set its prompt as input
  const selectTemplate = (prompt: string) => {
    setChatInput(prompt); // Use hook's setter
    setShowTicketTips(false);
    // Update store if needed
    // initialTicketMessageStore.set(...)
    textareaRef.current?.focus();
  };

  // Handle send message
  const handleSendMessage = (event: React.FormEvent<HTMLFormElement> | React.MouseEvent | React.KeyboardEvent) => {
    event.preventDefault();

    // Ensure we're in Ticket mode
    chatType.set('ticket');

    if (isLoading) return;

    const currentInput = input.trim(); // Use input from useChat

    if (!currentInput && uploadedFiles.length === 0) {
      toast.info('Please enter a message or upload a file.');
      return;
    }

    // Show workbench when sending first message if not already shown
    if (!chatStarted && !workbenchStore.showWorkbench.get() && !backgroundMode) {
        workbenchStore.showWorkbench.set(true);
    }

    // Clear the ticket message store if it's still relevant
    initialTicketMessageStore.set({
      text: '',
      files: [],
      imageDataList: [],
      autoSubmit: false
    });

    // Prepare message content
    const messageContent: MessageContent[] = [];
    if (currentInput) {
      messageContent.push({ type: 'text', text: currentInput });
    }
    imageDataList.forEach((imageData) => {
      messageContent.push({ type: 'image', image: imageData });
    });

    // Use append for multimodal content
    append({
      role: 'user',
      content: messageContent as any, // Cast for Vercel AI SDK
      data: { // Pass files via data if API expects it
         files: uploadedFiles.map(f => ({ name: f.name, type: f.type, size: f.size }))
      }
    });

    setUploadedFiles([]);
    setImageDataList([]);
    setChatInput(''); // Use hook's setter

    if (textareaRef.current) {
      textareaRef.current.style.height = `${TEXTAREA_MIN_HEIGHT}px`;
    }

    setChatStarted(true);
  };

  // Handle export chat
  const handleExportChat = () => {
     exportChat('ticket'); // Use history hook's export function
  };

  // Templates for ticket generation
  const ticketTemplates = [
    {
      title: 'Feature Tickets',
      prompt: 'Create tickets for a new user authentication system with social login options.',
    },
    {
      title: 'Bug Tickets',
      prompt: 'Generate tickets for fixing performance issues in our React application.',
    },
    {
      title: 'Project Breakdown',
      prompt: 'Break down a mobile app development project into actionable tickets.',
    },
  ];

  // Filter messages for display, removing the ticket block (similar to PRD)
  const messagesForDisplay = messages.map(msg => {
      if (msg.role === 'assistant' && typeof msg.content === 'string' && msg.content.includes('<tickets>')) {
          // Replace the tickets block with a placeholder
          const cleanedContent = msg.content.replace(/<tickets>[\s\S]*?<\/tickets>/, '\n\n*[Ticket content updated in Workbench]*\n').trim();
          // Only show the placeholder if the cleaned content is otherwise empty
          if (cleanedContent === '*[Ticket content updated in Workbench]*') {
             return { ...msg, content: cleanedContent };
          } else if (cleanedContent) {
              return { ...msg, content: cleanedContent.replace('*[Ticket content updated in Workbench]*','').trim() + '\n\n*[Ticket content updated in Workbench]*' };
          } else {
              return { ...msg, content: '*[Ticket content updated in Workbench]*' };
          }
      }
      return msg;
  }).filter(msg => msg.content); // Filter out potentially empty messages

  return (
    // Main container styling aligned with PRDChat
    <div className={classNames(
      "flex flex-col h-full transition-all duration-200 ease-in-out bg-bolt-elements-background-depth-1", // Added bg color here
      {
        "mr-[var(--workbench-width)]": showWorkbench, // Add margin when workbench is open
        "hidden": backgroundMode
      }
    )}>
      {/* Tickets Update Notification - Renders based on showUpdateNotification state */}
      {showUpdateNotification && (
        <div className="bg-bolt-elements-background-accent/10 border border-bolt-elements-background-accent/30 rounded-md p-3 m-3 flex justify-between items-center">
          <span className="text-bolt-elements-textPrimary">
            <span className="i-ph:info mr-2"></span>
            The PRD has been updated. Would you like to regenerate the tickets?
          </span>
          <button
            onClick={handleRegenerateTickets}
            className="px-3 py-1 bg-bolt-elements-background-accent hover:bg-bolt-elements-background-accentHover text-bolt-elements-textOnAccent rounded-md text-sm transition-colors"
            // disabled={isLoading} // Disable button if somehow clicked while loading starts again? Good practice.
          >
            Regenerate Tickets
          </button>
        </div>
      )}
      
      {/* Chat header - Aligned with PRDChat */}
      <div className="border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-3 flex justify-between items-center flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="i-ph:ticket text-xl text-bolt-elements-textSecondary"></div>
          <h2 className="text-lg font-medium text-bolt-elements-textPrimary">Ticket Generator</h2>
        </div>
        <div className="flex items-center gap-1">
           {/* Workbench Toggle Button - Added */}
          <IconButton
            title="Toggle Workbench"
            onClick={() => workbenchStore.showWorkbench.set(!workbenchStore.showWorkbench.get())}
            className={classNames(
              "text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary",
              { "bg-bolt-elements-background-depth-3": workbenchStore.showWorkbench.get() }
            )}
          >
            <div className="i-ph:layout-right"></div>
          </IconButton>
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Messages container - Aligned with PRDChat */}
        <div
          className="flex-1 overflow-y-auto px-4 py-2 scroll-smooth"
          ref={scrollRef} // Keep scrollRef if used for scrolling logic
        >
          <div className="max-w-3xl mx-auto"> {/* Added max-width wrapper */}
            {!chatStarted && messagesForDisplay.length === 0 ? (
              // Initial state - Use PRDChat's structure/styling
              <div className="h-full flex flex-col items-center justify-center text-center p-6">
                <div className="i-ph:ticket text-6xl text-bolt-elements-textTertiary mb-6"></div>
                <h3 className="text-2xl font-semibold text-bolt-elements-textPrimary mb-3">Ticket Generator</h3>
                <p className="text-bolt-elements-textSecondary max-w-md mb-8">
                  Describe your project, feature, or bug to generate well-structured tickets for your team. Upload documents or images for context.
                </p>

                {/* Templates - Use PRDChat's grid layout */}
                <div className="grid grid-cols-2 gap-4 w-full max-w-md mb-8">
                  {ticketTemplates.map((template, index) => (
                    <button
                      key={index}
                      className="flex flex-col p-4 border border-bolt-elements-borderColor rounded-lg hover:bg-bolt-elements-background-depth-1 transition-colors text-left"
                      onClick={() => selectTemplate(template.prompt)}
                    >
                      <span className="font-medium text-bolt-elements-textPrimary mb-1">{template.title}</span>
                      {/* Removed description display to match PRD minimal template view */}
                    </button>
                  ))}
                </div>

                <div className="text-sm text-bolt-elements-textTertiary">
                  Select a template or describe what you need.
                </div>
              </div>
            ) : showTicketTips ? (
              // Tips/Templates displayed inline (similar logic, adjust styling if needed)
              <div className="h-full flex flex-col items-center justify-center">
                {/* ... existing tips rendering ... (adjust styling classes if needed) */}
                {/* Consider using the modal approach from PRDChat if preferred */}
                 <div className="max-w-2xl w-full bg-bolt-elements-background-depth-2 rounded-xl p-6 shadow-sm">
                   <h3 className="text-lg font-semibold text-bolt-elements-textPrimary mb-4">
                     Ticket Templates
                   </h3>
                   <div className="grid grid-cols-1 gap-3"> {/* Keep grid */}
                     {ticketTemplates.map((template, index) => (
                       <button
                         key={index}
                         className="text-left p-4 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 hover:bg-bolt-elements-background-depth-3 transition-colors"
                         onClick={() => selectTemplate(template.prompt)}
                       >
                         <h4 className="font-medium text-bolt-elements-textPrimary">{template.title}</h4>
                         <p className="text-sm text-bolt-elements-textSecondary mt-1">{template.prompt}</p>
                       </button>
                     ))}
                   </div>
                   <div className="mt-4 text-sm text-bolt-elements-textSecondary">
                      {/* ... tips content ... */}
                   </div>
                   <button
                      onClick={() => setShowTicketTips(false)}
                      className="mt-4 px-3 py-1 text-xs border border-bolt-elements-borderColor rounded hover:bg-bolt-elements-background-depth-3"
                   >Close Tips</button>
                 </div>
              </div>
            ) : (
              // Messages - Use filtered messages
              <Messages
                messages={messagesForDisplay}
                isStreaming={isLoading} // Pass isLoading from useChat
                ref={messagesEndRef} // Keep ref if used
              />
            )}
          </div>
        </div>

        {/* Input area - Aligned with PRDChat */}
        <div className="border-t border-bolt-elements-borderColor bg-bolt-elements-background-depth-0 p-4 flex-shrink-0">
          <div className="max-w-3xl mx-auto"> {/* Added max-width wrapper */}
            {/* Use handleSubmit from useChat */}
            <form onSubmit={handleSendMessage} className="flex flex-col gap-3">
               {/* File previews - Moved inside form, styled like PRD */}
              {uploadedFiles.length > 0 && (
                <div className="bg-bolt-elements-background-depth-1 rounded-lg p-3">
                   <div className="flex justify-between items-center mb-2">
                     <span className="text-xs text-bolt-elements-textSecondary">
                       {uploadedFiles.length} file(s) attached
                     </span>
                     <button
                       type="button"
                       className="text-xs text-bolt-elements-textTertiary hover:text-bolt-elements-textSecondary"
                       onClick={() => {
                         setUploadedFiles([]);
                         setImageDataList([]);
                       }}
                     >
                       Clear all
                     </button>
                   </div>
                  <FilePreview
                    files={uploadedFiles}
                    imageDataList={imageDataList}
                    onRemove={(index) => {
                      setUploadedFiles(prev => prev.filter((_, i) => i !== index));
                      // Simple index removal for image data, assumes correlation
                      setImageDataList(prev => prev.filter((_, i) => i !== index));
                    }}
                  />
                </div>
              )}

              {/* Textarea container */}
              <div className="relative">
                <textarea
                  ref={textareaRef}
                  // Styling aligned with PRDChat textarea
                  className="w-full p-4 pr-16 bg-bolt-elements-background-depth-1 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-bolt-elements-borderColorFocus text-bolt-elements-textPrimary shadow-sm"
                  value={input} // Use input from useChat
                  onChange={handleTextareaChange} // Use hook's handler
                  onPaste={handlePaste}
                   onKeyDown={(event) => { // Added onKeyDown for Shift+Enter
                     if (event.key === 'Enter' && !event.shiftKey) {
                       event.preventDefault();
                       handleSendMessage(event);
                     }
                   }}
                  placeholder="Describe your project or feature to generate tickets..."
                  style={{
                    minHeight: TEXTAREA_MIN_HEIGHT,
                    maxHeight: TEXTAREA_MAX_HEIGHT,
                    // Height controlled by useEffect
                  }}
                  disabled={isLoading}
                />

                {/* Send/Stop button - Aligned with PRDChat */}
                <div className="absolute right-3 bottom-3 z-10">
                   {isLoading ? (
                     <IconButton
                        title="Stop generation"
                        onClick={() => stop()}
                        className="text-bolt-elements-textPrimary bg-bolt-elements-background-depth-3 hover:bg-bolt-elements-background-depth-4 p-2 rounded-md"
                     >
                        <div className="i-ph:square text-lg"></div>
                     </IconButton>
                  ) : (
                     <SendButton
                        show={true}
                        isStreaming={isLoading}
                        onClick={(e) => handleSendMessage(e)}
                        disabled={!input.trim() && uploadedFiles.length === 0} // Check input from useChat
                     />
                  )}
                </div>
              </div>

              {/* Action buttons row - Aligned with PRDChat */}
              <div className="flex justify-between items-center">
                <div className="flex gap-2 items-center">
                  <IconButton
                    title="Upload document or image"
                    className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-all"
                    onClick={handleFileUpload}
                    disabled={isLoading}
                  >
                    <div className="i-ph:paperclip text-lg"></div>
                  </IconButton>

                  <IconButton
                    title="Ticket Templates"
                    className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-all"
                    onClick={() => {
                      if (chatStarted) {
                        toast.info("Describe the tickets you need (e.g., 'Create tickets for a user authentication system').");
                      } else {
                        setShowTicketTips(true);
                      }
                    }}
                    disabled={isLoading}
                  >
                    <div className="i-ph:ticket text-lg"></div>
                  </IconButton>

                  {chatStarted && (
                    <IconButton
                      title="Export Chat"
                      className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-all"
                      onClick={handleExportChat}
                      disabled={isLoading}
                    >
                      <div className="i-ph:export text-lg"></div>
                    </IconButton>
                  )}
                </div>

                {/* Shift+Enter hint - Aligned with PRDChat */}
                {input.length > 0 && !isLoading ? (
                  <div className="text-xs text-bolt-elements-textTertiary">
                    <kbd className="px-1.5 py-0.5 rounded bg-bolt-elements-background-depth-2">Shift</kbd>{' '}
                    + <kbd className="px-1.5 py-0.5 rounded bg-bolt-elements-background-depth-2">Enter</kbd>{' '}
                    for a new line
                  </div>
                ) : null}
              </div>
            </form>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileSelection}
              accept="image/*,.pdf,.doc,.docx,.txt,.md"
              disabled={isLoading}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default TicketChat;