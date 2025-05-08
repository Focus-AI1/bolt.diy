import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { motion, type Variants, AnimatePresence } from 'framer-motion';
import { useStore } from '@nanostores/react';
import { workbenchStore } from '~/lib/stores/workbench';
import { prdEditorStore, registerManualEdit, saveEditorContent, updateContentProgrammatically, releaseUserEditLock, resetEditorState, initializeEditor, prdStreamingState } from '~/lib/stores/prdEditor';
import { classNames } from '~/utils/classNames';
import { cubicEasingFn } from '~/utils/easings';
import { IconButton } from '~/components/ui/IconButton';
import { createScopedLogger } from '~/utils/logger';
import { toast } from 'react-toastify';
import { useChatHistory, chatType } from '~/lib/persistence/useChatHistory';
import PRDTipTapEditor, { Editor, EditorToolbar } from '~/components/ui/PRD/PRDTipTapEditor';
import toolbarStyles from '~/components/ui/PRD/PRDToolbar.module.scss';
import {
    type PRDDocument,
    type PRDSection,
    cleanStreamingContent,
    parseEditablePRDMarkdown,
    generateFullMarkdown,
    parseHtmlToPrd,
    cleanHtml,
    cleanMarkdownFromTemplateLeakage
} from '~/components/ui/PRD/prdUtils';
import PRDStreamingIndicator from '../ui/PRD/PRDStreamingIndicator';

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
  const isStreaming = useStore(prdStreamingState);
  
  // Use the prdEditorStore for state management
  const editorState = useStore(prdEditorStore);

  const [prdDocument, setPrdDocument] = useState<ExtendedPRDDocument | null>(null);
  const [editorContent, setEditorContent] = useState<string>('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [editMode, setEditMode] = useState(true); // Default to edit mode
  const [viewMode, setViewMode] = useState<'standard' | 'paper'>('standard'); // Add view mode state
  const contentRef = useRef<HTMLDivElement>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const [editorInstance, setEditorInstance] = useState<Editor | null>(null);
  const initialMountRef = useRef(false);
  const domEventsAttachedRef = useRef(false);

  /**
   * CRITICAL FUNCTION: Loads PRD content from sessionStorage with safeguards to prevent content reversion.
   * 
   * This function is responsible for handling storage events and determining when to reload
   * content from storage vs. when to preserve the current editor state. It includes several
   * critical safeguards to prevent content loss during streaming updates.
   * 
   * @param ignoreIfManuallyEdited - If true, won't reload if there are unsaved manual edits
   */
  const loadPrdFromStorage = useCallback((ignoreIfManuallyEdited = true) => {
      try {
        // CRITICAL SAFEGUARD #1: Check for the prevent_reload flag
        // This flag is set by PRDChat.client.tsx during streaming updates to prevent content reversion
        // When this flag is present, we MUST NOT reload from storage as it would overwrite recent changes
        const preventReload = sessionStorage.getItem('prd_prevent_reload');
        if (preventReload === 'true') {
          logger.debug('Skipping PRD reload from storage due to prevent_reload flag');
          return;
        }

        const storedPRD = sessionStorage.getItem('current_prd');

        // Handle case where storage is empty
        if (!storedPRD) {
          // SAFEGUARD #2: Only clear state if not manually edited or if forced
          // This prevents accidental clearing of unsaved changes
          if (prdDocument !== null && (!editorState.isManuallyEdited || !ignoreIfManuallyEdited)) {
            logger.debug('sessionStorage empty or explicitly cleared, clearing PRD state.');
            setPrdDocument(null);
            setEditorContent(''); // Clear editor
            resetEditorState(); // Reset editor state
          }
          return;
        }

        const parsedPRD: ExtendedPRDDocument = JSON.parse(storedPRD);
        const isChatUpdate = parsedPRD._source === "chat_update";

        // CRITICAL SAFEGUARD #3: Protect unsaved manual edits
        // If the user has made manual edits with unsaved changes, we should not overwrite them
        // UNLESS the update is coming from chat (which means it should include those edits)
        if (ignoreIfManuallyEdited && editorState.isManuallyEdited && editorState.hasUnsavedChanges && !isChatUpdate) {
          logger.debug('Skipping PRD reload from storage due to unsaved manual edits');
          return;
        }
        
        // SAFEGUARD #4: Don't reload if we just saved
        // This prevents the brief flicker when saving
        if (ignoreIfManuallyEdited && editorState.isManuallyEdited && !editorState.hasUnsavedChanges) {
          logger.debug('Skipping PRD reload from storage after save');
          return;
        }

        // Basic validation
        if (parsedPRD && typeof parsedPRD.title === 'string' && Array.isArray(parsedPRD.sections)) {
           // Remove the _source attribute before setting the document state
           const { _source, ...prdWithoutSource } = parsedPRD;
           const newMarkdown = generateFullMarkdown(prdWithoutSource);
           
           // Update the editor state using the store
           if (updateContentProgrammatically(newMarkdown)) {
             setPrdDocument(prdWithoutSource);
             setEditorContent(newMarkdown);
           } else {
             logger.debug('Programmatic update blocked due to user edit lock');
           }
        }
      } catch (error) {
        logger.error('Error loading PRD from storage:', error);
      }
  }, [prdDocument, editorState.isManuallyEdited, editorState.hasUnsavedChanges]);

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

  // Handle editor change with debounce
  const handleEditorChange = useCallback((content: string) => {
    if (isStreaming) return; // Don't process changes during streaming
    
    // Clean the content to remove any template string leakage
    const cleanedContent = cleanMarkdownFromTemplateLeakage(content);
    
    // Update the editor content in React state
    setEditorContent(cleanedContent);
    
    // Register the edit in the store
    registerManualEdit(cleanedContent);
  }, [isStreaming]);

  // Attach DOM-level event listeners to the editor for reliable edit detection
  const attachDomEventListeners = useCallback(() => {
    if (!editorInstance || domEventsAttachedRef.current) return;
    
    const editorDom = editorInstance.view.dom;
    
    // Use input event for immediate detection of changes
    editorDom.addEventListener('input', () => {
      if (isStreaming) return;
      
      // Get the current HTML content directly from the editor
      const currentContent = editorInstance.getHTML();
      
      // Register the manual edit
      registerManualEdit(currentContent);
    });
    
    // Use keyup event as a fallback
    editorDom.addEventListener('keyup', () => {
      if (isStreaming) return;
      
      // Get the current HTML content directly from the editor
      const currentContent = editorInstance.getHTML();
      
      // Register the manual edit
      registerManualEdit(currentContent);
    });
    
    // Mark as attached
    domEventsAttachedRef.current = true;
    logger.debug('DOM event listeners attached to editor');
  }, [editorInstance, isStreaming]);

  // Effect to attach DOM event listeners when editor is ready
  useEffect(() => {
    if (editorInstance && !domEventsAttachedRef.current) {
      attachDomEventListeners();
    }
  }, [editorInstance, attachDomEventListeners]);

  // Save the full PRD document
  const saveFullPrd = useCallback(() => {
    if (!editorInstance) return;
    
    try {
      // Get the current HTML content directly from the editor
      const currentContent = editorInstance.getHTML();
      
      // Clean the content to remove any template string leakage
      const cleanedHtml = cleanHtml(currentContent);
      
      // Parse the HTML back to PRD structure
      const updatedPrd = parseHtmlToPrd(cleanedHtml, prdDocument || {
        title: 'New PRD',
        description: '',
        sections: [],
        lastUpdated: new Date().toISOString()
      });
      
      // Update the lastUpdated timestamp
      updatedPrd.lastUpdated = new Date().toISOString();
      
      // First, update the document state in React
      setPrdDocument(updatedPrd);
      
      // Save the content in the editor store BEFORE updating session storage
      // This ensures the editor state is updated before any potential reloads
      saveEditorContent();
      
      // Save to session storage
      sessionStorage.setItem('current_prd', JSON.stringify(updatedPrd));
      
      // Update the workbench store timestamp
      workbenchStore.updatePRD();
      
      toast.success('PRD saved successfully');
    } catch (error) {
      logger.error('Error saving PRD:', error);
      toast.error('Failed to save PRD');
    }
  }, [editorInstance, prdDocument]);

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

  // Effect to handle streaming state changes
  useEffect(() => {
    if (isStreaming) {
      // Update editor instance read-only state if it exists
      if (editorInstance) {
        editorInstance.setEditable(false);
      }
      
      logger.debug('Streaming started, disabling edit mode');
    } else {
      // Update editor instance read-only state if it exists
      if (editorInstance) {
        editorInstance.setEditable(true);
      }
      
      logger.debug('Streaming ended, enabling edit mode');
    }
  }, [isStreaming, editorInstance]);

  // Effect to handle streaming content updates
  useEffect(() => {
    if (streamingMarkdownContent) {
      try {
        const cleanedContent = cleanStreamingContent(streamingMarkdownContent);
        
        // Clean the content to remove any template string leakage
        const sanitizedContent = cleanMarkdownFromTemplateLeakage(cleanedContent);
        
        // Only update if we have meaningful content
        if (sanitizedContent.trim()) {
          // Update the editor content
          setEditorContent(sanitizedContent);
          
          // Don't register as a manual edit, but update the original content
          if (updateContentProgrammatically(sanitizedContent)) {
            // Parse the markdown to PRD structure
            const updatedPrd = parseEditablePRDMarkdown(sanitizedContent, prdDocument);
            if (updatedPrd) {
              // Add source marker to identify this as a chat update
              const prdWithSource: ExtendedPRDDocument = {
                ...updatedPrd,
                _source: 'chat_update'
              };
              
              // Save to session storage
              sessionStorage.setItem('current_prd', JSON.stringify(prdWithSource));
              
              // Update the document state
              setPrdDocument(updatedPrd);
            }
          } else {
            logger.debug('Streaming update blocked due to user edit lock');
          }
        }
      } catch (error) {
        logger.error('Error processing streaming content:', error);
      }
    }
  }, [streamingMarkdownContent, prdDocument]);

  // Effect to handle initial mount and sync with persisted editor state
  useEffect(() => {
    // Check if we have persisted editor state with content
    const editorState = prdEditorStore.get();
    
    if (editorState.currentContent) {
      logger.debug('Found persisted editor state with content, restoring');
      
      // Set the editor content from the persisted state
      setEditorContent(editorState.currentContent);
      
      // If we don't have a document yet, try to parse one from the content
      if (!prdDocument && editorState.currentContent) {
        try {
          const parsedDoc = parseEditablePRDMarkdown(editorState.currentContent, null);
          if (parsedDoc) {
            setPrdDocument(parsedDoc);
            logger.debug('Restored PRD document from persisted editor content');
          }
        } catch (error) {
          logger.error('Error parsing persisted editor content:', error);
        }
      }
    } else {
      // If no persisted state, load from storage
      loadPrdFromStorage(false);
    }
    
    // Clean up function to ensure editor state is saved when component unmounts
    return () => {
      // If we have unsaved changes, make sure they're persisted
      const currentState = prdEditorStore.get();
      if (currentState.hasUnsavedChanges && editorInstance) {
        // Get the latest content directly from the editor
        const latestContent = editorInstance.getHTML();
        prdEditorStore.setKey('currentContent', latestContent);
        logger.debug('Saved latest editor content to store on unmount');
      }
    };
  }, []);

  // Effect to initialize the editor when it's ready
  useEffect(() => {
    if (editorInstance && !initialMountRef.current) {
      // If we have persisted content, use that
      const state = prdEditorStore.get();
      
      if (state.currentContent) {
        // Editor already has content from the persisted state
        logger.debug('Editor initialized with persisted content');
      } else if (editorContent) {
        // Initialize with current content from React state
        initializeEditor(editorContent);
        logger.debug('Editor initialized with current content');
      }
      
      initialMountRef.current = true;
      
      // Attach DOM event listeners
      attachDomEventListeners();
    }
  }, [editorInstance, editorContent, attachDomEventListeners]);

  // Handle storage events (for cross-tab sync)
  const handleStorageChange = useCallback((event: StorageEvent) => {
    if (event.key === 'current_prd' && event.storageArea === sessionStorage) {
      // Check if reload is prevented (set by PRDChat during updates)
      const preventReload = sessionStorage.getItem('prd_prevent_reload') === 'true';
      if (preventReload) {
        logger.debug('Storage change detected but reload prevented by flag');
        return;
      }
      
      // If a chat stream is active, we primarily rely on the streamingMarkdownContent effect.
      // We might ignore storage events marked as 'chat_update' here to prevent double updates,
      // as the streaming effect will handle the final content update from the store.
      const isChatUpdate = event.newValue && event.newValue.includes('"_source":"chat_update"');
      const isForceReload = event.newValue && event.newValue.includes('"_forceReload":true');

      // Always process storage updates from chat, as they contain the authoritative full document
      if (isChatUpdate || isForceReload) {
        logger.debug('Chat update or force reload detected in storage - reloading PRD.');
        loadPrdFromStorage(false); // Force reload chat updates, ignoring manual edits
        return;
      }

      // For non-chat updates, respect manual edits
      logger.debug('sessionStorage changed externally, reloading PRD for workbench.');
      loadPrdFromStorage(true);
    }
  }, [loadPrdFromStorage]);

  useEffect(() => {
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [handleStorageChange]);

  // Load PRD from storage on initial mount
  useEffect(() => {
    loadPrdFromStorage(false); // Force load on initial mount
  }, [loadPrdFromStorage]);

  // Compute if we should show the editor
  const shouldShowEditor = useMemo(() => {
    return !!editorContent || !!prdDocument || isStreaming;
  }, [editorContent, prdDocument, isStreaming]);

  // Add component for document statistics and cursor position with modern design
  const DocumentStatistics = ({ editor }: { editor: Editor | null }) => {
    const [stats, setStats] = useState({ words: 0, chars: 0, lines: 0 });
    const [cursorPosition, setCursorPosition] = useState({ line: 1, col: 1 });
    
    const calculateStats = () => {
      if (!editor) return { words: 0, chars: 0, lines: 0 };
      
      const text = editor.getText();
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      const chars = text.length;
      const lines = (text.match(/\n/g) || []).length + 1;
      
      return { words, chars, lines };
    };
    
    // Calculate cursor position (line and column)
    const calculateCursorPosition = () => {
      if (!editor) return { line: 1, col: 1 };
      
      const { from } = editor.state.selection;
      const text = editor.getText();
      
      // Calculate line number
      const textBefore = text.slice(0, from);
      const line = (textBefore.match(/\n/g) || []).length + 1;
      
      // Calculate column (accounting for tab characters)
      const lastNewline = textBefore.lastIndexOf('\n');
      const lineText = lastNewline >= 0 ? textBefore.slice(lastNewline + 1) : textBefore;
      const col = lineText.length + 1;
      
      return { line, col };
    };
    
    useEffect(() => {
      // Update on content change
      const updateHandler = () => {
        setStats(calculateStats());
      };
      
      // Update on selection change
      const selectionHandler = () => {
        setCursorPosition(calculateCursorPosition());
      };
      
      if (editor) {
        editor.on('update', updateHandler);
        editor.on('selectionUpdate', selectionHandler);
        
        // Initial calculation
        updateHandler();
        selectionHandler();
      }
      
      return () => {
        if (editor) {
          editor.off('update', updateHandler);
          editor.off('selectionUpdate', selectionHandler);
        }
      };
    }, [editor]);
    
    if (!editor) return null;
    
    return (
      <div className="flex items-center h-10 px-5 border-t border-b border-bolt-elements-borderColor text-sm text-bolt-elements-textSecondary font-mono bg-bolt-elements-background-depth-1">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-1.5" title="Word count">
            <div className="i-ph:text-aa text-base opacity-70" />
            <span>{stats.words} words</span>
          </div>
          <div className="flex items-center gap-1.5" title="Character count">
            <div className="i-ph:textbox text-base opacity-70" />
            <span>{stats.chars} chars</span>
          </div>
          <div className="flex items-center gap-1.5" title="Line count">
            <div className="i-ph:list-numbers text-base opacity-70" />
            <span>{stats.lines} lines</span>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded bg-bolt-elements-background-depth-2" title="Cursor position">
            <div className="i-ph:caret text-base opacity-70" />
            <span>Ln {cursorPosition.line}, Col {cursorPosition.col}</span>
        </div>
      </div>
    );
  };

  // --- Render ---

  if (!showWorkbench) return null;

  return (
    // Consistent styling with TicketWorkbench
    // Do not change this parent div styling
    <motion.div
      className="h-full border-l border-bolt-elements-borderColor flex-shrink-0 bg-bolt-elements-background-depth-0 overflow-hidden z-workbench rounded-tl-xl shadow-lg"
      variants={workbenchVariants}
      initial="closed"
      animate={showWorkbench ? 'open' : 'closed'}
      style={{
        position: 'fixed',
        right: 0,
        top: 'var(--header-height)',
        bottom: 0,
        height: 'calc(100vh - var(--header-height) - 4px)',
        width: 'var(--workbench-width)',
        marginTop: '4px',
        boxShadow: '0 0 20px rgba(0, 0, 0, 0.1)',
      }}
    >
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-3 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 flex-shrink-0">
          <div className="flex items-center">
            <h1 className="text-xl font-semibold text-bolt-elements-textPrimary ml-2">
              PRD Editor
            </h1>
            {editorState.hasUnsavedChanges && (
              <span className="ml-2 text-md text-bolt-elements-textTertiary">(Unsaved changes)</span>
            )}
          </div>
          {/* line numbers, words, chars, etc should go here from PRDTipTapEditor */}
          {/* Controls */}
          <div className="flex items-center gap-4">
            {/* Save Button - Prominently Displayed */}
            <button
              onClick={saveFullPrd}
              disabled={!editorState.hasUnsavedChanges || !editorInstance}
              className={classNames(
                "flex items-center justify-center gap-2 rounded-md transition-all duration-200 font-medium py-2 px-4 min-w-[90px]",
                editorState.hasUnsavedChanges && editorInstance
                  ? "bg-blue-600 hover:bg-blue-700 text-white shadow-md transform hover:scale-105"
                  : "bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
              )}
              title="Save PRD"
            >
              <div className="i-ph:floppy-disk w-5 h-5" />
              <span>Save</span>
            </button>
            
            {/* Other controls grouped */}
            <div className="flex items-center gap-1 border-l border-bolt-elements-borderColor pl-4">
              {/* Zoom */}
              <IconButton title="Zoom out" onClick={() => setZoomLevel(Math.max(0.5, zoomLevel - 0.1))} className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary disabled:opacity-50">
                <div className="i-ph:minus" />
              </IconButton>
              <span className="mx-2 text-sm text-bolt-elements-textSecondary">
                {Math.round(zoomLevel * 100)}%
              </span>
              <IconButton title="Zoom in" onClick={() => setZoomLevel(Math.min(2, zoomLevel + 0.1))} className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary disabled:opacity-50">
                <div className="i-ph:plus" />
              </IconButton>
              <IconButton title="Reset Zoom" onClick={() => setZoomLevel(1.2)} className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary ml-1 disabled:opacity-50">
                <div className="i-ph:frame-corners" />
              </IconButton>

              <div className="h-4 mx-2 border-r border-bolt-elements-borderColor"></div>
              
              {/* Export options */}
              <IconButton title="Export as HTML" onClick={exportHtml} disabled={(!editorContent && !prdDocument) || !editorInstance} className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary disabled:opacity-50">
                <div className="i-ph:file-html" />
              </IconButton>
              <IconButton title="Export as Markdown" onClick={exportMarkdown} disabled={(!editorContent && !prdDocument) || !editorInstance} className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary disabled:opacity-50 ml-1">
                <div className="i-ph:file-md" />
              </IconButton>
              
              {/* Close */}
              <IconButton title="Close PRD Workbench" onClick={() => workbenchStore.showWorkbench.set(false)} className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary ml-2">
                <div className="i-ph:x" />
              </IconButton>
            </div>
          </div>
        </div>

        {/* Editor Area */}
        <div className="flex-1 flex flex-col overflow-hidden h-full">
          {/* Streaming indicator - positioned at the top of content area */}
          {isStreaming && (
            <div className="w-full bg-bolt-elements-background-depth-1 border-b border-bolt-elements-borderColor flex-shrink-0">
              <PRDStreamingIndicator />
            </div>
          )}
          
          {/* Fixed Editor Toolbar - only visible when NOT streaming */}
          {editorInstance && !isStreaming && (
            <div className={toolbarStyles.fixedToolbar}>
              <EditorToolbar editor={editorInstance} readOnly={false} />
            </div>
          )}
          
           {/* Editor Content Area - with proper spacing to account for fixed toolbar */}
           <div ref={contentRef} className="flex-1 overflow-auto bg-bolt-elements-background-depth-2 p-4 md:p-6 pt-1">
             {/* Use simpler condition: show editor if content/doc exists OR chat is loading */}
             {shouldShowEditor ? (
              <div className="w-full max-w-4xl mx-auto">
                <div
                  ref={editorContainerRef}
                  className={classNames(
                    "bg-white dark:bg-gray-900 rounded shadow-lg transition-all w-full mb-6",
                    isStreaming ? "opacity-90" : "",
                    viewMode === 'paper' ? "paper-container" : ""
                  )}
                   style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'top center', minHeight: 'calc(100% - 2rem)' }}
                >
                  <PRDTipTapEditor
                    content={editorContent}
                    onChange={handleEditorChange}
                    readOnly={isStreaming}
                    className={classNames(
                      "w-full flex flex-col",
                      viewMode === 'paper' ? 'paperStyle' : ''
                    )}
                    placeholder={isStreaming ? "Generating PRD..." : "Start writing your PRD..."}
                    onEditorReady={setEditorInstance}
                  />
                </div>
              </div>
            ) : (
              <div></div>
            )}
          </div>
        </div>
        {/* Document statistics with modern design */}
        {editorInstance && <DocumentStatistics editor={editorInstance} />}
      </div>
    </motion.div>
  );
};

export default PRDWorkbench;