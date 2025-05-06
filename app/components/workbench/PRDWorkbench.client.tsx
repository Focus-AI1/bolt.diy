import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { motion, type Variants, AnimatePresence } from 'framer-motion';
import { useStore } from '@nanostores/react';
import { workbenchStore } from '~/lib/stores/workbench';
import { streamingState } from '~/lib/stores/streaming';
import { classNames } from '~/utils/classNames';
import { cubicEasingFn } from '~/utils/easings';
import { IconButton } from '~/components/ui/IconButton';
import { createScopedLogger } from '~/utils/logger';
import { toast } from 'react-toastify';
import { useChatHistory, chatType } from '~/lib/persistence/useChatHistory';
import PRDTipTapEditor, { EditorToolbar, Editor } from '~/components/ui/PRD/PRDTipTapEditor';
import PRDLoadingAnimation from '~/components/ui/PRD/PRDLoadingAnimation';
import {
    type PRDDocument,
    type PRDSection,
    cleanStreamingContent,
    parseEditablePRDMarkdown,
    generateFullMarkdown,
    parseHtmlToPrd,
    cleanHtml
} from '~/components/ui/PRD/prdUtils';

// Extend the PRDDocument type to include _source
interface ExtendedPRDDocument extends PRDDocument {
    _source?: string;
}

const logger = createScopedLogger('PRDWorkbench');

// Animation variants for the workbench panel
const workbenchVariants = {
  closed: {
    width: 0,
    transition: {
      duration: 0.2,
      ease: cubicEasingFn,
    },
  },
  open: {
    width: 'var(--workbench-width)',
    transition: {
      duration: 0.2,
      ease: cubicEasingFn,
    },
  },
} satisfies Variants;

// PRD Workbench component that displays the PRD document
const PRDWorkbench = () => {
  const showWorkbench = useStore(workbenchStore.showWorkbench);
  const streamingMarkdownContent = useStore(workbenchStore.streamingPRDContent);
  const isStreaming = useStore(streamingState);

  const [prdDocument, setPrdDocument] = useState<ExtendedPRDDocument | null>(null);
  const [editorContent, setEditorContent] = useState<string>('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1.2);
  const [isManuallyEdited, setIsManuallyEdited] = useState(false);
  const [editMode, setEditMode] = useState(true); // Default to edit mode
  const contentRef = useRef<HTMLDivElement>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const [editorInstance, setEditorInstance] = useState<Editor | null>(null);
  const [showEditorToolbar, setShowEditorToolbar] = useState(false);
  const initialMountRef = useRef(false);

  // Define loadPrdFromStorage - This handles loading from sessionStorage
  const loadPrdFromStorage = useCallback((ignoreIfManuallyEdited = true) => {
      try {
        const storedPRD = sessionStorage.getItem('current_prd');

        if (!storedPRD) {
          // If storage is empty, clear state only if not manually edited or forced
          if (prdDocument !== null && (!isManuallyEdited || !ignoreIfManuallyEdited)) {
            logger.debug('sessionStorage empty or explicitly cleared, clearing PRD state.');
            setPrdDocument(null);
            setEditorContent(''); // Clear editor
            setHasUnsavedChanges(false);
            setIsManuallyEdited(false);
          }
          return;
        }

        const parsedPRD: ExtendedPRDDocument = JSON.parse(storedPRD);
        const isChatUpdate = parsedPRD._source === "chat_update";

        // If manually edited with unsaved changes, only update if it's from chat or forced
        if (ignoreIfManuallyEdited && isManuallyEdited && hasUnsavedChanges && !isChatUpdate) {
          logger.debug('Skipping PRD reload from storage due to unsaved manual edits');
          return;
        }

        // Basic validation
        if (parsedPRD && typeof parsedPRD.title === 'string' && Array.isArray(parsedPRD.sections)) {
           // Remove the _source attribute before setting the document state
           const { _source, ...prdWithoutSource } = parsedPRD;
           const newMarkdown = generateFullMarkdown(prdWithoutSource);

           // Only update state if the content is different
           // Compare generated markdown to prevent unnecessary updates if structure is same
           if (newMarkdown !== editorContent || JSON.stringify(prdDocument) !== JSON.stringify(prdWithoutSource)) {
               logger.debug('PRD updated from sessionStorage:', parsedPRD.title);
               setPrdDocument(prdWithoutSource);
               setEditorContent(newMarkdown); // Update editor content from parsed structure

               // Reset edit flags only if this update originated from the chat or forced reload
               if (isChatUpdate || !ignoreIfManuallyEdited) {
                 setHasUnsavedChanges(false);
                 setIsManuallyEdited(false);
               }
           }
        } else {
          logger.warn('Invalid PRD structure in sessionStorage, removing.');
          sessionStorage.removeItem('current_prd');
          if (prdDocument !== null) {
            logger.debug('Clearing PRD state due to invalid structure.');
            setPrdDocument(null);
            setEditorContent('');
            setHasUnsavedChanges(false);
            setIsManuallyEdited(false);
          }
        }
      } catch (error) {
        logger.error('Error loading PRD from sessionStorage:', error);
        sessionStorage.removeItem('current_prd');
        setPrdDocument(null);
        setEditorContent('');
        setHasUnsavedChanges(false);
        setIsManuallyEdited(false);
      }
  }, [prdDocument, isManuallyEdited, hasUnsavedChanges, editorContent]); // Added editorContent dependency

  // --- Effects ---

  // Load PRD from sessionStorage initially and when workbench becomes visible
  useEffect(() => {
    if (showWorkbench) {
      chatType.set('prd');
      logger.debug('Workbench visible: Chat type set to PRD, loading initial PRD.');
      // Don't ignore manual edits on initial load/show
      loadPrdFromStorage(false);
    }
  }, [showWorkbench, loadPrdFromStorage]);

  // Listen for external storage changes (e.g., manual save, other tabs)
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
        if (event.key === 'current_prd' && event.storageArea === sessionStorage) {
            // If a chat stream is active, we primarily rely on the streamingMarkdownContent effect.
            // We might ignore storage events marked as 'chat_update' here to prevent double updates,
            // as the streaming effect will handle the final content update from the store.
            // However, let's allow it for now but ensure loadPrdFromStorage checks content difference.
            const isChatUpdate = event.newValue && event.newValue.includes('"_source":"chat_update"');

            // Always process storage updates from chat, as they contain the authoritative full document
            if (isChatUpdate) {
                logger.debug('Chat update detected in storage - reloading PRD.');
                loadPrdFromStorage(false); // Force reload chat updates, ignoring manual edits
                return;
            }

            // For non-chat updates, respect manual edits
            logger.debug('sessionStorage changed externally, reloading PRD for workbench.');
            loadPrdFromStorage(true);
        }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => {
        window.removeEventListener('storage', handleStorageChange);
    };
  }, [loadPrdFromStorage]);

  // Simplified effect to handle streaming markdown content updates
  useEffect(() => {
    // Only process if streaming content exists
    if (streamingMarkdownContent !== null) {
        // If user has manually edited, preserve their changes during the stream
        if (isManuallyEdited && hasUnsavedChanges) {
            logger.debug('Manual edits detected, preserving user changes during stream.');
            return;
        }

        // Reset manual edit flags when processing new streaming content
        if (isManuallyEdited || hasUnsavedChanges) {
            setIsManuallyEdited(false);
            setHasUnsavedChanges(false);
        }

        // Clean the incoming markdown - this now removes all placeholder text
        const cleanedMarkdown = cleanStreamingContent(streamingMarkdownContent);
        
        // Verify if the streaming markdown is a complete PRD or just a section
        const hasMultipleSections = /^##\s+.+$/gm.test(cleanedMarkdown);
        const hasTitle = /^#\s+.+$/m.test(cleanedMarkdown);
        
        if (hasTitle && hasMultipleSections) {
            // This is likely a complete PRD, update as usual
            logger.debug('Received complete PRD content in stream - updating editor');
            setEditorContent(cleanedMarkdown);
            
            // Also update the document state to ensure consistency
            try {
                const parsedDoc = parseEditablePRDMarkdown(cleanedMarkdown, null);
                if (parsedDoc) {
                    setPrdDocument(parsedDoc);
                }
            } catch (error) {
                logger.error("Error parsing complete PRD:", error);
            }
        } else {
            // This might be just a section update - attempt to merge with existing content
            logger.debug('Received partial PRD content - attempting to merge with existing');
            try {
                // Get any existing PRD to merge with
                let existingPRD: PRDDocument | null = prdDocument;
                
                if (!existingPRD) {
                    // Try loading from storage if we don't have one in state
                    const storedPRD = sessionStorage.getItem('current_prd');
                    if (storedPRD) {
                        existingPRD = JSON.parse(storedPRD);
                    }
                }
                
                if (existingPRD) {
                    // Parse the cleaned markdown, merging with the existing PRD
                    const parsedDoc = parseEditablePRDMarkdown(cleanedMarkdown, existingPRD);
                    if (parsedDoc) {
                        // Generate full markdown with the merged content - this will remove any placeholders
                        const fullMarkdown = generateFullMarkdown(parsedDoc);
                        setEditorContent(fullMarkdown);
                        setPrdDocument(parsedDoc);
                        
                        // CRITICAL: Save the merged document to storage to ensure persistence
                        // This prevents the content from reverting when streaming ends
                        const docToSave = {...parsedDoc};
                        sessionStorage.setItem('current_prd', JSON.stringify(docToSave));
                    } else {
                        // Fallback to just showing the cleaned markdown
                        setEditorContent(cleanedMarkdown);
                    }
                } else {
                    // No existing PRD to merge with, just show the content
                    setEditorContent(cleanedMarkdown);
                }
            } catch (error) {
                logger.error("Error processing streaming content:", error);
                // Fallback to the cleaned content
                setEditorContent(cleanedMarkdown);
            }
        }
    }
    // When streamingMarkdownContent becomes null (stream ended),
    // we need to ensure the prdDocument state reflects the final content.
    else if (streamingMarkdownContent === null && editorContent && isStreaming === false) {
        // This condition triggers after the stream ends and the store is cleared.
        logger.debug('Stream ended, ensuring document state matches editor content');
        
        // First check if there's a recent update in storage
        try {
            const storedPRD = sessionStorage.getItem('current_prd');
            if (storedPRD) {
                const parsedStoredPRD = JSON.parse(storedPRD);
                if (parsedStoredPRD._source === "chat_update") {
                    // This is a fresh update from chat, prioritize it
                    logger.debug('Found recent chat update in storage, using that as source of truth');
                    const { _source, ...prdWithoutSource } = parsedStoredPRD;
                    setPrdDocument(prdWithoutSource);
                    
                    // Update editor content to match the stored document - this will remove any placeholders
                    const fullMarkdown = generateFullMarkdown(prdWithoutSource);
                    if (fullMarkdown !== editorContent) {
                        setEditorContent(fullMarkdown);
                    }
                    return;
                }
            }
        } catch (error) {
            logger.error("Error checking storage for updates:", error);
        }
        
        // If no recent chat update in storage, parse the current editor content
        try {
            // Make sure we remove any placeholder text that might have been preserved
            const cleanedEditorContent = cleanStreamingContent(editorContent);
            const finalParsedDoc = parseEditablePRDMarkdown(cleanedEditorContent, prdDocument);
            
            if (finalParsedDoc && JSON.stringify(finalParsedDoc) !== JSON.stringify(prdDocument)) {
                logger.debug('Updating final prdDocument state from editor content after stream.');
                setPrdDocument(finalParsedDoc);
                
                // Generate clean markdown without placeholders
                const cleanMarkdown = generateFullMarkdown(finalParsedDoc);
                if (cleanMarkdown !== editorContent) {
                    setEditorContent(cleanMarkdown);
                }
                
                // Save this to storage as well to ensure persistence
                sessionStorage.setItem('current_prd', JSON.stringify(finalParsedDoc));
            }
        } catch (error) {
            logger.error("Error parsing final editor content into PRDDocument:", error);
        }
    }

  }, [streamingMarkdownContent, prdDocument, isManuallyEdited, hasUnsavedChanges, isStreaming, editorContent]);

  // Effect to handle streaming state changes
  useEffect(() => {
    if (isStreaming) {
      // When streaming starts, hide the toolbar
      setShowEditorToolbar(false);
      
      // Update editor instance read-only state if it exists
      if (editorInstance) {
        editorInstance.setEditable(false);
      }
      
      logger.debug('Streaming started, disabling edit mode');
    } else {
      // When streaming ends, show the toolbar with a slight delay for smooth transition
      const timer = setTimeout(() => {
        setShowEditorToolbar(true);
      }, 300);
      
      // Update editor instance read-only state if it exists
      if (editorInstance) {
        editorInstance.setEditable(true);
      }
      
      logger.debug('Streaming ended, enabling edit mode');
      
      return () => clearTimeout(timer);
    }
  }, [isStreaming, editorInstance]);

  // Effect to handle streaming content updates
  useEffect(() => {
    if (streamingMarkdownContent && isStreaming) {
      // Clean the streaming content
      const cleanedContent = cleanStreamingContent(streamingMarkdownContent);
      if (cleanedContent) {
        setEditorContent(cleanedContent);
      }
    }
  }, [streamingMarkdownContent, isStreaming]);

  // Effect to handle initial mount
  useEffect(() => {
    if (!initialMountRef.current && !isStreaming) {
      initialMountRef.current = true;
      // Slight delay to ensure smooth initial appearance
      const timer = setTimeout(() => {
        setShowEditorToolbar(true);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isStreaming]);

  // --- Save/Export Callbacks ( Largely unchanged, but use editorContent/prdDocument state carefully ) ---

  const saveFullPrd = useCallback(() => {
    if (!editorInstance) { // Check editorInstance first
      logger.warn('Save attempt failed: Editor not ready.');
      toast.error('Cannot save PRD: Editor not ready.');
      return;
    }
     // Use current editor content as the source of truth for saving
     const currentHtml = editorInstance.getHTML();
     const cleaned = cleanHtml(currentHtml);

     // Parse the *current* HTML into a PRD structure.
     // Pass the *latest* prdDocument state as the base for merging metadata or unparsed sections.
     const baseDocForParsing = prdDocument; // Use state as base
     let updatedPrd = parseHtmlToPrd(cleaned, baseDocForParsing);

    if (!updatedPrd) {
        logger.error('Save attempt failed: Could not parse HTML to PRD.');
        toast.error('Error saving PRD: Could not parse content.');
        return;
    }

    try {
       // Optional: Preserve sections logic (if needed, ensure it uses baseDocForParsing correctly)
       if (baseDocForParsing) {
           const currentTitles = new Set(updatedPrd.sections.map(s => s.title.toLowerCase()));
           baseDocForParsing.sections.forEach(originalSection => {
               if (!currentTitles.has(originalSection.title.toLowerCase()) && originalSection.content?.trim()) {
                   logger.info(`Preserving section not re-parsed from HTML: ${originalSection.title}`);
                   updatedPrd.sections.push(originalSection);
               }
           });
       }

      updatedPrd.lastUpdated = new Date().toISOString();

      // Save the final structure to sessionStorage
      sessionStorage.setItem('current_prd', JSON.stringify(updatedPrd));

      // Update internal state to reflect the saved document
      setPrdDocument(updatedPrd);
      // Re-generate markdown from the *saved* structure to ensure consistency
      const newMarkdown = generateFullMarkdown(updatedPrd);
      setEditorContent(newMarkdown); // Update editor content to match saved state

      setHasUnsavedChanges(false); // Reset unsaved changes flag
      setIsManuallyEdited(false); // Reset manual edit flag after saving

      logger.debug('PRD saved successfully');
      toast.success('PRD saved successfully');
    } catch (error) {
      logger.error('Error saving PRD:', error);
      toast.error('Error saving PRD. Please try again.');
    }
  }, [editorInstance, prdDocument]); // Keep dependencies

  // Handler for editor content changes (Receives Markdown from TipTap)
  const handleEditorChange = useCallback((newMarkdownContent: string) => {
    // If a chat stream is active, ignore manual edits to prevent conflicts
    if (isStreaming) return;

    setEditorContent(newMarkdownContent); // Update the editor's content state

    // Determine if change is from user vs. programmatically
    // Compare with markdown generated from the *current* PRD document state.
    // Or simpler: if !isStreaming, any change is manual.
    const isDifferentFromState = !prdDocument || newMarkdownContent !== generateFullMarkdown(prdDocument);

    if (isDifferentFromState) {
      setHasUnsavedChanges(true);
      // Mark as manually edited only if the change is significant and not during loading
      if (!isStreaming) { // Check against global loading state
          setIsManuallyEdited(true);
      }
    }
  }, [prdDocument, isStreaming]); // Added isStreaming dependency

  // Export logic (use current editorContent)
  const exportMarkdown = useCallback(() => {
    if (!prdDocument && !editorContent) { toast.error("No PRD loaded or content available."); return; }
    const titleForFilename = prdDocument?.title || 'prd';
    const blob = new Blob([editorContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${titleForFilename.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [prdDocument, editorContent]); // Depends on latest content

  const exportHtml = useCallback(() => {
    if (!editorInstance) { toast.error("Editor not ready for export."); return; }
    if (!prdDocument && !editorContent) { toast.error("No PRD loaded or content available."); return; }

    const editorHtml = editorInstance.getHTML();
    const cleanedContent = cleanHtml(editorHtml);
    const title = prdDocument?.title || 'PRD';
    const lastUpdated = prdDocument?.lastUpdated ? new Date(prdDocument.lastUpdated).toLocaleString() : 'N/A';

    const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
 <meta charset="UTF-8">
 <meta name="viewport" content="width=device-width, initial-scale=1.0">
 <title>${title}</title>
 <style> body { font-family: sans-serif; line-height: 1.6; max-width: 800px; margin: 20px auto; padding: 15px; } h1, h2 { border-bottom: 1px solid #eee; padding-bottom: 5px; } /* Add more basic styles if needed */ </style>
</head>
<body>
 ${cleanedContent}
 <hr>
 <p style="font-size: 0.8em; color: #777;">Last updated: ${lastUpdated}</p>
</body>
</html>`;
    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [prdDocument, editorInstance, editorContent]); // Depends on latest content

  // --- Render ---

  if (!showWorkbench) return null;

  // Determine if we should show the editor or the loading/placeholder state
  // Show editor if there's content, or if PRD document exists (even if content is empty initially),
  // or if chat is actively loading (we expect content soon).
  const shouldShowEditor = editorContent || prdDocument !== null || isStreaming;

  return (
    <motion.div
      className="h-full border-l border-bolt-elements-borderColor flex-shrink-0 bg-bolt-elements-background-depth-0 overflow-hidden z-workbench"
      variants={workbenchVariants}
      initial="closed"
      animate={showWorkbench ? 'open' : 'closed'}
      style={{
        position: 'fixed',
        right: 0,
        top: 'var(--header-height)',
        bottom: 0,
        height: 'calc(100vh - var(--header-height))',
        width: 'var(--workbench-width)',
      }}
    >
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-3 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 flex-shrink-0">
          <div className="flex items-center">
            <h2 className="text-lg font-semibold text-bolt-elements-textPrimary ml-2">
              PRD Workbench
            </h2>
            {hasUnsavedChanges && (
              <span className="ml-2 text-xs text-bolt-elements-textTertiary">(Unsaved changes)</span>
            )}
          </div>
          {/* Controls */}
          <div className="flex items-center space-x-1">
            {/* Zoom */}
            <div className="flex items-center mr-2">
               <IconButton title="Zoom out" onClick={() => setZoomLevel(Math.max(0.5, zoomLevel - 0.1))} className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary">
                <div className="i-ph:minus-circle w-5 h-5" />
              </IconButton>
               <span className="mx-2 text-sm text-bolt-elements-textSecondary">{Math.round(zoomLevel * 100)}%</span>
               <IconButton title="Zoom in" onClick={() => setZoomLevel(Math.min(2, zoomLevel + 0.1))} className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary">
                <div className="i-ph:plus-circle w-5 h-5" />
              </IconButton>
            </div>
            {/* Save */}
            <IconButton
              title="Save PRD"
              onClick={saveFullPrd}
              disabled={!hasUnsavedChanges || !editorInstance} // Disable if no changes or editor not ready
              className={classNames(
                "text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary",
                (!hasUnsavedChanges || !editorInstance) ? "opacity-50 cursor-not-allowed" : ""
              )}
            >
              <div className="i-ph:floppy-disk w-5 h-5" />
            </IconButton>
            {/* Export MD */}
            <IconButton title="Export as Markdown" onClick={exportMarkdown} disabled={!editorContent && !prdDocument} className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary disabled:opacity-50">
              <div className="i-ph:file-markdown w-5 h-5" />
            </IconButton>
            {/* Export HTML */}
            <IconButton title="Export as HTML" onClick={exportHtml} disabled={(!editorContent && !prdDocument) || !editorInstance} className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary disabled:opacity-50">
              <div className="i-ph:file-html w-5 h-5" />
            </IconButton>
            {/* Close */}
            <IconButton title="Close PRD Workbench" onClick={() => workbenchStore.showWorkbench.set(false)} className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary ml-2">
              <div className="i-ph:x w-5 h-5" />
            </IconButton>
          </div>
        </div>

        {/* Editor Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
           {/* Toolbar: Show if editor instance exists and not streaming */}
           <AnimatePresence>
             {editorInstance && showEditorToolbar && !isStreaming && (
               <motion.div 
                 initial={{ opacity: 0 }}
                 animate={{ opacity: 1 }}
                 exit={{ opacity: 0 }}
                 transition={{ duration: 0.15 }}
                 className="w-full bg-white dark:bg-gray-900 border-b border-bolt-elements-borderColor shadow-sm flex-shrink-0"
               >
                 <EditorToolbar editor={editorInstance} readOnly={isStreaming} />
               </motion.div>
             )}
           </AnimatePresence>
          
           {/* Editor Content Area */}
           <div ref={contentRef} className="flex-1 overflow-auto bg-bolt-elements-background-depth-2 p-4 md:p-6">
             {/* Use simpler condition: show editor if content/doc exists OR chat is loading */}
             {shouldShowEditor ? (
              <div className="w-full max-w-4xl mx-auto">
                <div
                  ref={editorContainerRef}
                  className={classNames(
                    "bg-white dark:bg-gray-900 rounded shadow-lg transition-all w-full mb-6",
                    isStreaming ? "opacity-90" : ""
                  )}
                   style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'top center', minHeight: 'calc(100% - 2rem)' }}
                >
                  {/* Streaming indicator */}
                  {isStreaming && (
                    <div className="w-full bg-bolt-elements-background-depth-1 border-b border-bolt-elements-borderColor px-4 py-2 flex items-center text-bolt-elements-textSecondary">
                      <div className="animate-pulse mr-2 w-2 h-2 rounded-full bg-bolt-elements-textSecondary"></div>
                      <span className="text-sm font-medium">Generating PRD content...</span>
                    </div>
                  )}
                  <PRDTipTapEditor
                    content={editorContent}
                    onChange={handleEditorChange}
                    readOnly={isStreaming}
                    className="w-full flex flex-col"
                    placeholder={isStreaming ? "Generating PRD..." : "Start writing your PRD..."}
                    onEditorReady={setEditorInstance}
                  />
                </div>
              </div>
            ) : (
              // Show placeholder only if no content/doc AND not loading
              <PRDLoadingAnimation message="No PRD Loaded. Ask the assistant to create one." />
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default PRDWorkbench;