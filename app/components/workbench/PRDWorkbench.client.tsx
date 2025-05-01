import React, { useEffect, useState, useRef, Fragment } from 'react';
import { motion, type Variants } from 'framer-motion';
import { useStore } from '@nanostores/react';
import { workbenchStore } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';
import { cubicEasingFn } from '~/utils/easings';
import { IconButton } from '~/components/ui/IconButton';
import { createScopedLogger } from '~/utils/logger';
import { toast } from 'react-toastify';
import { useChatHistory, chatType } from '~/lib/persistence/useChatHistory';
import PRDTipTapEditor, { EditorToolbar } from './PRDTipTapEditor';

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

// PRD document interfaces
interface PRDSection {
  id: string;
  title: string;
  content: string;
}

interface PRDDocument {
  title: string;
  description: string;
  sections: PRDSection[];
  lastUpdated: string;
}

// PRD Workbench component that displays the PRD document
const PRDWorkbench = () => {
  const showWorkbench = useStore(workbenchStore.showWorkbench);
  const [fullPrdHtmlContent, setFullPrdHtmlContent] = useState('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const contentRef = useRef<HTMLDivElement>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const [editor, setEditor] = useState<any>(null);
  const streamingPRDContent = useStore(workbenchStore.streamingPRDContent);

  const [prdDocument, setPrdDocument] = useState<PRDDocument | null>(null);

  // Set the chat type to 'prd' when the PRD workbench is shown
  useEffect(() => {
    if (showWorkbench) {
      chatType.set('prd');
      logger.debug('Workbench visible: Chat type set to PRD');
    }
  }, [showWorkbench]);

  // Handle streaming PRD content updates
  useEffect(() => {
    if (streamingPRDContent && prdDocument) {
      try {
        // Create a temporary document with streaming content
        const tempDoc = { ...prdDocument };
        
        // Parse the streaming markdown content into sections
        const lines = streamingPRDContent.split('\n');
        let currentTitle = '';
        let currentContent = '';
        let inSection = false;
        let updatedSections: PRDSection[] = [...tempDoc.sections];
        
        // Simple parsing logic for streaming content
        lines.forEach(line => {
          const trimmedLine = line.trim();
          
          if (trimmedLine.startsWith('# ')) {
            // Main title - update document title
            tempDoc.title = trimmedLine.substring(2).trim();
          } else if (trimmedLine.startsWith('## ')) {
            // Section title - if we were in a section, save it
            if (inSection && currentTitle) {
              // Find existing section or create new one
              const existingIndex = updatedSections.findIndex(s => s.title === currentTitle);
              if (existingIndex >= 0) {
                updatedSections[existingIndex].content = currentContent;
              } else {
                const newId = `section-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
                updatedSections.push({
                  id: newId,
                  title: currentTitle,
                  content: currentContent
                });
              }
            }
            
            // Start new section
            currentTitle = trimmedLine.substring(3).trim();
            currentContent = '';
            inSection = true;
          } else if (inSection) {
            // Add to current section content
            currentContent += line + '\n';
          } else if (!tempDoc.description && !inSection) {
            // If not in a section and no description yet, this might be the description
            tempDoc.description += line + '\n';
          }
        });
        
        // Add the last section if we were in one
        if (inSection && currentTitle) {
          const existingIndex = updatedSections.findIndex(s => s.title === currentTitle);
          if (existingIndex >= 0) {
            updatedSections[existingIndex].content = currentContent;
          } else {
            const newId = `section-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
            updatedSections.push({
              id: newId,
              title: currentTitle,
              content: currentContent
            });
          }
        }
        
        tempDoc.sections = updatedSections;
        tempDoc.lastUpdated = new Date().toISOString();
        
        // Generate HTML from the updated document
        const generatedHtml = generateFullHtml(tempDoc);
        setFullPrdHtmlContent(generatedHtml);
        
        // Don't save to sessionStorage during streaming to avoid conflicts
      } catch (error) {
        logger.error('Error processing streaming PRD content:', error);
      }
    }
  }, [streamingPRDContent, prdDocument]);

  // Generate combined HTML content for the editor
  const generateFullHtml = (doc: PRDDocument): string => {
    let html = `<h1>${doc.title}</h1>`;
    if (doc.description) {
      html += `<p>${doc.description}</p>`;
    }
    doc.sections.forEach(section => {
      html += `<h2 id="${section.id}">${section.title}</h2>${section.content}`;
    });
    return html;
  };

  // Load PRD from sessionStorage and listen for changes
  useEffect(() => {
    const loadPrd = () => {
      try {
        const storedPRD = sessionStorage.getItem('current_prd');
        if (storedPRD) {
          const parsedPRD: PRDDocument = JSON.parse(storedPRD);
          // Basic validation
          if (parsedPRD && typeof parsedPRD.title === 'string' && Array.isArray(parsedPRD.sections)) {
            setPrdDocument(currentDoc => {
              const newContent = JSON.stringify(parsedPRD);
              if (JSON.stringify(currentDoc) !== newContent) {
                logger.debug('PRD updated from sessionStorage:', parsedPRD.title);
                const generatedHtml = generateFullHtml(parsedPRD);
                setFullPrdHtmlContent(generatedHtml);
                setHasUnsavedChanges(false);
                return parsedPRD;
              }
              return currentDoc;
            });
          } else {
            logger.warn('Invalid PRD structure found in sessionStorage');
            setPrdDocument(null);
            setFullPrdHtmlContent('');
            setHasUnsavedChanges(false);
            sessionStorage.removeItem('current_prd');
          }
        } else {
          setPrdDocument(currentDoc => {
            if (currentDoc !== null) {
              setFullPrdHtmlContent('');
              setHasUnsavedChanges(false);
              return null;
            }
            return currentDoc;
          });
        }
      } catch (error) {
        logger.error('Error loading PRD from sessionStorage:', error);
        setPrdDocument(null);
        setFullPrdHtmlContent('');
        setHasUnsavedChanges(false);
        sessionStorage.removeItem('current_prd');
      }
    };

    loadPrd(); // Initial load

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'current_prd' && event.storageArea === sessionStorage) {
        logger.debug('sessionStorage changed (event), reloading PRD for workbench.');
        loadPrd();
      }
    };
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // Function to parse HTML back into PRDDocument structure (simplified)
  const parseHtmlToPrd = (html: string, existingDoc: PRDDocument): PRDDocument => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const sections: PRDSection[] = [];
    let title = existingDoc.title;
    let description = existingDoc.description;

    const h1 = doc.querySelector('h1');
    if (h1) {
      title = h1.textContent || existingDoc.title;
      const firstP = h1.nextElementSibling;
      if (firstP && firstP.tagName === 'P') {
        let nextSibling = firstP.nextElementSibling;
        if (!nextSibling || nextSibling.tagName === 'H2') {
            description = firstP.innerHTML;
        } else {
           description = '';
        }
      } else {
        description = '';
      }
    }

    const sectionHeadings = doc.querySelectorAll('h2');
    sectionHeadings.forEach((h2) => {
      const sectionTitle = h2.textContent || 'Untitled Section';
      const sectionId = h2.id || 'section-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
      let contentHtml = '';
      let sibling = h2.nextElementSibling;

      while (sibling && sibling.tagName !== 'H2') {
        contentHtml += sibling.outerHTML;
        sibling = sibling.nextElementSibling;
      }

      sections.push({
        id: sectionId,
        title: sectionTitle,
        content: contentHtml.trim()
      });
    });

    const existingSectionIds = new Set(existingDoc.sections.map(s => s.id));
    const parsedSectionIds = new Set(sections.map(s => s.id));
    existingDoc.sections.forEach(existingSection => {
        if (!parsedSectionIds.has(existingSection.id)) {
            sections.push({ ...existingSection, content: '' });
             logger.warn(`Section "${existingSection.title}" (ID: ${existingSection.id}) was missing after parse, added back as empty.`);
        }
    });

    sections.sort((a, b) => {
      const elementA = doc.getElementById(a.id);
      const elementB = doc.getElementById(b.id);
      if (!elementA || !elementB) return 0;
      return elementA.compareDocumentPosition(elementB) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });

    return {
      ...existingDoc,
      title: title,
      description: description,
      sections: sections,
      lastUpdated: new Date().toISOString()
    };
  };

  // Function to save the entire PRD
  const saveFullPrd = () => {
    if (!prdDocument) return;

    try {
      const updatedPrdDoc = parseHtmlToPrd(fullPrdHtmlContent, prdDocument);

      const newPrdString = JSON.stringify(updatedPrdDoc);
      sessionStorage.setItem('current_prd', newPrdString);
      logger.debug('Full PRD (HTML) saved to sessionStorage.');

      workbenchStore.updatePRD(updatedPrdDoc.lastUpdated);

      window.dispatchEvent(new StorageEvent('storage', {
        key: 'current_prd',
        storageArea: sessionStorage,
        newValue: newPrdString
      }));

      setPrdDocument(updatedPrdDoc);
      setHasUnsavedChanges(false);

      toast.success('PRD updated successfully');
    } catch (error) {
      logger.error('Error saving PRD:', error);
      toast.error('Failed to save PRD. Check content structure.');
    }
  };

  // Handler for editor content changes
  const handleEditorChange = (newHtmlContent: string) => {
    setFullPrdHtmlContent(newHtmlContent);
    setHasUnsavedChanges(true);
  };

  if (!showWorkbench) return null;

  return (
    <motion.div
      className="h-full border-l border-bolt-elements-borderColor flex-shrink-0 bg-bolt-elements-background-depth-0 overflow-hidden z-workbench fixed right-0 top-[var(--header-height)] bottom-0"
      variants={workbenchVariants}
      initial="closed"
      animate={showWorkbench ? 'open' : 'closed'}
      style={{
        height: 'calc(100vh - var(--header-height))',
        width: 'var(--workbench-width)',
      }}
    >
      <div className="h-full flex flex-col">
        <div className="flex justify-between items-center p-2 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 flex-shrink-0 gap-2">
          <div className="flex items-center gap-2 overflow-hidden flex-shrink min-w-0">
            <span className="text-sm font-medium text-bolt-elements-textPrimary truncate">
              {prdDocument?.title || 'PRD Workbench'}
            </span>
            {hasUnsavedChanges && (
                 <span className="text-xs text-yellow-500 dark:text-yellow-400 ml-1 flex-shrink-0" title="Unsaved changes">*</span>
            )}
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            <span className="text-xs text-bolt-elements-textTertiary mr-1 hidden md:inline">
              {prdDocument ? `${fullPrdHtmlContent.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length} words` : ''}
            </span>

            <div className="h-4 w-px bg-bolt-elements-borderColor mx-1"></div>

            <IconButton
              title="Save Changes"
              onClick={saveFullPrd}
              disabled={!prdDocument || !hasUnsavedChanges}
              className="text-green-500 hover:text-green-600 disabled:opacity-50 disabled:hover:text-green-500"
            >
              <div className="i-ph:floppy-disk-back w-5 h-5" />
            </IconButton>

            <div className="h-4 w-px bg-bolt-elements-borderColor mx-1"></div>

            <IconButton title="Zoom Out" onClick={() => setZoomLevel(prev => Math.max(prev - 0.1, 0.5))} disabled={!prdDocument} className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary disabled:opacity-50">
              <div className="i-ph:minus w-5 h-5" />
            </IconButton>
            <span className="text-xs text-bolt-elements-textSecondary px-1 w-10 text-center select-none">
              {prdDocument ? `${Math.round(zoomLevel * 100)}%` : '-'}
            </span>
            <IconButton title="Zoom In" onClick={() => setZoomLevel(prev => Math.min(prev + 0.1, 2.0))} disabled={!prdDocument} className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary disabled:opacity-50">
              <div className="i-ph:plus w-5 h-5" />
            </IconButton>
            <IconButton title="Reset Zoom" onClick={() => setZoomLevel(1)} disabled={!prdDocument || zoomLevel === 1} className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary ml-1 disabled:opacity-50">
              <div className="i-ph:frame-corners w-5 h-5" />
            </IconButton>

            <div className="h-4 w-px bg-bolt-elements-borderColor mx-1"></div>

            <IconButton title="Export as Markdown" onClick={() => {
              if (!prdDocument) { toast.error("No PRD loaded."); return; }
              const markdown = "Markdown export requires HTML-to-Markdown conversion (e.g., using turndown library)";
              console.warn("Markdown export needs implementation using an HTML-to-Markdown library.");
              toast.info("Markdown export not fully implemented.");
            }} disabled={!prdDocument} className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary disabled:opacity-50">
              <div className="i-ph:file-markdown w-5 h-5" />
            </IconButton>
            <IconButton title="Export as HTML" onClick={() => {
              if (!prdDocument) { toast.error("No PRD loaded."); return; }
              const fullHtml = `<!DOCTYPE html>
 <html lang="en">
 <head>
   <meta charset="UTF-8">
   <meta name="viewport" content="width=device-width, initial-scale=1.0">
   <title>${prdDocument.title}</title>
   <style> body { font-family: sans-serif; line-height: 1.6; max-width: 800px; margin: 20px auto; padding: 15px; } h1, h2 { border-bottom: 1px solid #eee; padding-bottom: 5px; } /* Add more basic styles if needed */ </style>
 </head>
 <body>
   ${fullPrdHtmlContent}
   <hr>
   <p style="font-size: 0.8em; color: #777;">Last updated: ${new Date(prdDocument.lastUpdated).toLocaleString()}</p>
 </body>
 </html>`;
              const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `${prdDocument.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.html`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }} disabled={!prdDocument} className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary disabled:opacity-50">
              <div className="i-ph:file-html w-5 h-5" />
            </IconButton>
          </div>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Editor Toolbar positioned as a full-width banner */}
          {prdDocument && editor && (
            <div className="w-full bg-white dark:bg-gray-900 border-b border-bolt-elements-borderColor shadow-sm">
              <EditorToolbar editor={editor} readOnly={false} />
            </div>
          )}
          
          <div
            ref={contentRef}
            className="flex-1 overflow-auto bg-bolt-elements-background-depth-2 p-4 md:p-6"
          >
            {prdDocument ? (
              <div className="w-full max-w-4xl mx-auto">
                {/* Editor Content */}
                <div
                  ref={editorContainerRef}
                  className="bg-white dark:bg-gray-900 rounded shadow-lg transition-transform w-full mb-6"
                  style={{
                    transform: `scale(${zoomLevel})`,
                    transformOrigin: 'top center',
                    minHeight: 'calc(100% - 2rem)',
                  }}
                >
                  <PRDTipTapEditor
                    content={fullPrdHtmlContent}
                    onChange={handleEditorChange}
                    readOnly={false}
                    className="w-full flex flex-col"
                    placeholder={"Start writing your PRD..."}
                    onEditorReady={setEditor}
                  />
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center h-full">
                <div className="text-center p-10">
                  <div className="i-ph:clipboard-text text-6xl text-bolt-elements-textTertiary mb-6 mx-auto"></div>
                  <h3 className="text-xl font-semibold text-bolt-elements-textPrimary mb-2">No PRD Loaded</h3>
                  <p className="text-bolt-elements-textSecondary max-w-md">
                    Use the PRD Assistant chat to generate or load a Product Requirements Document.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default PRDWorkbench;