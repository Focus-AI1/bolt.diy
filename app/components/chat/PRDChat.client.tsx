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
import { workbenchStore } from '~/lib/stores/workbench';
import Cookies from 'js-cookie';
import { createScopedLogger } from '~/utils/logger';
import { createSampler } from '~/utils/sampler';
import FilePreview from './FilePreview';
import type { Message } from 'ai';
import { motion } from 'framer-motion';

const logger = createScopedLogger('PRDChat');
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

// Define PRD document structure
interface PRDDocument {
  title: string;
  description: string;
  sections: PRDSection[];
  lastUpdated: string;
}

interface PRDSection {
  id: string;
  title: string;
  content: string;
}

// Function to extract PRD content from messages
const extractPRDFromMessages = (messages: Message[]): PRDDocument | null => {
  // Look for assistant messages that might contain PRD content
  const assistantMessages = messages.filter(msg => msg.role === 'assistant');
  if (assistantMessages.length === 0) return null;

  // Try to find structured PRD content in the latest messages
  // This is a simple implementation - in production, you might want to use regex patterns
  // or other more robust methods to extract structured content
  const latestMessage = assistantMessages[assistantMessages.length - 1];
  const content = typeof latestMessage.content === 'string' ? latestMessage.content : '';
  
  // Check if the message has PRD-like structure
  if (!content.includes('# ') && !content.toLowerCase().includes('prd')) return null;

  try {
    // Extract title (assume first heading is the title)
    const titleMatch = content.match(/# (.*?)(?:\n|$)/);
    const title = titleMatch ? titleMatch[1].trim() : 'Untitled PRD';
    
    // Extract description (text between title and first section)
    let description = '';
    const descStart = titleMatch ? content.indexOf(titleMatch[0]) + titleMatch[0].length : 0;
    const firstSectionMatch = content.match(/## (.*?)(?:\n|$)/);
    const descEnd = firstSectionMatch ? content.indexOf(firstSectionMatch[0]) : content.length;
    
    if (descStart < descEnd) {
      description = content.substring(descStart, descEnd).trim();
    }
    
    // Extract sections
    const sectionRegex = /## (.*?)(?:\n|$)([\s\S]*?)(?=## |$)/g;
    const sections: PRDSection[] = [];
    let sectionMatch;
    let sectionIndex = 0;
    
    while ((sectionMatch = sectionRegex.exec(content)) !== null) {
      sections.push({
        id: `section-${sectionIndex++}`,
        title: sectionMatch[1].trim(),
        content: sectionMatch[2].trim()
      });
    }
    
    // If no sections found but we have content, create a default section
    if (sections.length === 0 && description) {
      sections.push({
        id: 'section-0',
        title: 'Overview',
        content: description
      });
      description = 'Product Requirements Document';
    }
    
    return {
      title,
      description,
      sections,
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error extracting PRD content:', error);
    return null;
  }
};

// Process messages with throttling to prevent excessive updates
const processSampledMessages = createSampler(
  (options: {
    messages: Message[];
    initialMessages: Message[];
    isLoading: boolean;
    parseMessages: (messages: Message[], isLoading: boolean) => void;
    storeMessageHistory: (messages: Message[]) => Promise<void>;
    extractPRDContent?: (messages: Message[]) => void;
  }) => {
    const { messages, initialMessages, isLoading, parseMessages, storeMessageHistory, extractPRDContent } = options;
    
    // Only process if we have messages beyond the initial ones
    if (messages.length > initialMessages.length || isLoading) {
      parseMessages(messages, isLoading);
      storeMessageHistory(messages).catch((error) => toast.error(error.message));
    }
    
    // Extract structured PRD content from messages if function is provided
    if (extractPRDContent) {
      extractPRDContent(messages);
    }
  },
  50
);

// PRD Chat component that handles the PRD-specific chat interface
const PRDChat = () => {
  const { ready, initialMessages, storeMessageHistory, exportChat } = useChatHistory();
  const [input, setInput] = useState('');
  const [parsedMessages, setParsedMessages] = useState<string[]>([]);
  const [chatStarted, setChatStarted] = useState(false);
  const [showPRDTips, setShowPRDTips] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [imageDataList, setImageDataList] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const showWorkbench = useStore(workbenchStore.showWorkbench);
  
  // Set the chat type to 'prd' when the PRD chat component is active
  useEffect(() => {
    chatType.set('prd');
    logger.debug('Chat type set to PRD');
  }, []);

  // Custom function to store messages with PRD type
  const storePRDMessages = useCallback((messages: Message[]) => {
    // Ensure the chat type is set to 'prd' before storing
    chatType.set('prd');
    return storeMessageHistory(messages);
  }, [storeMessageHistory]);

  // Initialize chat with API route
  const {
    messages,
    input: chatInput,
    handleInputChange,
    handleSubmit,
    setMessages,
    isLoading,
    error,
  } = useChat({
    api: '/api/prd-chat',
    initialMessages: initialMessages, // Use the initialMessages from useChatHistory
    id: 'prd-chat', // Set a unique ID for the PRD chat
    onFinish: (message) => {
      streamingState.set(false);
    },
    onError: (error) => {
      streamingState.set(false);
      toast.error(`Error: ${error.message}`);
    },
  });

  // Extract PRD content from messages
  const extractPRDContent = useCallback((messages: Message[]) => {
    const prdDocument = extractPRDFromMessages(messages);
    if (prdDocument) {
      // Store PRD in sessionStorage for the workbench to access
      sessionStorage.setItem('current_prd', JSON.stringify(prdDocument));
      
      // Show the workbench if it's not already visible
      if (!workbenchStore.showWorkbench.get()) {
        workbenchStore.showWorkbench.set(true);
      }
    }
  }, []);

  // Load chat history on component mount
  useEffect(() => {
    if (ready && initialMessages.length > 0) {
      // Only set messages if they're not already set
      if (messages.length === 0) {
        setMessages(initialMessages);
        setChatStarted(true);
        logger.debug('PRD chat history loaded', initialMessages.length);
      }
      
      // Extract PRD content from messages
      extractPRDContent(initialMessages);
    }
  }, [ready, initialMessages, setMessages]);

  // Process messages with throttling
  useEffect(() => {
    processSampledMessages({
      messages,
      initialMessages,
      isLoading,
      parseMessages: (messages, isLoading) => {
        if (isLoading) {
          streamingState.set(true);
        }
        
        if (messages.length > 0 && !chatStarted) {
          setChatStarted(true);
        }
      },
      storeMessageHistory: storePRDMessages,
      extractPRDContent,
    });
  }, [messages, isLoading, initialMessages, storePRDMessages]);

  // Auto-resize textarea based on content
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(
        Math.max(scrollHeight, TEXTAREA_MIN_HEIGHT),
        TEXTAREA_MAX_HEIGHT
      )}px`;
    }
  }, [chatInput]);

  // Handle file upload button click
  const handleFileUpload = () => {
    fileInputRef.current?.click();
  };

  // Handle textarea input change and auto-resize
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    handleInputChange(e); // Call the useChat hook's handleInputChange first
    
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(
        Math.max(scrollHeight, TEXTAREA_MIN_HEIGHT),
        TEXTAREA_MAX_HEIGHT
      )}px`;
    }
  };

  // Handle file selection
  const handleFileSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      setUploadedFiles(prev => [...prev, ...newFiles]);
      
      // Create image previews for image files
      newFiles.forEach(file => {
        if (file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = (e) => {
            if (e.target?.result) {
              setImageDataList(prev => [...prev, e.target!.result as string]);
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
          setUploadedFiles(prev => [...prev, file]);
          
          const reader = new FileReader();
          reader.onload = (e) => {
            if (e.target?.result) {
              setImageDataList(prev => [...prev, e.target!.result as string]);
            }
          };
          reader.readAsDataURL(file);
        }
      }
    }
  };

  // PRD template suggestions
  const prdTemplates = [
    {
      title: "Blank PRD",
      description: "Start with a clean slate",
      prompt: "Create a blank PRD template with standard sections."
    },
    {
      title: "Feature PRD",
      description: "For a specific product feature",
      prompt: "Create a PRD for a new feature with user stories, requirements, and success metrics."
    },
    {
      title: "Mobile App PRD",
      description: "For mobile applications",
      prompt: "Create a mobile app PRD template with platform-specific considerations."
    },
    {
      title: "API PRD",
      description: "For API development",
      prompt: "Create an API PRD with endpoints, request/response formats, and integration details."
    }
  ];

  // Function to select a template and set its prompt as input
  const selectTemplate = (prompt: string) => {
    // Use the setInput function from useChat to update the input value
    handleInputChange({ target: { value: prompt } } as React.ChangeEvent<HTMLTextAreaElement>);
    
    // Close the template modal if it's open
    setShowPRDTips(false);
    
    // Focus the textarea
    textareaRef.current?.focus();
  };

  // Handle send message
  const handleSendMessage = (event: React.FormEvent<HTMLFormElement> | React.MouseEvent) => {
    event.preventDefault();
    
    // Ensure we're in PRD mode
    chatType.set('prd');
    
    // Check if we have either text input or files
    const hasTemplateSelected = !chatStarted && prdTemplates.some(template => 
      chatInput.includes(template.prompt)
    );
    
    if (!chatInput.trim() && uploadedFiles.length === 0 && !hasTemplateSelected) {
      toast.info('Please enter a message or upload a file');
      return;
    }
    
    // Show workbench when sending first message
    if (!chatStarted && !workbenchStore.showWorkbench.get()) {
      workbenchStore.showWorkbench.set(true);
    }
    
    // TODO: Handle file uploads by appending to the message or sending separately
    // For now, just submit the text input
    handleSubmit(event as any); // Cast to any to bypass type checking for the ai package
    
    // Clear uploaded files after sending
    setUploadedFiles([]);
    setImageDataList([]);
    
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = `${TEXTAREA_MIN_HEIGHT}px`;
    }
    
    // Scroll to bottom after sending
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.scrollTo({
          top: textareaRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }
    }, 100);
  };

  // Handle export chat
  const handleExportChat = () => {
    const chatData = {
      messages,
      timestamp: new Date().toISOString(),
    };
    
    const blob = new Blob([JSON.stringify(chatData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prd-chat-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className={classNames(
      "flex flex-col h-full transition-all duration-200 ease-in-out",
      {
        "mr-[var(--workbench-width)]": showWorkbench
      }
    )}>
      {/* Chat header */}
      <div className="border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-3 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="i-ph:clipboard-text text-xl text-bolt-elements-textSecondary"></div>
          <h2 className="text-lg font-medium text-bolt-elements-textPrimary">PRD Assistant</h2>
        </div>
        <div className="flex items-center gap-1">
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
        {/* PRD Tips Modal */}
        {showPRDTips && !chatStarted && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-bolt-elements-background-overlay">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-bolt-elements-background-depth-1 rounded-lg shadow-lg max-w-md w-full p-6"
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold text-bolt-elements-textPrimary">PRD Templates</h3>
                <IconButton onClick={() => setShowPRDTips(false)} className="text-bolt-elements-textTertiary hover:text-bolt-elements-textSecondary">
                  <div className="i-ph:x"></div>
                </IconButton>
              </div>
              
              <div className="grid grid-cols-2 gap-3 mb-6">
                {prdTemplates.map((template, index) => (
                  <button
                    key={index}
                    className="flex flex-col p-4 border border-bolt-elements-borderColor rounded-lg hover:bg-bolt-elements-background-depth-2 transition-colors text-left"
                    onClick={() => {
                      if (textareaRef.current) {
                        selectTemplate(template.prompt);
                      }
                      setShowPRDTips(false);
                    }}
                  >
                    <span className="font-medium text-bolt-elements-textPrimary mb-1">{template.title}</span>
                    <span className="text-xs text-bolt-elements-textSecondary">{template.description}</span>
                  </button>
                ))}
              </div>
              
              <div className="text-sm text-bolt-elements-textSecondary bg-bolt-elements-background-depth-2 p-3 rounded-lg">
                <p className="mb-2 font-medium">Tips for better PRDs:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Be specific about user problems and goals</li>
                  <li>Include success metrics and KPIs</li>
                  <li>Define clear requirements and constraints</li>
                  <li>Consider edge cases and potential issues</li>
                </ul>
              </div>
            </motion.div>
          </div>
        )}
        
        {/* Messages container */}
        <div 
          className="flex-1 overflow-y-auto px-4 py-2 scroll-smooth"
        >
          <div className="max-w-3xl mx-auto">
            {!chatStarted ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6">
                <div className="i-ph:clipboard-text text-6xl text-bolt-elements-textTertiary mb-6"></div>
                <h3 className="text-2xl font-semibold text-bolt-elements-textPrimary mb-3">PRD Assistant</h3>
                <p className="text-bolt-elements-textSecondary max-w-md mb-8">
                  I can help you create comprehensive product requirement documents, analyze requirements, 
                  or extract structured information from your existing documents.
                </p>
                
                <div className="grid grid-cols-2 gap-4 w-full max-w-md mb-8">
                  {prdTemplates.map((template, index) => (
                    <button
                      key={index}
                      className="flex flex-col p-4 border border-bolt-elements-borderColor rounded-lg hover:bg-bolt-elements-background-depth-1 transition-colors text-left"
                      onClick={() => {
                        if (textareaRef.current) {
                          selectTemplate(template.prompt);
                        }
                      }}
                    >
                      <span className="font-medium text-bolt-elements-textPrimary mb-1">{template.title}</span>
                      <span className="text-xs text-bolt-elements-textSecondary">{template.description}</span>
                    </button>
                  ))}
                </div>
                
                <div className="text-sm text-bolt-elements-textTertiary">
                  You can also upload documents or images to include in your PRD
                </div>
              </div>
            ) : (
              <Messages messages={messages} />
            )}
          </div>
        </div>
        
        {/* Input area */}
        <div className="border-t border-bolt-elements-borderColor bg-bolt-elements-background-depth-0 p-4">
          <div className="max-w-3xl mx-auto">
            <form 
              onSubmit={handleSendMessage}
              className="flex flex-col gap-3"
            >
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
                      setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
                      setImageDataList((prev) => prev.filter((_, i) => i !== index));
                    }} 
                  />
                </div>
              )}
              
              <div className="relative">
                <textarea
                  ref={textareaRef}
                  className="w-full p-4 pr-16 bg-bolt-elements-background-depth-1 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-bolt-elements-borderColorFocus text-bolt-elements-textPrimary shadow-sm"
                  value={chatInput}
                  onChange={handleTextareaChange}
                  onPaste={handlePaste}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      handleSendMessage(event as unknown as React.MouseEvent);
                    }
                  }}
                  placeholder="Ask me to create a PRD, analyze requirements, or upload a document..."
                  style={{
                    minHeight: TEXTAREA_MIN_HEIGHT,
                    maxHeight: TEXTAREA_MAX_HEIGHT,
                  }}
                />
                
                <div className="absolute right-3 bottom-3 z-10">
                  <SendButton
                    show={true} 
                    isStreaming={isLoading}
                    onClick={(e) => handleSendMessage(e)}
                  />
                </div>
              </div>
              
              <div className="flex justify-between items-center">
                <div className="flex gap-2 items-center">
                  <IconButton 
                    title="Upload document or image" 
                    className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-all" 
                    onClick={handleFileUpload}
                  >
                    <div className="i-ph:paperclip text-lg"></div>
                  </IconButton>
                  
                  <IconButton 
                    title="PRD Templates" 
                    className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-all"
                    onClick={() => {
                      if (chatStarted) {
                        toast.info("Choose a template type in your message (blank, feature, mobile, or API)");
                      } else {
                        setShowPRDTips(true);
                      }
                    }}
                  >
                    <div className="i-ph:clipboard-text text-lg"></div>
                  </IconButton>
                  
                  {chatStarted && (
                    <IconButton 
                      title="Export Chat" 
                      className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-all"
                      onClick={handleExportChat}
                    >
                      <div className="i-ph:export text-lg"></div>
                    </IconButton>
                  )}
                </div>
                
                {chatInput.length > 3 ? (
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
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default PRDChat;