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
import { createScopedLogger } from '~/utils/logger';
import { createSampler } from '~/utils/sampler';
import FilePreview from './FilePreview';
import type { Message } from 'ai';
import { motion } from 'framer-motion';
import { initialPrdMessageStore } from './BaseChat';

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
  content: string; // Content is expected to be markdown
}

// Updated Function to extract PRD content, handling partial streams
const extractPRDFromMessages = (messages: Message[]): PRDDocument | null => {
  try {
    const assistantMessages = messages.filter(msg => msg.role === 'assistant');
    if (assistantMessages.length === 0) return null;

    // Find the latest assistant message that contains the start tag
    const latestPrdMessage = assistantMessages
      .slice() // Create a shallow copy to avoid reversing the original array if needed elsewhere
      .reverse()
      .find(msg => typeof msg.content === 'string' && msg.content.includes('<prd_document>'));

    if (!latestPrdMessage || typeof latestPrdMessage.content !== 'string') {
        // logger.debug('No assistant message with <prd_document> found.');
        return null;
    }

    const content = latestPrdMessage.content;
    const startIndex = content.indexOf('<prd_document>');
    let prdMarkdown = '';

    if (startIndex !== -1) {
        const endIndex = content.indexOf('</prd_document>', startIndex);
        if (endIndex !== -1) {
            // Complete document found
            prdMarkdown = content.substring(startIndex + '<prd_document>'.length, endIndex).trim();
            // Clear streaming content when complete
            workbenchStore.updateStreamingPRDContent(null);
        } else {
            // Potentially partial document (streaming)
            prdMarkdown = content.substring(startIndex + '<prd_document>'.length).trim();
            // Update streaming content for real-time display
            workbenchStore.updateStreamingPRDContent(prdMarkdown);
            // We can optionally add a small heuristic, e.g., don't parse if it's too short
            // if (prdMarkdown.length < 20) return null; // Avoid parsing tiny fragments
        }
    } else {
        // Should not happen based on the find condition, but good to check
        return null;
    }

    if (!prdMarkdown) {
        // logger.debug('Empty markdown content after extraction.');
        return null;
    }

    // First get any existing PRD to preserve edits
    let existingPRD: PRDDocument | null = null;
    try {
      const storedPRD = sessionStorage.getItem('current_prd');
      if (storedPRD) {
        existingPRD = JSON.parse(storedPRD);
      }
    } catch (error) {
      logger.error('Error parsing existing PRD from sessionStorage:', error);
      // Continue with extraction without merging if we couldn't parse
    }

    // Check for placeholder text that indicates partial content
    const hasPlaceholderText = prdMarkdown.includes('[Previous sections continue unchanged...]') || 
                              prdMarkdown.includes('[section unchanged]') || 
                              prdMarkdown.includes('[unchanged content]');

    // If we detect placeholder text and have an existing PRD, we need to ensure we preserve the full document
    if (hasPlaceholderText && existingPRD) {
      logger.warn('Detected placeholder text in PRD content. Using existing PRD as base.');
      
      // Parse the new content to extract only the sections that were updated
      const parsedPartialPRD = parseMarkdownToPRD(prdMarkdown);
      
      if (!parsedPartialPRD) {
        logger.error('Failed to parse partial PRD with placeholders');
        return existingPRD; // Return existing PRD unchanged
      }
      
      // Create a new PRD based on the existing one
      const mergedPRD: PRDDocument = {
        ...existingPRD,
        lastUpdated: new Date().toISOString()
      };
      
      // Only update title if provided and different
      if (parsedPartialPRD.title && parsedPartialPRD.title !== 'Untitled PRD' && 
          parsedPartialPRD.title !== existingPRD.title) {
        mergedPRD.title = parsedPartialPRD.title;
      }
      
      // Only update description if provided and different
      if (parsedPartialPRD.description && parsedPartialPRD.description !== existingPRD.description) {
        mergedPRD.description = parsedPartialPRD.description;
      }
      
      // For sections, we need to merge based on title
      if (parsedPartialPRD.sections && parsedPartialPRD.sections.length > 0) {
        // Create a map of existing sections by title for easier lookup
        const existingSectionsByTitle = new Map<string, PRDSection>();
        existingPRD.sections.forEach(section => {
          existingSectionsByTitle.set(section.title.toLowerCase(), section);
        });
        
        // Update or add sections from the partial PRD
        parsedPartialPRD.sections.forEach(newSection => {
          const existingSection = existingSectionsByTitle.get(newSection.title.toLowerCase());
          
          if (existingSection) {
            // Update existing section content
            existingSection.content = newSection.content;
            // Remove from map to track which we've processed
            existingSectionsByTitle.delete(newSection.title.toLowerCase());
          } else {
            // Add new section
            mergedPRD.sections.push({
              id: `section-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
              title: newSection.title,
              content: newSection.content
            });
          }
        });
        
        // Rebuild sections array with updated content
        mergedPRD.sections = [
          ...mergedPRD.sections.filter(section => 
            !existingSectionsByTitle.has(section.title.toLowerCase())),
          ...Array.from(existingSectionsByTitle.values())
        ];
      }
      
      return mergedPRD;
    }

    // If no placeholders detected or no existing PRD, parse the markdown normally
    return parseMarkdownToPRD(prdMarkdown, existingPRD);
  } catch (error) {
    logger.error('Error parsing potentially partial PRD markdown:', error);
    return null;
  }
};

// Helper function to parse markdown into PRD document structure
const parseMarkdownToPRD = (markdown: string, existingPRD: PRDDocument | null = null): PRDDocument | null => {
  try {
    const lines = markdown.split('\n');
    let title = 'Untitled PRD';
    let description = '';
    const sections: PRDSection[] = [];
    let currentSection: PRDSection | null = null;
    let readingState: 'title' | 'description' | 'section' = 'title';
    let hasFoundTitle = false;

    lines.forEach((line, index) => {
      const trimmedLine = line.trim();

      // Skip placeholder lines
      if (trimmedLine.includes('[Previous sections continue unchanged...]') || 
          trimmedLine.includes('[section unchanged]') || 
          trimmedLine.includes('[unchanged content]')) {
        return;
      }

      // Only assign the *first* H1 as the title
      if (!hasFoundTitle && trimmedLine.startsWith('# ')) {
        title = trimmedLine.substring(2).trim();
        readingState = 'description';
        hasFoundTitle = true; // Mark title as found
      } else if (trimmedLine.startsWith('## ')) {
        if (currentSection) {
          currentSection.content = currentSection.content.trimEnd(); // Trim trailing whitespace only
          sections.push(currentSection);
        }
        const sectionTitle = trimmedLine.substring(3).trim();
        currentSection = {
          id: `section-${sections.length}`,
          title: sectionTitle,
          content: '',
        };
        readingState = 'section';
        // Clear description accumulation only when changing from description to section
        if (readingState === 'section' && hasFoundTitle) {
          description = description.trim(); // Final trim if we switch state
        }
      } else if (readingState === 'description' && hasFoundTitle) {
         // Accumulate description lines after the title line
         description += line + '\n';
      } else if (readingState === 'section' && currentSection) {
        currentSection.content += line + '\n';
      }
      // Ignore lines before the first # title
    });

    if (currentSection) {
      // Ensure currentSection is of type PRDSection before accessing content
      const typedSection = currentSection as PRDSection;
      typedSection.content = typedSection.content.trimEnd();
      sections.push(typedSection);
    }

    description = description.trim();

    // Only return a document if at least a title was parsed
    if (!hasFoundTitle && sections.length === 0 && !description) {
      // logger.debug('Partial PRD parsing did not yield title or sections.');
      return null;
    }

    // If we have an existing PRD, merge the new content with it
    if (existingPRD) {
      // For title and description, only update if they've been significantly changed
      const newPRD: PRDDocument = {
        title: existingPRD.title,
        description: existingPRD.description,
        sections: [], // Initialize with empty array, will be populated later
        lastUpdated: new Date().toISOString()
      };

      // Only update title if the new one is significantly different and not default
      if (title !== 'Untitled PRD' && title !== existingPRD.title) {
        newPRD.title = title;
      }

      // Only update description if there's a significant change
      if (description && description !== existingPRD.description) {
        newPRD.description = description;
      }

      // Create a map of existing sections by title for easier lookup
      const existingSectionsByTitle = new Map<string, PRDSection>();
      existingPRD.sections.forEach(section => {
        existingSectionsByTitle.set(section.title.toLowerCase(), section);
      });
      
      // Process the new sections, preserving IDs from matching existing sections
      sections.forEach((newSection, index) => {
        const existingSection = existingSectionsByTitle.get(newSection.title.toLowerCase());
        
        if (existingSection) {
          // Use existing section ID but with the new content
          newPRD.sections.push({
            id: existingSection.id,
            title: newSection.title,
            content: newSection.content
          });
          
          // Remove this section from the map to track which we've processed
          existingSectionsByTitle.delete(newSection.title.toLowerCase());
        } else {
          // New section - add it with a new ID
          newPRD.sections.push({
            id: `section-${index}`,
            title: newSection.title,
            content: newSection.content
          });
        }
      });
      
      // Add any remaining existing sections that weren't in the new content
      // This ensures we preserve sections that weren't included in the partial update
      existingSectionsByTitle.forEach(section => {
        newPRD.sections.push(section);
      });
      
      return newPRD;
    }

    // If no existing PRD, return the newly parsed one
    return {
      title,
      description,
      sections,
      lastUpdated: new Date().toISOString(),
    };
  } catch (error) {
    logger.error('Error in parseMarkdownToPRD:', error);
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
    storeMessageHistory: (messages: Message[]) => Promise<void>;
    extractPRDContent?: (messages: Message[]) => void; // Make extractPRDContent optional here
  }) => {
    const { messages, initialMessages, isLoading, parseMessages, storeMessageHistory, extractPRDContent } = options;

    // Store history if needed
    if (messages.length > initialMessages.length || isLoading) {
      parseMessages(messages, isLoading); // Handles setting chatStarted and streamingState
      storeMessageHistory(messages).catch((error) => toast.error(error.message)); // Store history
    }

    // Attempt PRD extraction on every sample if the function is provided
    if (extractPRDContent) {
      extractPRDContent(messages); // Try extracting from current (potentially streaming) messages
    }
  },
  50 // Sampling interval in ms
);


// PRD Chat component
const PRDChat = ({ backgroundMode = false }) => {
  // ... states (input, chatStarted, showPRDTips, uploadedFiles, etc.) ...
  const [input, setInput] = useState('');
  const [chatStarted, setChatStarted] = useState(false);
  const [showPRDTips, setShowPRDTips] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [imageDataList, setImageDataList] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const showWorkbench = useStore(workbenchStore.showWorkbench);
  const initialMessageData = useStore(initialPrdMessageStore);
  const initialMessageProcessedRef = useRef(false);
  const { ready, initialMessages, storeMessageHistory, exportChat } = useChatHistory();
  const isStreaming = useStore(streamingState); // Use store for streaming state

  useEffect(() => {
    chatType.set('prd');
    logger.debug('Chat type set to PRD');
  }, []);

  const storePRDMessages = useCallback((messages: Message[]) => {
    chatType.set('prd');
    return storeMessageHistory(messages);
  }, [storeMessageHistory]);


  const {
    messages,
    append,
    reload,
    stop,
    isLoading, // isLoading from useChat reflects streaming state
    input: chatInput,
    setInput: setChatInput,
    handleSubmit,
    handleInputChange,
  } = useChat({
    api: '/api/prd-chat',
    id: 'prd-chat',
    initialMessages: initialMessages,
    onFinish: (message) => {
      const finishTimestamp = new Date().toISOString(); // Get timestamp when generation finishes
      // Final extraction attempt when streaming finishes, ensures the complete doc is parsed
      const finalMessages = [...messages, message];
      storePRDMessages(finalMessages); // Store history

      const prdDocument = extractPRDFromMessages(finalMessages);
      if (prdDocument) {
        // Check if this is a new chat session
        let isNewSession = false;
        if (finalMessages.length > 0 && finalMessages[0].role === 'user' && initialMessages.length === 0) {
          // This is a new chat session, we should start fresh
          isNewSession = true;
          logger.debug('New chat session detected in onFinish, using fresh PRD content');
        }
        
        // Get the existing PRD from sessionStorage to maintain section order
        let existingPRD: PRDDocument | null = null;
        if (!isNewSession) {
          try {
            const storedPRD = sessionStorage.getItem('current_prd');
            if (storedPRD) {
              existingPRD = JSON.parse(storedPRD);
            }
          } catch (error) {
            logger.error('Error parsing existing PRD from sessionStorage:', error);
          }
        }
        
        // If we have an existing PRD and this is not a new session, ensure we maintain the section order
        let finalPRD = prdDocument;
        if (existingPRD && !isNewSession) {
          // Create a map of new sections by title for easier lookup
          const newSectionsByTitle = new Map<string, PRDSection>();
          prdDocument.sections.forEach(section => {
            newSectionsByTitle.set(section.title.toLowerCase(), section);
          });
          
          // Preserve order by going through existing sections first
          const orderedSections: PRDSection[] = [];
          
          // First add existing sections with updated content where applicable
          existingPRD.sections.forEach(existingSection => {
            const newSection = newSectionsByTitle.get(existingSection.title.toLowerCase());
            if (newSection) {
              // Use existing section ID but updated content
              orderedSections.push({
                id: existingSection.id,
                title: existingSection.title,
                content: newSection.content
              });
              // Remove from map to track which we've processed
              newSectionsByTitle.delete(existingSection.title.toLowerCase());
            } else {
              // Keep existing section unchanged
              orderedSections.push(existingSection);
            }
          });
          
          // Then add any new sections that weren't in the existing PRD
          if (newSectionsByTitle.size > 0) {
            Array.from(newSectionsByTitle.values()).forEach(newSection => {
              orderedSections.push({
                id: `section-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                title: newSection.title,
                content: newSection.content
              });
            });
          }
          
          // Create final PRD with sections in the right order
          finalPRD = {
            ...prdDocument,
            sections: orderedSections
          };
        }
        
        // FINAL SAFETY CHECK: Ensure sections are in numerical order if they have numerical prefixes
        finalPRD.sections = sortSectionsByNumericalPrefix(finalPRD.sections);
        
        // This is now the ONLY place where we write to sessionStorage
        sessionStorage.setItem('current_prd', JSON.stringify(finalPRD));
        logger.debug('PRD extracted and saved onFinish (final)');
        
        // Clear the streaming content since we now have the final version
        workbenchStore.updateStreamingPRDContent(null);
        
        // Trigger storage event for workbench update
        window.dispatchEvent(new StorageEvent('storage', { 
          key: 'current_prd', 
          newValue: JSON.stringify(finalPRD), 
          storageArea: sessionStorage 
        }));
      }
      
      // Update the last generated timestamp *after* processing and storing
      workbenchStore.updatePRDLastGenerated(finishTimestamp);
      streamingState.set(false);
      logger.debug('Streaming finished.');
      
      // Ensure workbench is visible after PRD generation
      if (prdDocument && !backgroundMode && !workbenchStore.showWorkbench.get()) {
        workbenchStore.showWorkbench.set(true);
      }
    },
    onError: (error) => {
      streamingState.set(false); // Ensure streaming state is reset on error
      toast.error(`Error: ${error.message}`);
      logger.error('PRD Chat API error:', error);
       // Also potentially reset the last generated timestamp or handle differently? For now, just reset streaming.
    },
     // onResponse is called when the server response starts
     onResponse: (response) => {
        if (response.ok) {
            streamingState.set(true); // Set streaming state when response starts
             logger.debug('Streaming response started.');
        }
    },
  });

   // This is the primary callback for progressive extraction
  const extractPRDContent = useCallback((currentMessages: Message[]) => {
    try {
      // Extract PRD content from messages
      const prdDocument = extractPRDFromMessages(currentMessages);
      
      if (prdDocument) {
        // Only update the streaming content store, don't write to sessionStorage
        // This ensures we show real-time updates in the UI without changing the source of truth
        
        // Get the existing PRD from sessionStorage to maintain section order
        let existingPRD: PRDDocument | null = null;
        let isNewSession = false;
        
        // Check if this is a new chat session
        if (messages.length > 0 && messages[0].role === 'user' && initialMessages.length === 0) {
          // This is a new chat session, we should start fresh
          isNewSession = true;
          logger.debug('New chat session detected, starting with fresh PRD content');
        } else {
          try {
            const storedPRD = sessionStorage.getItem('current_prd');
            if (storedPRD) {
              existingPRD = JSON.parse(storedPRD);
            }
          } catch (error) {
            logger.error('Error parsing existing PRD from sessionStorage:', error);
          }
        }
        
        // If we have an existing PRD and this is not a new session, ensure we maintain the section order
        let orderedPRD = prdDocument;
        if (existingPRD && !isNewSession) {
          // Create a map of new sections by title for easier lookup
          const newSectionsByTitle = new Map<string, PRDSection>();
          prdDocument.sections.forEach(section => {
            newSectionsByTitle.set(section.title.toLowerCase(), section);
          });
          
          // Preserve order by going through existing sections first
          const orderedSections: PRDSection[] = [];
          
          // First add existing sections with updated content where applicable
          existingPRD.sections.forEach(existingSection => {
            const newSection = newSectionsByTitle.get(existingSection.title.toLowerCase());
            if (newSection) {
              // Use existing section ID but updated content
              orderedSections.push({
                id: existingSection.id,
                title: existingSection.title,
                content: newSection.content
              });
              // Remove from map to track which we've processed
              newSectionsByTitle.delete(existingSection.title.toLowerCase());
            } else {
              // Keep existing section unchanged
              orderedSections.push(existingSection);
            }
          });
          
          // Then add any new sections that weren't in the existing PRD
          if (newSectionsByTitle.size > 0) {
            Array.from(newSectionsByTitle.values()).forEach(newSection => {
              orderedSections.push({
                id: `section-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                title: newSection.title,
                content: newSection.content
              });
            });
          }
          
          // Create ordered PRD with sections in the right order
          orderedPRD = {
            ...prdDocument,
            sections: orderedSections
          };
        }
        
        // FINAL SAFETY CHECK: Ensure sections are in numerical order if they have numerical prefixes
        orderedPRD.sections = sortSectionsByNumericalPrefix(orderedPRD.sections);
        
        // Convert the ordered PRD document to markdown for streaming display
        const prdMarkdown = [
          `# ${orderedPRD.title}`,
          '',
          orderedPRD.description,
          '',
          ...orderedPRD.sections.map(section => (
            `## ${section.title}\n\n${section.content}`
          ))
        ].join('\n');
        
        workbenchStore.updateStreamingPRDContent(prdMarkdown);
        
        // Ensure workbench is visible if not in background mode
        if (!workbenchStore.showWorkbench.get() && !backgroundMode) {
          workbenchStore.showWorkbench.set(true);
          logger.debug('Showing workbench as PRD content is available.');
        }
      }
    } catch (error) {
      logger.error('Error extracting PRD content:', error);
    }
  }, [backgroundMode, messages, initialMessages]);

  // Load chat history
  useEffect(() => {
    if (ready && initialMessages.length > 0) {
      if (messages.length === 0) {
        logger.debug('PRD chat history ready with', initialMessages.length, 'messages.');
        setChatStarted(true); // Mark chat started if history exists
      }
      // Extract from history immediately
      extractPRDContent(initialMessages);
    } else if (ready) {
      logger.debug('PRD chat history ready but empty.');
      // Ensure chatStarted reflects reality if messages are added later
      if (messages.length > 0 && !chatStarted) {
          setChatStarted(true);
      }
    }
  }, [ready, initialMessages, extractPRDContent, messages.length, chatStarted]);


  // Effect for sampling messages, storing history, and triggering progressive PRD extraction
  useEffect(() => {
    processSampledMessages({
      messages,
      initialMessages,
      isLoading,
      parseMessages: (msgs, loading) => {
        // Original logic called workbenchStore.updatePRD and dispatched storage event here.
        // This should now happen only in onFinish to avoid premature updates.
        // We might still want chatStarted logic here if needed.
        if (msgs.length > initialMessages.length && !chatStarted) {
          setChatStarted(true);
        }
        // The progressive extraction via extractPRDContent should still work for updating the workbench display during streaming.
      },
      storeMessageHistory: storePRDMessages,
      extractPRDContent, // Pass the extraction function for progressive updates
    });
  }, [messages, isLoading, initialMessages, storePRDMessages, extractPRDContent, chatStarted]); // Added chatStarted dependency


  // Add state for PRD update notification
  const [showUpdateNotification, setShowUpdateNotification] = useState(false);
  // Get the needsUpdate status from the store
  const needsUpdate = useStore(workbenchStore.prdNeedsUpdate);

  // Check if PRD needs update based on ticket changes AND if chat is idle
  useEffect(() => {
     // Show notification only if an update is needed AND the chat is not currently loading/streaming
    setShowUpdateNotification(needsUpdate && !isLoading);

    // Optional: remove interval logic if store listener is sufficient
  }, [needsUpdate, isLoading]); // Depend on store value and isLoading


  // Function to handle PRD regeneration based on updated tickets
  const handleRegeneratePRD = () => {
    // Acknowledge the update immediately to hide the button
    workbenchStore.acknowledgePRDUpdate();
    setShowUpdateNotification(false); // Hide manually as well

    // Get the current PRD from sessionStorage to preserve manual edits
    const currentPRD = sessionStorage.getItem('current_prd');
    const latestTickets = sessionStorage.getItem('tickets');
    let ticketsContext = '';
    let prdContext = '';

    // Parse the current PRD to include in the context
    if (currentPRD) {
      try {
        const prdData = JSON.parse(currentPRD) as PRDDocument;
        prdContext = `Current PRD: "${prdData.title}"\n\nSections:\n${prdData.sections.map((section, index) => 
          `Section ${index + 1}: ${section.title}`
        ).join('\n')}`;
      } catch (error) {
        logger.error('Error parsing current PRD data:', error);
      }
    }

    if (latestTickets) {
      try {
        const ticketData = JSON.parse(latestTickets);
        ticketsContext = `Based on the following updated tickets:\n${ticketData.map((ticket: any, index: number) => // Use 'any' or define Ticket type locally/import
          `Ticket ${index + 1}: ${ticket.title} (${ticket.type}, ${ticket.priority})
Description: ${ticket.description.substring(0, 100)}...`
        ).join('\n')}`;
      } catch (error) {
        logger.error('Error parsing tickets data:', error);
      }
    }

    const lastUserMessage = messages.filter(m => m.role === 'user').pop();
    const updatePrompt = `Tickets have been updated. Please update the PRD considering these changes, ensuring the entire document is returned.

IMPORTANT: The existing PRD may have been manually edited by the user. When generating the updated PRD:
1. Identify sections directly affected by the ticket changes.
2. For affected sections, completely REPLACE the old content with the new, updated content reflecting the ticket changes. DO NOT append.
3. Preserve the exact titles and content of all sections NOT affected by the ticket changes.
4. Ensure ALL standard PRD sections (Executive Summary, Problem Statement, User Requirements, etc.) are present in the output. If a standard section was not affected by tickets and has existing content, preserve it. If it was affected, update it. If it's a standard section not previously present or without relevant updates, include its title and a brief note like 'No updates based on current context.' DO NOT OMIT ANY STANDARD SECTION.
5. Return the COMPLETE PRD document, including ALL standard sections (updated, preserved, or with notes), wrapped in <prd_document> tags.

${prdContext}

${ticketsContext}

(Context from original request if available: ${lastUserMessage?.content ?? 'Generate initial PRD based on the tickets.'})`;

    append({
      role: 'user',
      content: updatePrompt
    });
  };

  // Listen for storage events to detect changes in tickets from the workbench
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'tickets' && event.newValue !== null) {
        // Tickets have been updated in the workbench, call the store method
        // The store method now handles the logic of comparing timestamps
        workbenchStore.updateTickets();
      }
       // Add listener for PRD updates potentially triggered by workbench edits
       if (event.key === 'current_prd' && event.newValue !== null) {
         workbenchStore.updatePRD();
       }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []); // No dependencies needed


    // Check for initial message data and auto-submit if needed
    useEffect(() => {
      // Only process if we haven't already and there's data to process
      if (!initialMessageProcessedRef.current &&
          initialMessageData.autoSubmit &&
          (initialMessageData.text || initialMessageData.imageDataList.length > 0)) {

        initialMessageProcessedRef.current = true;

        // Set the input text for display purposes - use setChatInput from useChat
        setChatInput(initialMessageData.text); // Use hook's setter

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
          if (!backgroundMode && !workbenchStore.showWorkbench.get()) {
            workbenchStore.showWorkbench.set(true);
          }

          // Reset the store to prevent resubmission on component remounts
          initialPrdMessageStore.set({
            text: '',
            files: [],
            imageDataList: [],
            autoSubmit: false
          });

          // Set chat as started
          setChatStarted(true);
          // Clear local input state as well
          setInput(''); // Clear local state if still used
        }, 100); // Reduced timeout
      }
    }, [initialMessageData, ready, append, backgroundMode, setChatInput]); // Added setChatInput dependency


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
    }, [chatInput]); // Depend on chatInput from useChat hook

    // Handle file upload button click
    const handleFileUpload = () => {
      fileInputRef.current?.click();
    };

    // Handle textarea input change and auto-resize
    const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      handleInputChange(e); // This updates chatInput via useChat hook
      // Auto-resize logic is now handled by the useEffect depending on chatInput
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
            reader.onload = (event) => { // Use event consistently
              if (event.target?.result) {
                setImageDataList(prev => [...prev, event.target!.result as string]);
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
            reader.onload = (event) => { // Use event consistently
              if (event.target?.result) {
                setImageDataList(prev => [...prev, event.target!.result as string]);
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
      // Use the setChatInput function from useChat to update the input value
      setChatInput(prompt); // Directly set the hook's state

      // Close the template modal if it's open
      setShowPRDTips(false);

      // Focus the textarea
      textareaRef.current?.focus();
    };


    // Handle send message
    const handleSendMessage = (event: React.FormEvent<HTMLFormElement> | React.MouseEvent | React.KeyboardEvent) => {
      event.preventDefault();

      // Ensure we're in PRD mode
      chatType.set('prd');

      // Check if we have either text input or files/images
      const hasTemplateSelected = !chatStarted && prdTemplates.some(template =>
        chatInput.includes(template.prompt) // Check against chatInput
      );

      const currentInput = chatInput.trim(); // Use chatInput from hook

      if (!currentInput && uploadedFiles.length === 0 && !hasTemplateSelected) {
        toast.info('Please enter a message or upload a file');
        return;
      }

      // Show workbench when sending first message if not already shown
      if (!chatStarted && !workbenchStore.showWorkbench.get() && !backgroundMode) {
          workbenchStore.showWorkbench.set(true);
      }


      // Create message content array with text and images
      // Vercel AI SDK expects content as a string, or structured data for multimodal
      let messageContent: string | MessageContent[] = currentInput; // Start with text content

      if (imageDataList.length > 0) {
         // Format for multimodal input if API supports it
         // Assuming API handles { type: 'text', text: ... } and { type: 'image', image: ... } structure
         // passed via the `data` field in handleSubmit options.
         const contentParts: MessageContent[] = [{ type: 'text', text: currentInput }];
         imageDataList.forEach(imageData => {
           contentParts.push({ type: 'image', image: imageData });
         });
         messageContent = contentParts; // This might need adjustment based on how API expects multimodal input
      }


      // Submit the message
      // If using multimodal, pass structured content via options.data
      // Otherwise, append handles string content directly.
      // Let's assume the API route handles `messages` array and extracts text/image parts if needed from the last message.
      // Or, we might need to adjust the useChat call or API endpoint.
      // For simplicity, let's stick to sending text via main input and handle images separately if needed by API.
      // If API `/api/prd-chat` expects structured data, we should use `append({ role: 'user', content: messageContent })`
      // If it expects just text + data, use handleSubmit.
      // The current `handleSubmit` call passes data via `options.data` { data: { messages: messageContent } }
      // Let's keep that for now.

      if (typeof messageContent === 'string') {
        event.preventDefault();
        handleSubmit(event);
      } else {
        // For multimodal content, use the data option with type assertion
        event.preventDefault();
        handleSubmit(event, { data: { messages: messageContent } as any });
      }


      // Clear uploaded files and input after sending
      setUploadedFiles([]);
      setImageDataList([]);
      setChatInput(''); // Clear input using the hook's setter

      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = `${TEXTAREA_MIN_HEIGHT}px`;
      }

      // Scroll to bottom after sending (might need adjustment depending on message rendering timing)
      setTimeout(() => {
        // Re-evaluate scrolling mechanism if needed
         const messagesContainer = document.querySelector('.flex-1.overflow-y-auto.px-4.py-2.scroll-smooth'); // Adjust selector if needed
         if (messagesContainer) {
             messagesContainer.scrollTop = messagesContainer.scrollHeight;
         }
      }, 100);

      setChatStarted(true); // Ensure chat is marked as started
    };


    // Handle export chat
    const handleExportChat = () => {
      const chatData = {
        messages, // Export the current messages state
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

    // Filter messages for display, removing the PRD block
    const messagesForDisplay = messages.map(msg => {
      if (msg.role === 'assistant' && typeof msg.content === 'string' && msg.content.includes('<prd_document>')) {
        // Replace the PRD block with a placeholder or just remove it
        const cleanedContent = msg.content.replace(/<prd_document>[\s\S]*?<\/prd_document>/, '\n\n*[PRD content updated in Workbench]*\n').trim();
        // Only show the placeholder if the cleaned content is otherwise empty
        if (cleanedContent === '*[PRD content updated in Workbench]*') {
           return { ...msg, content: cleanedContent };
        } else if (cleanedContent) {
            // If there's other text, show it and maybe add the note?
            return { ...msg, content: cleanedContent.replace('*[PRD content updated in Workbench]*','').trim() + '\n\n*[PRD content updated in Workbench]*' };
        } else {
             // If after removing the block there's nothing left, show only the note.
              return { ...msg, content: '*[PRD content updated in Workbench]*' };
        }

      }
      return msg;
    }).filter(msg => msg.content); // Filter out potentially empty messages after cleaning


  return (
    <div className={classNames(
      "flex flex-col h-full transition-all duration-200 ease-in-out",
      {
        "mr-[calc(var(--workbench-width)_+_3rem)]": showWorkbench,
        "hidden": backgroundMode // Hide the UI when in background mode
      }
    )}>
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
                      selectTemplate(template.prompt); // Updated to use hook setter
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
          // Add a ref maybe for scrolling? let messagesRef = useRef<HTMLDivElement>(null);
        >
          <div className="max-w-chat mx-auto">
            {!chatStarted && messagesForDisplay.length === 0 ? ( // Check messages length too
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
                          selectTemplate(template.prompt); // Updated
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
               // Pass filtered messages to the Messages component
              <Messages messages={messagesForDisplay} />
            )}
          </div>
        </div>

        {/* PRD Update Notification - Placed above input area */}
        {showUpdateNotification && (
          <div className="px-4 pb-3 flex-shrink-0"> {/* Container to align with input padding */}
             <div className="max-w-chat mx-auto bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-lg p-3 shadow-sm flex items-center justify-between gap-3">
               <div className="flex items-center gap-2 text-bolt-elements-textPrimary text-sm">
                 <span className="i-ph:info text-lg text-bolt-elements-background-accent"></span>
                 <span>Tickets updated. Regenerate PRD to reflect changes?</span>
               </div>
               <button
                 onClick={handleRegeneratePRD}
                 className="flex items-center gap-1.5 px-3 py-1.5 bg-bolt-elements-background-accent hover:bg-bolt-elements-background-accentHover text-bolt-elements-textOnAccent rounded-md text-sm font-medium transition-colors whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-bolt-elements-background-depth-1 focus:ring-bolt-elements-background-accent"
                 disabled={isLoading}
               >
                 <span className="i-ph:arrows-clockwise text-base"></span>
                 Regenerate
               </button>
             </div>
           </div>
        )}

        {/* Input area */}
        <div className="border-t border-bolt-elements-borderColor bg-bolt-elements-background-depth-0 p-4 flex-shrink-0">
          <div className="max-w-chat mx-auto">
            <form
              onSubmit={handleSendMessage} // Use the combined handler
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
                      // Keep index-based removal simple
                      setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
                      setImageDataList((prev) => {
                          // This assumes imageDataList corresponds directly to image files in uploadedFiles
                          // A more robust approach might involve mapping files to their data URLs
                          // For now, filter by index assuming correlation
                          const imageFilesCount = uploadedFiles.filter(f => f.type.startsWith('image/')).length;
                           // This logic is flawed if non-image files exist before the removed image file.
                           // Let's simplify: If removing from FilePreview, clear all previews and regenerate?
                           // Or pass the specific imageDataURL to remove.
                           // Let's keep the simple index filter for now, assuming FilePreview passes the correct index.
                           return prev.filter((_, i) => i !== index);

                           // Alternative: Pass file identifier or dataURL back
                           // onRemove={(identifier) => { ... remove based on identifier ...}}
                      });
                    }}
                  />
                </div>
              )}

              <div className="relative">
                <textarea
                  ref={textareaRef}
                  className="w-full p-4 pr-16 bg-bolt-elements-background-depth-1 rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-bolt-elements-borderColorFocus text-bolt-elements-textPrimary shadow-sm"
                  value={chatInput} // Use chatInput from useChat hook
                  onChange={handleTextareaChange} // Use combined handler
                  onPaste={handlePaste}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      handleSendMessage(event); // Use combined handler
                    }
                  }}
                  placeholder="Ask me to create a PRD, analyze requirements, or upload a document..."
                  style={{
                    minHeight: TEXTAREA_MIN_HEIGHT,
                    maxHeight: TEXTAREA_MAX_HEIGHT,
                    // Height is now controlled by useEffect
                  }}
                  disabled={isLoading} // Disable input while streaming
                />

                <div className="absolute right-3 bottom-3 z-10">
                   {isLoading ? ( // Show stop button when streaming
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
                        isStreaming={isLoading} // This will be false here
                        onClick={(e) => handleSendMessage(e)}
                        disabled={!chatInput.trim() && uploadedFiles.length === 0} // Disable send if no input/files
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
                     disabled={isLoading} // Disable upload during streaming
                  >
                    <div className="i-ph:paperclip text-lg"></div>
                  </IconButton>

                  <IconButton
                    title="PRD Templates"
                    className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-all"
                    onClick={() => {
                      if (chatStarted) {
                        toast.info("Describe the PRD template you need (e.g., 'Create a mobile app PRD').");
                      } else {
                        setShowPRDTips(true);
                      }
                    }}
                     disabled={isLoading} // Disable templates during streaming
                  >
                    <div className="i-ph:clipboard-text text-lg"></div>
                  </IconButton>

                  {chatStarted && (
                    <IconButton
                      title="Export Chat"
                      className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-all"
                      onClick={handleExportChat}
                       disabled={isLoading} // Disable export during streaming
                    >
                      <div className="i-ph:export text-lg"></div>
                    </IconButton>
                  )}
                </div>

                {chatInput.length > 0 && !isLoading ? ( // Show hint only when not loading
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
              accept="image/*,.pdf,.doc,.docx,.txt,.md" // Consider refining accepted types
              disabled={isLoading} // Disable file input during streaming
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default PRDChat;

// Helper function to sort sections by numerical prefix
const sortSectionsByNumericalPrefix = (sections: PRDSection[]): PRDSection[] => {
  return [...sections].sort((a, b) => {
    // Extract numerical prefixes if they exist (e.g., "1. Executive Summary")
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