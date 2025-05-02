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

  // Load PRD from sessionStorage and listen for changes
  useEffect(() => {
    // Load initial PRD
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

    // Add a listener for streaming content changes
    const streamingContentListener = workbenchStore.streamingPRDContent.listen((content) => {
      if (content && prdDocument) {
        try {
          // Clean the streaming content to remove any remnants
          const cleanedContent = cleanStreamingContent(content);
          
          if (cleanedContent.trim()) {
            // Create a temporary document with streaming content
            const tempDoc = { ...prdDocument };
            
            // Parse the streaming markdown content into sections
            const lines = cleanedContent.split('\n');
            let currentTitle = '';
            let currentContent = '';
            let inSection = false;
            let updatedSections = [...tempDoc.sections];
            
            // Create a map of existing sections by title for easier lookup
            const sectionsByTitle = new Map<string, PRDSection>();
            updatedSections.forEach((section, index) => {
              sectionsByTitle.set(section.title.toLowerCase(), section);
            });
            
            // Simple parsing logic for streaming content
            lines.forEach(line => {
              const trimmedLine = line.trim();
              
              // Skip placeholder lines and empty lines
              if (!trimmedLine || 
                  trimmedLine.includes('[Previous sections continue unchanged...]') || 
                  trimmedLine.includes('[section unchanged]') || 
                  trimmedLine.includes('[unchanged content]')) {
                return;
              }
              
              // Skip lines that are just numbers
              if (/^\s*\d+\.?\s*$/.test(trimmedLine)) {
                return;
              }
              
              if (trimmedLine.startsWith('# ')) {
                // Main title - update document title
                tempDoc.title = trimmedLine.substring(2).trim();
              } else if (trimmedLine.startsWith('## ')) {
                // Section title - if we were in a section, save it
                if (inSection && currentTitle) {
                  // Find existing section or create new one
                  const existingSection = sectionsByTitle.get(currentTitle.toLowerCase());
                  if (existingSection) {
                    existingSection.content = currentContent.trim();
                  } else {
                    const newId = `section-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
                    updatedSections.push({
                      id: newId,
                      title: currentTitle,
                      content: currentContent.trim()
                    });
                    sectionsByTitle.set(currentTitle.toLowerCase(), updatedSections[updatedSections.length - 1]);
                  }
                }
                
                // Start new section if the title is not just a number
                const sectionTitle = trimmedLine.substring(3).trim();
                if (!/^\s*\d+\.?\s*$/.test(sectionTitle)) {
                  currentTitle = sectionTitle;
                  currentContent = '';
                  inSection = true;
                }
              } else if (inSection) {
                // Add to current section content
                currentContent += line + '\n';
              }
            });
            
            // Add the last section if we were in one
            if (inSection && currentTitle) {
              const existingSection = sectionsByTitle.get(currentTitle.toLowerCase());
              if (existingSection) {
                existingSection.content = currentContent.trim();
              } else {
                const newId = `section-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
                updatedSections.push({
                  id: newId,
                  title: currentTitle,
                  content: currentContent.trim()
                });
              }
            }
            
            // Filter out any sections with just numbers or empty content
            updatedSections = updatedSections.filter(section => {
              const isTitleJustNumber = /^\d+\.?\s*$/.test(section.title.trim());
              const hasContent = section.content.trim().length > 0;
              const isContentJustNumbers = /^[\d\.\s]+$/.test(section.content.trim());
              
              return !isTitleJustNumber && hasContent && !isContentJustNumbers;
            });
            
            tempDoc.sections = updatedSections;
            tempDoc.lastUpdated = new Date().toISOString();
            
            // Generate HTML from the updated document
            const generatedHtml = generateFullHtml(tempDoc);
            setFullPrdHtmlContent(generatedHtml);
          }
        } catch (error) {
          logger.error('Error processing streaming PRD content:', error);
        }
      }
    });

    // Cleanup function
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      streamingContentListener();
    };
  }, [prdDocument]);

  // Helper function to clean streaming content of remnants
  const cleanStreamingContent = (content: string): string => {
    if (!content) return '';
    
    // Split by lines to process
    const lines = content.split('\n');
    const cleanedLines: string[] = [];
    
    // Track if we're in a valid section
    let inValidSection = false;
    let validSectionCount = 0;
    
    // Process each line
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      // Skip empty lines
      if (!trimmedLine) {
        // Only keep empty lines if they're within a valid section
        if (inValidSection) {
          cleanedLines.push('');
        }
        continue;
      }
      
      // Skip placeholder lines
      if (trimmedLine.includes('[Previous sections continue unchanged...]') || 
          trimmedLine.includes('[section unchanged]') || 
          trimmedLine.includes('[unchanged content]')) {
        continue;
      }
      
      // Check for section headers
      if (trimmedLine.startsWith('# ') || trimmedLine.startsWith('## ')) {
        // If it's just a number or number + period, skip it
        if (/^#+\s+\d+\.?\s*$/.test(trimmedLine)) {
          continue;
        }
        
        // If it's a section header with actual content, keep it
        if (trimmedLine.length > 3) {
          inValidSection = true;
          validSectionCount++;
          cleanedLines.push(line);
        }
        continue;
      }
      
      // Check for lines that are just section numbers (more aggressive pattern)
      // This catches standalone numbers like "1.", "2.", "3." etc.
      if (/^\s*\d+\.?\s*$/.test(trimmedLine)) {
        continue;
      }
      
      // Include all other lines that have meaningful content
      if (trimmedLine.length > 0) {
        cleanedLines.push(line);
      }
    }
    
    // If we didn't find any valid sections but have content, it might be just remnants
    // In this case, return an empty string to avoid displaying garbage
    if (validSectionCount === 0 && cleanedLines.length < 5) {
      return '';
    }
    
    return cleanedLines.join('\n');
  };

  // Generate combined HTML content for the editor
  const generateFullHtml = (doc: PRDDocument): string => {
    // Start with the title
    let html = `<h1>${doc.title}</h1>\n\n`;
    
    // Add description if it exists
    if (doc.description) {
      // If description is already HTML, use it directly
      if (doc.description.trim().startsWith('<')) {
        html += `${doc.description}\n\n`;
      } else {
        // Otherwise, wrap it in a paragraph
        html += `<p>${doc.description}</p>\n\n`;
      }
    }
    
    // Add each section with its title and content
    if (doc.sections && doc.sections.length > 0) {
      doc.sections.forEach(section => {
        // Add section title as h2
        html += `<h2 id="${section.id}">${section.title}</h2>\n\n`;
        
        // Add section content if it exists
        if (section.content) {
          html += `${section.content}\n\n`;
        }
      });
    }
    
    return html.trim();
  };

  // Function to parse HTML back into PRDDocument structure
  const parseHtmlToPrd = (html: string, existingDoc: PRDDocument): PRDDocument => {
    try {
      const parser = new DOMParser();
      // Wrap the HTML in a div to ensure proper parsing
      const doc = parser.parseFromString(`<div id="prd-root">${html}</div>`, 'text/html');
      const rootDiv = doc.getElementById('prd-root');
      
      if (!rootDiv) {
        console.error('Failed to parse HTML: root element not found');
        return existingDoc;
      }
      
      const result: PRDDocument = { 
        title: existingDoc.title,
        description: existingDoc.description,
        sections: [],
        lastUpdated: new Date().toISOString()
      };

      // Extract title (h1)
      const titleElem = rootDiv.querySelector('h1');
      if (titleElem && titleElem.textContent) {
        result.title = titleElem.textContent.trim();
      }

      // Extract description (content between h1 and first h2)
      let descriptionContent = '';
      let currentElem = titleElem?.nextElementSibling;
      while (currentElem && currentElem.tagName !== 'H2') {
        if (currentElem.textContent) {
          descriptionContent += currentElem.outerHTML;
        }
        currentElem = currentElem.nextElementSibling;
      }

      if (descriptionContent) {
        result.description = descriptionContent.trim();
      }

      // Extract sections (h2 and all content until next h2)
      const sections: PRDSection[] = [];
      const h2Elements = rootDiv.querySelectorAll('h2');

      // Create a map of existing sections by title for easier lookup
      const existingSectionsByTitle = new Map<string, PRDSection>();
      existingDoc.sections.forEach(section => {
        existingSectionsByTitle.set(section.title.toLowerCase(), section);
      });

      h2Elements.forEach((h2Elem, index) => {
        if (!h2Elem.textContent) return; // Skip empty headings
        
        const sectionTitle = h2Elem.textContent.trim();
        let sectionContent = '';
        let currentNode = h2Elem.nextElementSibling;

        while (currentNode && currentNode.tagName !== 'H2') {
          if (currentNode.textContent) {
            sectionContent += currentNode.outerHTML;
          }
          currentNode = currentNode.nextElementSibling;
        }

        // Look for existing section with same title to preserve ID
        const existingSection = existingSectionsByTitle.get(sectionTitle.toLowerCase());
        const sectionId = existingSection ? existingSection.id : `section-${index}-${Date.now()}`;

        sections.push({
          id: sectionId,
          title: sectionTitle,
          content: sectionContent.trim()
        });

        // Remove from map to track which we've processed
        if (existingSection) {
          existingSectionsByTitle.delete(sectionTitle.toLowerCase());
        }
      });

      // Add any remaining existing sections that weren't in the new content
      // This ensures we preserve sections that weren't included in the partial update
      existingSectionsByTitle.forEach(section => {
        // Only add non-empty sections that weren't processed above
        if (section.title && section.content) {
          sections.push({...section});
        }
      });

      // Sort sections to maintain consistent order
      result.sections = sections;
      return result;
    } catch (error) {
      console.error('Error parsing HTML to PRD:', error);
      // Return the existing document if parsing fails
      return existingDoc;
    }
  };

  // Function to save the entire PRD
  const saveFullPrd = () => {
    if (!prdDocument) return;

    try {
      // Get the current HTML content from the editor
      const currentHtml = editor?.getHTML() || fullPrdHtmlContent;
      
      // Clean the HTML to remove any empty sections or remnants
      const cleanedHtml = cleanHtml(currentHtml);
      
      // Parse the HTML back into a PRD document structure
      const updatedPrd = parseHtmlToPrd(cleanedHtml, prdDocument);
      
      // Ensure we're not losing any sections
      if (updatedPrd.sections.length < prdDocument.sections.length) {
        logger.warn('Potential data loss detected - section count decreased');
        
        // Create a map of updated sections by title
        const updatedSectionsByTitle = new Map<string, PRDSection>();
        updatedPrd.sections.forEach(section => {
          updatedSectionsByTitle.set(section.title.toLowerCase(), section);
        });
        
        // Add any missing sections from the original document that have content
        prdDocument.sections.forEach(originalSection => {
          if (!updatedSectionsByTitle.has(originalSection.title.toLowerCase()) && originalSection.content.trim()) {
            logger.info(`Preserving potentially missing section: ${originalSection.title}`);
            updatedPrd.sections.push(originalSection);
          }
        });
      }
      
      // Filter out any sections with just numbers or empty content
      updatedPrd.sections = updatedPrd.sections.filter(section => {
        // Skip sections that are just numbers or empty
        const isTitleJustNumber = /^\d+\.?\s*$/.test(section.title.trim());
        const hasContent = section.content.trim().length > 0;
        
        // Additional check for content that's just numbers
        const isContentJustNumbers = /^[\d\.\s]+$/.test(section.content.trim());
        
        return !isTitleJustNumber && hasContent && !isContentJustNumbers;
      });
      
      // Update the lastUpdated timestamp
      updatedPrd.lastUpdated = new Date().toISOString();
      
      // Save to session storage
      sessionStorage.setItem('current_prd', JSON.stringify(updatedPrd));
      
      // Update state
      setPrdDocument(updatedPrd);
      setHasUnsavedChanges(false);
      
      // Generate clean HTML for the editor
      const newHtml = generateFullHtml(updatedPrd);
      setFullPrdHtmlContent(newHtml);
      
      logger.debug('PRD saved successfully');
      toast.success('PRD saved successfully');
    } catch (error) {
      logger.error('Error saving PRD:', error);
      toast.error('Error saving PRD. Please try again.');
    }
  };

  // Helper function to clean HTML of remnants and empty sections
  const cleanHtml = (html: string): string => {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // Remove empty headings or headings with just numbers
      const headings = doc.querySelectorAll('h1, h2, h3, h4, h5, h6');
      headings.forEach(heading => {
        const headingText = heading.textContent?.trim() || '';
        // Check if heading is empty or just contains a number or number + period
        if (!headingText || /^\d+\.?\s*$/.test(headingText)) {
          heading.remove();
        }
      });
      
      // Remove any elements that might be remnants
      const allElements = doc.body.querySelectorAll('*');
      allElements.forEach(el => {
        const content = el.textContent?.trim() || '';
        // Remove elements that just contain section numbers or empty content
        if (/^(\d+\.?\s*)+$/.test(content) || content === '') {
          el.remove();
        }
      });
      
      // Additional cleanup for stray numbers that might be in paragraphs
      const paragraphs = doc.querySelectorAll('p');
      paragraphs.forEach(p => {
        const content = p.textContent?.trim() || '';
        // If paragraph only contains numbers and periods, remove it
        if (/^[\d\.\s]+$/.test(content)) {
          p.remove();
        }
      });
      
      return doc.body.innerHTML;
    } catch (error) {
      console.error('Error cleaning HTML:', error);
      return html; // Return original if cleaning fails
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