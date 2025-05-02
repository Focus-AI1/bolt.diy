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

const logger = createScopedLogger('ResearchWorkbench');

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

// Research document interfaces
interface ResearchSection {
  id: string;
  title: string;
  content: string;
}

interface ResearchDocument {
  title: string;
  description: string;
  sections: ResearchSection[];
  lastUpdated: string;
}

// Research Workbench component that displays the Research document
const ResearchWorkbench = () => {
  const showWorkbench = useStore(workbenchStore.showWorkbench);
  const [fullResearchHtmlContent, setFullResearchHtmlContent] = useState('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const contentRef = useRef<HTMLDivElement>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const [editor, setEditor] = useState<any>(null);
  const streamingResearchContent = useStore(workbenchStore.streamingPRDContent);

  const [researchDocument, setResearchDocument] = useState<ResearchDocument | null>(null);

  // Set the chat type to 'research' when the Research workbench is shown
  useEffect(() => {
    if (showWorkbench) {
      chatType.set('research');
      logger.debug('Workbench visible: Chat type set to Research');
    }
  }, [showWorkbench]);

  // Load Research from sessionStorage and listen for changes
  useEffect(() => {
    // Load initial Research
    const loadResearch = () => {
      try {
        const storedResearch = sessionStorage.getItem('current_research');
        if (storedResearch) {
          const parsedResearch: ResearchDocument = JSON.parse(storedResearch);
          // Basic validation
          if (parsedResearch && typeof parsedResearch.title === 'string' && Array.isArray(parsedResearch.sections)) {
            setResearchDocument(currentDoc => {
              const newContent = JSON.stringify(parsedResearch);
              if (JSON.stringify(currentDoc) !== newContent) {
                logger.debug('Research updated from sessionStorage:', parsedResearch.title);
                const generatedHtml = generateFullHtml(parsedResearch);
                setFullResearchHtmlContent(generatedHtml);
                setHasUnsavedChanges(false);
                return parsedResearch;
              }
              return currentDoc;
            });
          } else {
            logger.warn('Invalid Research structure found in sessionStorage');
            setResearchDocument(null);
            setFullResearchHtmlContent('');
            setHasUnsavedChanges(false);
            sessionStorage.removeItem('current_research');
          }
        } else {
          setResearchDocument(currentDoc => {
            if (currentDoc !== null) {
              setFullResearchHtmlContent('');
              setHasUnsavedChanges(false);
              return null;
            }
            return currentDoc;
          });
        }
      } catch (error) {
        logger.error('Error loading Research from sessionStorage:', error);
        setResearchDocument(null);
        setFullResearchHtmlContent('');
        setHasUnsavedChanges(false);
        sessionStorage.removeItem('current_research');
      }
    };

    loadResearch(); // Initial load

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'current_research' && event.storageArea === sessionStorage) {
        loadResearch(); // Reload when storage changes
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Watch for streaming content changes
  useEffect(() => {
    if (streamingResearchContent && showWorkbench) {
      // Clean streaming content before using it
      const cleanedContent = cleanStreamingContent(streamingResearchContent);
      
      try {
        // Parse cleaned markdown to document
        const tempDoc: ResearchDocument = {
          title: researchDocument?.title || 'Research Document',
          description: researchDocument?.description || '',
          sections: [],
          lastUpdated: new Date().toISOString(),
        };

        // Split the content by ## headings to extract sections
        const lines = cleanedContent.split('\n');
        let currentTitle = '';
        let currentContent = '';
        let isTitleSection = true;

        for (const line of lines) {
          if (line.startsWith('# ')) {
            // Main title
            tempDoc.title = line.substring(2).trim();
            isTitleSection = true;
          } else if (line.startsWith('## ')) {
            // New section heading
            if (currentTitle) {
              // Save previous section
              const id = currentTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-');
              tempDoc.sections.push({
                id,
                title: currentTitle,
                content: currentContent.trim(),
              });
            }
            
            // Start new section
            currentTitle = line.substring(3).trim();
            currentContent = '';
            isTitleSection = false;
          } else {
            if (isTitleSection) {
              // Add to description if we're still in the title section
              if (tempDoc.description) {
                tempDoc.description += '\n' + line;
              } else {
                tempDoc.description = line;
              }
            } else if (currentTitle) {
              // Add to current section content
              if (currentContent) {
                currentContent += '\n' + line;
              } else {
                currentContent = line;
              }
            }
          }
        }

        // Add the last section if any
        if (currentTitle) {
          const id = currentTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-');
          tempDoc.sections.push({
            id,
            title: currentTitle,
            content: currentContent.trim(),
          });
        }

        if (tempDoc.sections.length > 0) {
          const generatedHtml = generateFullHtml(tempDoc);
          setFullResearchHtmlContent(generatedHtml);
        }
      } catch (error) {
        logger.error('Error processing streaming content:', error);
      }
    }
  }, [streamingResearchContent, showWorkbench, researchDocument]);

  // Helper function to clean streaming content of remnants
  const cleanStreamingContent = (content: string): string => {
    try {
      // Remove code blocks that might be incomplete
      content = content.replace(/```(?:markdown|md)?\s*$/g, '');
      
      // Remove partial XML/HTML tags that might be generated during streaming
      content = content.replace(/<[^>]*$/g, '');
      
      // Remove trailing partial words/sentences (if ending with a word character without punctuation)
      const lines = content.split('\n');
      if (lines.length > 0) {
        const lastLine = lines[lines.length - 1];
        // Check if the last line ends properly with punctuation or is a heading
        if (
          lastLine &&
          !lastLine.match(/[.!?:;,]$/) &&
          !lastLine.match(/^#+\s/) &&
          !lastLine.match(/^[-*]\s/) &&
          !lastLine.trim().endsWith('.')
        ) {
          // This might be a partial sentence, remove it
          lines.pop();
          content = lines.join('\n');
        }
      }
      
      // Ensure research document is properly structured with at least a title
      if (!content.includes('# ')) {
        content = '# Research Document\n\n' + content;
      }
      
      // Add missing section headers if there's content without headers
      const hasContent = content.replace(/^#.*$/gm, '').trim().length > 0;
      const hasSections = content.includes('## ');
      
      if (hasContent && !hasSections) {
        // Add a default section header if there's content but no sections
        content = content.replace(/^# (.*?)$/m, '# $1\n\n## Key Findings\n');
      }
      
      return content;
    } catch (error) {
      logger.error('Error cleaning streaming content:', error);
      return content; // Return original content if cleaning fails
    }
  };

  // Generate combined HTML content for the editor
  const generateFullHtml = (doc: ResearchDocument): string => {
    try {
      let html = '';
      
      // Add title
      html += `<h1>${doc.title || 'Research Document'}</h1>`;
      
      // Add description
      if (doc.description) {
        html += `<p>${doc.description.replace(/\n/g, '<br>')}</p>`;
      }
      
      // Add sections
      if (doc.sections && doc.sections.length > 0) {
        for (const section of doc.sections) {
          html += `<h2>${section.title}</h2>`;
          
          // Add section content
          if (section.content) {
            html += `<div>${section.content.replace(/\n/g, '<br>')}</div>`;
          }
        }
      }
      
      return html;
    } catch (error) {
      logger.error('Error generating HTML content:', error);
      return '<h1>Error generating content</h1>';
    }
  };

  // Function to parse HTML back into ResearchDocument structure
  const parseHtmlToResearch = (html: string, existingDoc: ResearchDocument): ResearchDocument => {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // Extract title
      const titleEl = doc.querySelector('h1');
      const title = titleEl ? titleEl.textContent || 'Research Document' : 'Research Document';
      
      // Initialize result object
      const result: ResearchDocument = {
        ...existingDoc,
        title,
        description: '',
        sections: [],
        lastUpdated: new Date().toISOString(),
      };
      
      // Extract description (content between title and first section)
      let descriptionContent = '';
      let currentNode = titleEl?.nextElementSibling;
      
      while (currentNode && currentNode.tagName !== 'H2') {
        if (currentNode.textContent) {
          descriptionContent += currentNode.innerHTML
            .replace(/<br>/g, '\n')
            .replace(/<\/p><p>/g, '\n\n');
        }
        currentNode = currentNode.nextElementSibling;
      }
      
      result.description = descriptionContent.trim();
      
      // Extract sections
      const sections: ResearchSection[] = [];
      const sectionElements = doc.querySelectorAll('h2');
      
      sectionElements.forEach(sectionEl => {
        const title = sectionEl.textContent || '';
        const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        
        let content = '';
        let node = sectionEl.nextElementSibling;
        
        while (node && node.tagName !== 'H2') {
          if (node.textContent) {
            content += node.innerHTML
              .replace(/<br>/g, '\n')
              .replace(/<\/p><p>/g, '\n\n');
          }
          node = node.nextElementSibling;
        }
        
        sections.push({
          id,
          title,
          content: content.trim(),
        });
      });
      
      result.sections = sections;
      return result;
    } catch (error) {
      logger.error('Error parsing HTML to Research:', error);
      return existingDoc; // Return existing document on error
    }
  };

  // Function to save the entire Research
  const saveFullResearch = () => {
    try {
      if (!researchDocument) {
        toast.error('No Research document loaded.');
        return;
      }
      
      // Get cleaned HTML content
      const cleanedHtml = cleanHtml(fullResearchHtmlContent);
      
      // Parse HTML back to Research document structure
      const updatedResearch = parseHtmlToResearch(cleanedHtml, researchDocument);
      
      // Validate structure
      if (!updatedResearch.title) {
        toast.error('Research document must have a title.');
        return;
      }
      
      // Save to session storage
      sessionStorage.setItem('current_research', JSON.stringify(updatedResearch));
      
      // Update state
      setResearchDocument(updatedResearch);
      setHasUnsavedChanges(false);
      
      // Show success message
      toast.success('Research document saved successfully.');
      
      // Log
      logger.debug('Research document saved:', updatedResearch.title);
      
    } catch (error) {
      logger.error('Error saving Research document:', error);
      toast.error('Failed to save Research document. Please try again.');
    }
  };

  // Helper function to clean HTML of remnants and empty sections
  const cleanHtml = (html: string): string => {
    try {
      // Parse HTML to clean it
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // Fix empty sections
      const sections = doc.querySelectorAll('h2');
      sections.forEach(section => {
        let hasContent = false;
        let node = section.nextElementSibling;
        
        while (node && node.tagName !== 'H2') {
          if (node.textContent && node.textContent.trim()) {
            hasContent = true;
            break;
          }
          node = node.nextElementSibling;
        }
        
        if (!hasContent) {
          // Add a placeholder content for empty sections
          const placeholder = doc.createElement('p');
          placeholder.textContent = 'No content';
          
          // Insert after the section heading
          if (section.nextElementSibling) {
            section.parentNode?.insertBefore(placeholder, section.nextElementSibling);
          } else {
            section.parentNode?.appendChild(placeholder);
          }
        }
      });
      
      // Get cleaned HTML
      return doc.body.innerHTML;
    } catch (error) {
      logger.error('Error cleaning HTML:', error);
      return html; // Return original HTML if cleaning fails
    }
  };

  // Handler for editor content changes
  const handleEditorChange = (newHtmlContent: string) => {
    setFullResearchHtmlContent(newHtmlContent);
    setHasUnsavedChanges(true);
  };

  return (
    <motion.div
      className="absolute inset-y-0 right-0 z-10 flex h-full shadow-lg"
      variants={workbenchVariants}
      initial="closed"
      animate={showWorkbench ? 'open' : 'closed'}
    >
      <div
        className={classNames(
          "flex flex-col w-full h-full bg-bolt-elements-background-default overflow-hidden",
          { "pointer-events-none": !showWorkbench }
        )}
      >
        {/* Workbench Header */}
        <div className="flex items-center justify-between border-b border-bolt-elements-borderColor px-4 py-2">
          <div className="flex items-center">
            <div className="i-ph:binoculars text-xl mr-2"></div>
            <h2 className="font-semibold text-lg text-bolt-elements-textPrimary">Research Document</h2>
          </div>
          
          <div className="flex items-center space-x-1">
            {/* Zoom Controls */}
            <div className="flex items-center mr-2">
              <IconButton
                title="Zoom Out"
                onClick={() => setZoomLevel(z => Math.max(0.5, z - 0.1))}
                className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary disabled:opacity-50"
              >
                <div className="i-ph:magnifying-glass-minus w-4 h-4" />
              </IconButton>
              <span className="text-xs mx-1 text-bolt-elements-textSecondary">
                {Math.round(zoomLevel * 100)}%
              </span>
              <IconButton
                title="Zoom In"
                onClick={() => setZoomLevel(z => Math.min(2, z + 0.1))}
                className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary disabled:opacity-50"
              >
                <div className="i-ph:magnifying-glass-plus w-4 h-4" />
              </IconButton>
            </div>

            {/* Edit Actions */}
            <IconButton
              title={hasUnsavedChanges ? "Save Changes" : "Save"}
              onClick={saveFullResearch}
              disabled={!hasUnsavedChanges}
              className={classNames(
                hasUnsavedChanges
                  ? "text-bolt-elements-textAction hover:text-bolt-elements-textAction-hover"
                  : "text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary",
                "disabled:opacity-50"
              )}
            >
              <div className="i-ph:floppy-disk w-5 h-5" />
            </IconButton>

            {/* Export Options */}
            <IconButton title="Export as Markdown" onClick={() => {
              if (!researchDocument) { toast.error("No Research loaded."); return; }
              console.warn("Markdown export needs implementation using an HTML-to-Markdown library.");
              toast.info("Markdown export not fully implemented.");
            }} disabled={!researchDocument} className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary disabled:opacity-50">
              <div className="i-ph:file-markdown w-5 h-5" />
            </IconButton>
            <IconButton title="Export as HTML" onClick={() => {
              if (!researchDocument) { toast.error("No Research loaded."); return; }
              const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${researchDocument.title}</title>
  <style> body { font-family: sans-serif; line-height: 1.6; max-width: 800px; margin: 20px auto; padding: 15px; } h1, h2 { border-bottom: 1px solid #eee; padding-bottom: 5px; } /* Add more basic styles if needed */ </style>
</head>
<body>
  ${fullResearchHtmlContent}
  <hr>
  <p style="font-size: 0.8em; color: #777;">Last updated: ${new Date(researchDocument.lastUpdated).toLocaleString()}</p>
</body>
</html>`;
              const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `${researchDocument.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.html`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }} disabled={!researchDocument} className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary disabled:opacity-50">
              <div className="i-ph:file-html w-5 h-5" />
            </IconButton>
          </div>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Editor Toolbar positioned as a full-width banner */}
          {researchDocument && editor && (
            <div className="w-full bg-white dark:bg-gray-900 border-b border-bolt-elements-borderColor shadow-sm">
              <EditorToolbar editor={editor} readOnly={false} />
            </div>
          )}
          
          <div
            ref={contentRef}
            className="flex-1 overflow-auto bg-bolt-elements-background-depth-2 p-4 md:p-6"
          >
            {researchDocument ? (
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
                    content={fullResearchHtmlContent}
                    onChange={handleEditorChange}
                    readOnly={false}
                    className="w-full flex flex-col"
                    placeholder={"Start writing your Research document..."}
                    onEditorReady={setEditor}
                  />
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center h-full">
                <div className="text-center p-10">
                  <div className="i-ph:binoculars text-6xl text-bolt-elements-textTertiary mb-6 mx-auto"></div>
                  <h3 className="text-xl font-semibold text-bolt-elements-textPrimary mb-2">No Research Loaded</h3>
                  <p className="text-bolt-elements-textSecondary max-w-md">
                    Use the Research Assistant chat to generate or load a Research document.
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

export default ResearchWorkbench;