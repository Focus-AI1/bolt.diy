import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useChat } from 'ai/react';
import { toast } from 'react-toastify';
import { useStore } from '@nanostores/react';
import { classNames } from '~/utils/classNames';
import { Messages } from './Messages.client';
import { SendButton } from './SendButton.client';
import { IconButton } from '~/components/ui/IconButton';
import { useChatHistory, chatType } from '~/lib/persistence/useChatHistory';
import { researchStreamingState } from '~/lib/stores/streaming';
import { workbenchStore } from '~/lib/stores/workbench';
import { createScopedLogger } from '~/utils/logger';
import { createSampler } from '~/utils/sampler';
import FilePreview from './FilePreview';
import type { Message } from 'ai';
import { motion } from 'framer-motion';
import { initialResearchMessageStore } from './BaseChat';

const logger = createScopedLogger('ResearchChat');
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

// Define Research document structure
interface ResearchDocument {
  title: string;
  description: string;
  sections: ResearchSection[];
  lastUpdated: string;
}

interface ResearchSection {
  id: string;
  title: string;
  content: string; // Content is expected to be markdown
}

// Function to extract Research content from messages
const extractResearchFromMessages = (messages: Message[]): ResearchDocument | null => {
  try {
    const assistantMessages = messages.filter(msg => msg.role === 'assistant');
    if (assistantMessages.length === 0) return null;

    // Find the latest assistant message that contains the start tag
    const latestResearchMessage = assistantMessages
      .slice()
      .reverse()
      .find(msg => typeof msg.content === 'string' && msg.content.includes('<research_document>'));

    if (!latestResearchMessage || typeof latestResearchMessage.content !== 'string') {
      return null;
    }

    const content = latestResearchMessage.content;
    const startIndex = content.indexOf('<research_document>');
    let researchMarkdown = '';

    if (startIndex !== -1) {
      const endIndex = content.indexOf('</research_document>', startIndex);
      if (endIndex !== -1) {
        // Complete document found
        researchMarkdown = content.substring(startIndex + '<research_document>'.length, endIndex).trim();
        // Clear streaming content when complete
        workbenchStore.updateStreamingPRDContent(null);
      } else {
        // Potentially partial document (streaming)
        researchMarkdown = content.substring(startIndex + '<research_document>'.length).trim();
        // Update streaming content for real-time display
        workbenchStore.updateStreamingPRDContent(researchMarkdown);
      }
    } else {
      return null;
    }

    if (!researchMarkdown) {
      return null;
    }

    // Get any existing Research to preserve edits
    let existingResearch: ResearchDocument | null = null;
    try {
      const storedResearch = sessionStorage.getItem('current_research');
      if (storedResearch) {
        existingResearch = JSON.parse(storedResearch);
      }
    } catch (error) {
      logger.error('Error parsing existing Research from sessionStorage:', error);
    }

    // Parse markdown to Research document
    return parseMarkdownToResearch(researchMarkdown, existingResearch);
  } catch (error) {
    logger.error('Error extracting Research document:', error);
    return null;
  }
};

// Helper function to parse markdown into Research document structure
const parseMarkdownToResearch = (markdown: string, existingResearch: ResearchDocument | null = null): ResearchDocument | null => {
  try {
    // Initialize with existing Research or default structure
    const research: ResearchDocument = existingResearch || {
      title: 'Research Document',
      description: '',
      sections: [],
      lastUpdated: new Date().toISOString(),
    };

    // Split markdown by headings and process each section
    const lines = markdown.split('\n');
    let currentSection: ResearchSection | null = null;
    let inTitle = false;
    let inDescription = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Process document title (# level heading)
      if (line.match(/^# /)) {
        inTitle = true;
        inDescription = false;
        research.title = line.replace(/^# /, '').trim();
        currentSection = null;
        continue;
      }

      // Process section headings (## level headings)
      if (line.match(/^## /)) {
        inTitle = false;
        inDescription = false;
        
        // Save previous section if it exists
        if (currentSection) {
          // Add section if it doesn't exist or update existing
          const existingIndex = research.sections.findIndex(s => s.id === currentSection!.id);
          if (existingIndex >= 0) {
            research.sections[existingIndex] = currentSection;
          } else {
            research.sections.push(currentSection);
          }
        }

        // Create new section
        const title = line.replace(/^## /, '').trim();
        const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        currentSection = {
          id,
          title,
          content: '',
        };
        continue;
      }

      // Process description (content after title before first section)
      if (inTitle && !currentSection) {
        inTitle = false;
        inDescription = true;
        research.description = line.trim();
        continue;
      }

      // Add content to description or current section
      if (inDescription) {
        if (line.trim() !== '') {
          research.description += '\n' + line;
        }
      } else if (currentSection) {
        if (currentSection.content === '') {
          currentSection.content = line;
        } else {
          currentSection.content += '\n' + line;
        }
      }
    }

    // Save the last section if it exists
    if (currentSection) {
      const existingIndex = research.sections.findIndex(s => s.id === currentSection!.id);
      if (existingIndex >= 0) {
        research.sections[existingIndex] = currentSection;
      } else {
        research.sections.push(currentSection);
      }
    }

    // Sort sections if they have numerical prefixes
    research.sections = sortSectionsByNumericalPrefix(research.sections);
    research.lastUpdated = new Date().toISOString();

    return research;
  } catch (error) {
    logger.error('Error parsing markdown to Research:', error);
    return null;
  }
};

// Process messages with throttling
const processSampledMessages = createSampler(
  (options: {
    messages: Message[];
    initialMessages: Message[];
    isLoading: boolean;
    parseMessages: (messages: Message[], isLoading: boolean) => void;
    extractResearchContent?: (messages: Message[]) => void;
  }) => {
    const { messages, initialMessages, isLoading, parseMessages, extractResearchContent } = options;

    // Always parse messages for display
    parseMessages(messages, isLoading);

    // Attempt Research extraction on every sample if the function is provided
    if (extractResearchContent) {
      extractResearchContent(messages);
    }
  },
  50 // Sampling interval in ms
);

// Research Chat component
const ResearchChat = ({ backgroundMode = false }) => {
  const workbenchVisible = useStore(workbenchStore.showWorkbench);
  const initialMessageData = useStore(initialResearchMessageStore);
  const initialMessageProcessedRef = useRef(false);
  const { ready, initialMessages, storeMessageHistory } = useChatHistory();
  const { messages, input, handleInputChange, handleSubmit, isLoading: apiIsLoading, stop, append } = useChat({
    api: '/api/research-chat',
    id: 'research',
    initialMessages: initialMessages,
    onFinish: (message) => {
      setIsLoading(false);
      researchStreamingState.set(false);
      
      // Attempt to extract Research document if not already extracted
      const extractedResearch = extractResearchFromMessages([...chatMessages, message]);
      if (extractedResearch) {
        // Save the Research document to session storage
        try {
          sessionStorage.setItem('current_research', JSON.stringify(extractedResearch));
          logger.debug('Research document saved to session storage');
          
          // Set timestamps for the research document
          const timestamp = new Date().toISOString();
          sessionStorage.setItem('research_last_updated', timestamp);
          
          // Show workbench if not already visible
          if (!workbenchVisible) {
            workbenchStore.showWorkbench.set(true);
          }
        } catch (error) {
          logger.error('Error saving Research document to session storage', error);
          toast.error('Failed to save Research document. Please try again.');
        }
      }

      if (backgroundMode && window.parent !== window) {
        // In iframe mode, notify parent of completion
        window.parent.postMessage({ type: 'researchComplete', researchId: 'research' }, '*');
      }
    },
    onError: (error) => {
      setIsLoading(false);
      researchStreamingState.set(false);
      toast.error(`Error: ${error.message}`);
    },
    onResponse: (response) => {
      // onResponse is called when the server response starts
      if (response.status === 200) {
        // We start streaming - track this state
        researchStreamingState.set(true);
      }
    },
  });

  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [chatStarted, setChatStarted] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [imageDataList, setImageDataList] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showResearchTips, setShowResearchTips] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  // Store the last input to restore if needed
  const lastInputRef = useRef('');

  // Combined message with uploaded files for sending
  const makeMessageContent = useCallback(() => {
    const contentParts: MessageContent[] = [];

    // Add text content if present
    if (chatInput.trim()) {
      contentParts.push({ type: 'text', text: chatInput.trim() });
    }

    // Add image content if present
    imageDataList.forEach(imageData => {
      contentParts.push({ type: 'image', image: imageData });
    });

    // Join all content into a single message
    return contentParts
      .map(part => {
        switch (part.type) {
          case 'text':
            return part.text;
          case 'image':
            return `![Image](${part.image})`;
          default:
            return '';
        }
      })
      .join('\n\n');
  }, [chatInput, imageDataList]);

  // Set up Research document extraction
  useEffect(() => {
    // Load chat history
    if (ready && initialMessages.length > 0) {
      setChatMessages(initialMessages);
      setChatStarted(true);
      logger.debug('Research chat history loaded with', initialMessages.length, 'messages');
      
      // Extract research from history immediately
      const extractedResearch = extractResearchFromMessages(initialMessages);
      if (extractedResearch) {
        try {
          sessionStorage.setItem('current_research', JSON.stringify(extractedResearch));
          if (!workbenchVisible) {
            workbenchStore.showWorkbench.set(true);
          }
        } catch (error) {
          logger.error('Error saving Research document from history to session storage', error);
        }
      }
    }

    // Function to extract and process Research content
    const extractResearchContent = (messages: Message[]) => {
      const extractedResearch = extractResearchFromMessages(messages);
      if (extractedResearch) {
        try {
          sessionStorage.setItem('current_research', JSON.stringify(extractedResearch));
          if (!workbenchVisible) {
            workbenchStore.showWorkbench.set(true);
          }
        } catch (error) {
          logger.error('Error saving Research document to session storage', error);
        }
      }
    };

    const parseMessages = (msgs: Message[], loading: boolean) => {
      setChatMessages(msgs);
      setIsLoading(loading);
      storeMessageHistory(msgs);
    };

    // Process messages with throttling
    processSampledMessages({
      messages,
      initialMessages,
      isLoading,
      parseMessages,
      extractResearchContent,
    });
  }, [messages, isLoading, workbenchVisible, initialMessages, ready]);

  // Check for initial message data and auto-submit if needed
  useEffect(() => {
    // Only process if we haven't already and there's data to process
    if (!initialMessageProcessedRef.current &&
        initialMessageData.autoSubmit &&
        (initialMessageData.text || initialMessageData.imageDataList.length > 0)) {

      initialMessageProcessedRef.current = true;

      // Set the input text for display purposes
      setChatInput(initialMessageData.text);

      // Set files and image data
      setUploadedFiles(initialMessageData.files);
      setImageDataList(initialMessageData.imageDataList);

      // Use a short timeout to ensure state updates have been applied
      setTimeout(() => {
        // Use append directly instead of handleSubmit with a synthetic event
        append({
          role: 'user',
          content: initialMessageData.text
        });

        // Show workbench when sending first message, but only if not in background mode
        if (!backgroundMode && !workbenchVisible) {
          workbenchStore.showWorkbench.set(true);
        }

        // Reset the store to prevent resubmission on component remounts
        initialResearchMessageStore.set({
          text: '',
          files: [],
          imageDataList: [],
          autoSubmit: false,
        });

        // Set chat as started
        setChatStarted(true);
        // Clear local input state as well
        setChatInput('');
      }, 100); // Short timeout
    }
  }, [initialMessageData, append, backgroundMode, workbenchVisible]);

  // Set chat type to 'research' when component mounts
  useEffect(() => {
    chatType.set('research');
    logger.debug('ResearchChat mounted: Chat type set to research');
  }, []);

  // Ensure chat type is set to 'research' when this component is active
  useEffect(() => {
    if (messages.length > 0 || chatInput.trim().length > 0) {
      chatType.set('research');
    }
  }, [messages.length, chatInput]);

  // Function to handle Research regeneration based on updated context
  const handleRegenerateResearch = () => {
    try {
      // Check if we have a research document
      const storedResearch = sessionStorage.getItem('current_research');
      if (!storedResearch) {
        toast.error('No Research document found to update.');
        return;
      }

      // Parse the stored research to get its title and request an update
      const parsedResearch = JSON.parse(storedResearch) as ResearchDocument;
      
      // Set a state to indicate regeneration is happening
      setIsLoading(true);
      
      const regeneratePrompt = `Please update the research document titled "${parsedResearch.title}" with the latest information and insights available. Focus on enhancing the existing sections and adding any new relevant research findings. Return the complete updated research document.`;

      // Set the regenerate prompt as input and trigger submission
      setChatInput(regeneratePrompt);
      lastInputRef.current = regeneratePrompt;

      // Use setTimeout to ensure the UI updates before submission
      setTimeout(() => {
        const fakeEvent = new Event('submit') as unknown as React.FormEvent<HTMLFormElement>;
        handleSendMessage(fakeEvent);
      }, 100);

    } catch (error) {
      logger.error('Error regenerating Research:', error);
      toast.error('Failed to regenerate Research document. Please try again.');
      setIsLoading(false);
    }
  };

  // Listen for a refresh event from the workbench
  useEffect(() => {
    const handleResearchUpdatedEvent = () => {
      // Reload research from storage if the workbench has saved it
      const storedResearch = sessionStorage.getItem('current_research');
      if (storedResearch) {
        try {
          // Parse to verify it's valid
          JSON.parse(storedResearch);
          // No need to take further action - workbench has updated the document
          toast.info('Research document updated in Workbench.');
        } catch (error) {
          logger.error('Error parsing research from sessionStorage after workbench update:', error);
        }
      }
    };

    window.addEventListener('research_updated', handleResearchUpdatedEvent);
    return () => window.removeEventListener('research_updated', handleResearchUpdatedEvent);
  }, []);

  // Handle file upload button click
  const handleFileUpload = () => {
    fileInputRef.current?.click();
  };

  // Handle textarea input change and auto-resize
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setChatInput(e.target.value);
    handleInputChange(e);

    // Adjust textarea height based on content
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(
      Math.max(textarea.scrollHeight, TEXTAREA_MIN_HEIGHT),
      TEXTAREA_MAX_HEIGHT
    )}px`;
  };

  // Handle file selection
  const handleFileSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Process each file
    Array.from(files).forEach(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target?.result) {
            const dataUrl = event.target.result as string;
            setImageDataList(prevList => [...prevList, dataUrl]);
          }
        };
        reader.readAsDataURL(file);
      }
      setUploadedFiles(prevFiles => [...prevFiles, file]);
    });
  };

  // Handle paste event for images
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    let pastedImage = false;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          pastedImage = true;
          const reader = new FileReader();
          reader.onload = (event) => {
            if (event.target?.result) {
              const dataUrl = event.target.result as string;
              setImageDataList(prevList => [...prevList, dataUrl]);
              setUploadedFiles(prevFiles => [...prevFiles, file]);
            }
          };
          reader.readAsDataURL(file);
        }
      }
    }

    if (pastedImage) {
      e.preventDefault(); // Prevent default paste action if we handled an image
    }
  };

  // Function to select a template and set its prompt as input
  const selectTemplate = (prompt: string) => {
    setChatInput(prompt);
    lastInputRef.current = prompt;
    
    // Resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(
        Math.max(textareaRef.current.scrollHeight, TEXTAREA_MIN_HEIGHT),
        TEXTAREA_MAX_HEIGHT
      )}px`;
    }
    
    setSelectedTemplate(prompt);
    setShowResearchTips(false);
  };

  // Handle send message
  const handleSendMessage = (event: React.FormEvent<HTMLFormElement> | React.MouseEvent | React.KeyboardEvent) => {
    event.preventDefault();
    
    // Ensure chat type is set to 'research'
    chatType.set('research');
    
    // Don't send if loading or empty message
    if (isLoading || (!chatInput.trim() && uploadedFiles.length === 0)) {
      return;
    }

    // Prepare message content
    const messageContent = makeMessageContent();
    if (!messageContent) return;

    // Update states
    setIsLoading(true);
    setChatStarted(true);
    lastInputRef.current = chatInput;
    
    // Before clearing chat input, save to message store if needed
    if (chatInput.trim() && !initialMessageData.autoSubmit) {
      initialResearchMessageStore.set({
        text: chatInput,
        files: uploadedFiles,
        imageDataList: imageDataList,
        autoSubmit: false,
      });
    }
    
    setChatInput('');

    // Reset file upload states
    setUploadedFiles([]);
    setImageDataList([]);
    
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = `${TEXTAREA_MIN_HEIGHT}px`;
    }

    // Submit message
    handleSubmit(event as React.FormEvent<HTMLFormElement>, {
      data: { chatInput: messageContent },
    });
  };

  // Handle export chat
  const handleExportChat = () => {
    if (chatMessages.length === 0) {
      toast.error('No chat to export.');
      return;
    }

    const chatTitle = chatMessages.find(m => m.role === 'assistant')?.content.substring(0, 50) || 'Research Chat';
    const chatExport = {
      title: chatTitle,
      messages: chatMessages,
      date: new Date().toISOString(),
    };

    try {
      const blob = new Blob([JSON.stringify(chatExport, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `research-chat-${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('Chat exported successfully.');
    } catch (error) {
      logger.error('Error exporting chat:', error);
      toast.error('Failed to export chat.');
    }
  };

  return (
    <div className={classNames(
      "flex flex-col h-full transition-all duration-200 ease-in-out",
      {
        "mr-[calc(var(--workbench-width)_+_3rem)]": workbenchVisible,
        "hidden": backgroundMode
      }
    )}>
      {/* Left side - Chat UI */}
      <div className="flex-1 flex flex-col w-full max-w-full overflow-hidden">
        {/* Chat Header */}
        <div className="px-4 py-2 border-b border-bolt-elements-borderColor flex justify-between items-center">
          <div className="flex items-center">
            <div className="i-ph:binoculars text-xl mr-2"></div>
            <h2 className="text-lg font-semibold text-bolt-elements-textPrimary">Research Chat</h2>
          </div>
          
          <div className="flex items-center space-x-2">
            {/* Update Research Button */}
            {workbenchVisible && (
              <IconButton
                title="Update Research"
                className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-all"
                onClick={handleRegenerateResearch}
                disabled={isLoading}
              >
                <div className="i-ph:arrows-clockwise text-lg"></div>
              </IconButton>
            )}
            
            {/* Toggle Workbench Button */}
            <IconButton
              title={workbenchVisible ? "Hide Research Workbench" : "Show Research Workbench"}
              className={classNames(
                "text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-all",
                workbenchVisible && "text-bolt-elements-textPrimary"
              )}
              onClick={() => workbenchStore.showWorkbench.set(!workbenchVisible)}
              disabled={isLoading}
            >
              <div className="i-ph:sidebar text-lg"></div>
            </IconButton>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto">
          <Messages
            messages={chatMessages}
            className="px-4 py-3"
          />
        </div>

        {/* Input Area */}
        <div className="p-4 border-t border-bolt-elements-borderColor">
          <div className="mb-2">
            {uploadedFiles.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {uploadedFiles.map((file, index) => (
                  <FilePreview
                    key={index}
                    files={[file]}
                    onRemove={() => {
                      setUploadedFiles(files => files.filter((_, i) => i !== index));
                      if (file.type.startsWith('image/')) {
                        setImageDataList(list => list.filter((_, i) => i !== index));
                      }
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          <form onSubmit={handleSendMessage}>
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={chatInput}
                onChange={handleTextareaChange}
                onPaste={handlePaste}
                disabled={isLoading}
                className="w-full p-3 pr-10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary bg-bolt-elements-inputBackground border-bolt-elements-borderColor"
                placeholder="Ask for research on a topic..."
                rows={1}
                style={{
                  resize: 'none',
                  minHeight: TEXTAREA_MIN_HEIGHT,
                  maxHeight: TEXTAREA_MAX_HEIGHT,
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage(e);
                  }
                }}
              />
              
              <div className="absolute bottom-3 right-3">
                {isLoading ? (
                  <IconButton
                    title="Stop generating"
                    className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-all"
                    onClick={(e) => {
                      e.preventDefault();
                      stop();
                      setIsLoading(false);
                      researchStreamingState.set(false);
                    }}
                  >
                    <div className="i-ph:square text-lg"></div>
                  </IconButton>
                ) : (
                  <SendButton
                    show={true}
                    isStreaming={isLoading}
                    onClick={(e) => handleSendMessage(e)}
                    disabled={!chatInput.trim() && uploadedFiles.length === 0}
                  />
                )}
              </div>
            </div>

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
                  title="Research Templates"
                  className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-all"
                  onClick={() => {
                    if (chatStarted) {
                      toast.info("Describe the research you need (e.g., 'Research market trends for mobile apps').");
                    } else {
                      setShowResearchTips(true);
                    }
                  }}
                  disabled={isLoading}
                >
                  <div className="i-ph:binoculars-duotone text-lg"></div>
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

              {chatInput.length > 0 && !isLoading ? (
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
  );
};

export default ResearchChat;

// Helper function to sort sections by numerical prefix
const sortSectionsByNumericalPrefix = (sections: ResearchSection[]): ResearchSection[] => {
  return [...sections].sort((a, b) => {
    // Extract numerical prefixes if they exist (e.g., "1. Market Analysis")
    const aMatch = a.title.match(/^(\d+)\.\s/);
    const bMatch = b.title.match(/^(\d+)\.\s/);
    
    // If both have numerical prefixes, sort by the number
    if (aMatch && bMatch) {
      return parseInt(aMatch[1]) - parseInt(bMatch[1]);
    }
    
    // If only one has a numerical prefix, prioritize it
    if (aMatch) return -1;
    if (bMatch) return 1;
    
    // Otherwise, keep original order
    return 0;
  });
};