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

// Simple Markdown Renderer Component (or helper function)
const SimpleMarkdownRenderer: React.FC<{ content: string }> = ({ content }) => {
  if (!content) {
    return null;
  }

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let listItems: React.ReactNode[] = [];

  const closeList = () => {
    if (listItems.length > 0) {
      if (listType === 'ul') {
        elements.push(<ul key={`list-${elements.length}`} className="list-disc pl-6 mb-3 space-y-1">{listItems}</ul>);
      } else if (listType === 'ol') {
        elements.push(<ol key={`list-${elements.length}`} className="list-decimal pl-6 mb-3 space-y-1">{listItems}</ol>);
      }
    }
    listItems = [];
    listType = null;
  };

  lines.forEach((line, index) => {
    const trimmedLine = line.trim();

    // Regex for bold and italics - basic version, might not handle nested or complex cases perfectly
    const renderLine = (text: string) => {
      // Split by bold/italic markers, keeping the markers
      const parts = text.split(/(\*\*.*?\*\*|\*.*?\*)/g);
      return parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('*') && part.endsWith('*')) {
           // Check if it's not actually bold marker remnants
          if (!(part.startsWith('**') || part.endsWith('**'))) {
             return <em key={i}>{part.slice(1, -1)}</em>;
          }
        }
        return <Fragment key={i}>{part}</Fragment>; // Use Fragment for plain text parts
      });
    };


    // Unordered List Items
    if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ') || trimmedLine.startsWith('• ')) {
      if (listType !== 'ul') {
        closeList();
        listType = 'ul';
      }
      listItems.push(<li key={index}>{renderLine(trimmedLine.substring(2))}</li>);
    }
    // Ordered List Items
    else if (/^\d+\.\s/.test(trimmedLine)) {
       if (listType !== 'ol') {
         closeList();
         listType = 'ol';
       }
       listItems.push(<li key={index}>{renderLine(trimmedLine.replace(/^\d+\.\s/, ''))}</li>);
     }
    // Headings within content (less common, but handle basic ###)
    else if (trimmedLine.startsWith('### ')) {
      closeList();
      elements.push(<h3 key={index} className="text-lg font-semibold mt-4 mb-2">{renderLine(trimmedLine.substring(4))}</h3>);
    }
     else if (trimmedLine.startsWith('## ')) { // Handle ## if used within section content
      closeList();
      elements.push(<h2 key={index} className="text-xl font-semibold mt-5 mb-3">{renderLine(trimmedLine.substring(3))}</h2>);
     }
    // Paragraphs (non-empty lines that are not lists or headings)
    else if (trimmedLine !== '') {
      closeList();
      elements.push(<p key={index} className="mb-3">{renderLine(line)}</p>); // Render original line to preserve indentation if needed, or use trimmedLine
    }
     // Empty line - potentially signifies paragraph break, handled by default spacing or explicit <br> if needed
     else {
       // Could add a <br /> or just rely on paragraph margins if consecutive empty lines aren't significant
       closeList(); // Close list if an empty line breaks it
       // Optionally add spacing for empty lines if desired: elements.push(<div key={index} className="h-4"></div>);
     }
  });

  closeList(); // Ensure the last list is closed

  return <>{elements}</>;
};

// PRD Workbench component that displays the PRD document
const PRDWorkbench = () => {
  const showWorkbench = useStore(workbenchStore.showWorkbench);
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [showOutline, setShowOutline] = useState(true); // Default to showing outline
  const contentRef = useRef<HTMLDivElement>(null);
  
  // Replace static sample data with state that can be updated from chat
  const [prdDocument, setPrdDocument] = useState<PRDDocument | null>(null); // Initialize as null

  // Set the chat type to 'prd' when the PRD workbench is shown
  useEffect(() => {
    if (showWorkbench) {
      // Set the chat type to 'prd' when the PRD workbench is shown
      chatType.set('prd');
      logger.debug('Workbench visible: Chat type set to PRD');
    }
  }, [showWorkbench]);

  // Load PRD from sessionStorage and listen for changes
  useEffect(() => {
    const loadPrd = () => {
      try {
        const storedPRD = sessionStorage.getItem('current_prd');
        if (storedPRD) {
          const parsedPRD = JSON.parse(storedPRD);
          // Basic validation
          if (parsedPRD && typeof parsedPRD.title === 'string' && Array.isArray(parsedPRD.sections)) {
              // Check if the document has actually changed before updating state
              // This avoids unnecessary re-renders if parsing yields the same object structure
              setPrdDocument(currentDoc => {
                  if (JSON.stringify(currentDoc) !== JSON.stringify(parsedPRD)) {
                     logger.debug('PRD updated from sessionStorage:', parsedPRD.title);
                     return parsedPRD;
                  }
                  return currentDoc; // No change
              });

          } else {
             logger.warn('Invalid PRD structure found in sessionStorage');
             setPrdDocument(null); // Clear if invalid
             // sessionStorage.removeItem('current_prd'); // Keep potentially partial data? Or remove? Let's remove.
             sessionStorage.removeItem('current_prd');
          }
        } else {
           // Only set to null if it's not already null
           setPrdDocument(currentDoc => currentDoc !== null ? null : currentDoc);
           // logger.debug('No PRD found in sessionStorage.'); // Can be noisy
        }
      } catch (error) {
        logger.error('Error loading PRD from sessionStorage:', error);
        setPrdDocument(null); // Clear on error
        sessionStorage.removeItem('current_prd'); // Remove potentially corrupted data
      }
    };

    loadPrd(); // Initial load

    // Listen for storage events to update PRD if changed in another tab/window
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'current_prd' && event.storageArea === sessionStorage) {
        logger.debug('sessionStorage changed (event), reloading PRD for workbench.');
        loadPrd();
      }
    };
    window.addEventListener('storage', handleStorageChange);

    // Interval as fallback for same-tab updates (polling mechanism)
    // A shorter interval makes updates appear faster, but increases polling frequency.
    const intervalId = setInterval(loadPrd, 500); // Check every 500ms for faster updates

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(intervalId);
    };
  }, []); // Removed dependencies, this setup should run once on mount

  // Function to scroll to a specific section when navigating from chat
  useEffect(() => {
    if (!prdDocument) return; // Don't run if no PRD loaded

    // Check if we need to scroll to a section based on URL hash or other trigger
    const hash = window.location.hash;
    if (hash && (hash === '#title' || hash.startsWith('#section-'))) {
      const elementId = hash.substring(1); // Remove #
      setActiveSection(elementId === 'title' ? null : elementId); // Set active outline item
      setTimeout(() => {
        // Scroll the container, not the window
        const container = contentRef.current?.querySelector('.bg-white.rounded-lg.shadow-lg');
        const element = document.getElementById(elementId);
        if (container && element) {
           // Calculate position relative to the container
           const elementTop = element.offsetTop;
           const containerTop = (container as HTMLElement).offsetTop; // Adjust if container isn't the direct parent
           container.scrollTo({ top: elementTop - containerTop - 20, behavior: 'smooth' }); // Adjust offset as needed
           logger.debug(`Scrolling to element: ${elementId}`);
        } else {
           logger.warn(`Element or container not found for scrolling: ${elementId}`);
        }
      }, 300); // Increased delay slightly
    }
  }, [prdDocument]); // Rerun when PRD document updates

  // Function to handle section editing
  const startEditing = (sectionId: string) => {
     if (!prdDocument) return;
    const section = prdDocument.sections.find(s => s.id === sectionId);
    if (section) {
      setEditContent(section.content);
      setEditMode(true);
      setActiveSection(sectionId);
    }
  };

  // Function to save edited section
  const saveEdits = () => {
    if (!activeSection || !prdDocument) return;

    setPrdDocument(current => {
      if (!current) return null; // Should not happen if activeSection is set

      const updatedSections = current.sections.map(section =>
        section.id === activeSection
          ? { ...section, content: editContent }
          : section
      );

      const updated = {
        ...current,
        sections: updatedSections,
        lastUpdated: new Date().toISOString()
      };

      // Save to sessionStorage - this should trigger the listener to update state
      sessionStorage.setItem('current_prd', JSON.stringify(updated));
      logger.debug('PRD section saved to sessionStorage.');

      // Optimistically update state directly as well? Storage event might have delay.
      // return updated;
      // Let the storage event handler update the state for consistency
       return current; // Return current state, let storage listener handle update
    });

    setEditMode(false);
    setActiveSection(null); // Deselect section after saving
    toast.success('Section updated successfully');
  };


  // Function to export PRD as markdown
  const exportPRDAsMarkdown = () => {
     if (!prdDocument) {
       toast.error("No PRD document loaded to export.");
       return;
     }
    let markdown = `# ${prdDocument.title}\n\n`;
    // Include description if it exists
    if (prdDocument.description) {
      markdown += `${prdDocument.description}\n\n`; // Assuming description is plain text or simple markdown
    }
    // Add separator before sections if description exists
    if (prdDocument.description && prdDocument.sections.length > 0) {
      markdown += '---\n\n';
    }

    prdDocument.sections.forEach(section => {
      markdown += `## ${section.title}\n\n${section.content}\n\n`; // Content is already markdown
    });

    // Create and download file
    const blob = new Blob([markdown.trim()], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${prdDocument.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Function to export PRD as HTML
  const exportPRDAsHTML = () => {
     if (!prdDocument) {
       toast.error("No PRD document loaded to export.");
       return;
     }
    // Simple HTML template with improved styling and basic markdown conversion
    const renderContentToHtml = (content: string): string => {
      // Basic conversion: paragraphs, bold, italics, lists
      let htmlContent = content
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
        .replace(/\*(.*?)\*/g, '<em>$1</em>')     // Italics
        .split('\n')
        .map(line => line.trim())
        .reduce((acc, line) => {
          if (line.startsWith('- ') || line.startsWith('* ') || line.startsWith('• ')) {
            const item = `<li>${line.substring(2)}</li>`;
            if (acc.lastType === 'ul') acc.html += item;
            else acc.html += `<ul>${item}`;
            acc.lastType = 'ul';
          } else if (/^\d+\.\s/.test(line)) {
            const item = `<li>${line.replace(/^\d+\.\s/, '')}</li>`;
            if (acc.lastType === 'ol') acc.html += item;
            else acc.html += `<ol>${item}`;
            acc.lastType = 'ol';
          } else if (line === '') {
            if (acc.lastType === 'ul') acc.html += '</ul>';
            if (acc.lastType === 'ol') acc.html += '</ol>';
            acc.lastType = null;
            // Maybe add <br> or rely on p margins
          } else {
             if (acc.lastType === 'ul') acc.html += '</ul>';
             if (acc.lastType === 'ol') acc.html += '</ol>';
             acc.html += `<p>${line}</p>`;
             acc.lastType = 'p';
          }
          return acc;
        }, { html: '', lastType: null as ('ul' | 'ol' | 'p' | null) });

      // Close any open list at the end
      if (htmlContent.lastType === 'ul') htmlContent.html += '</ul>';
      if (htmlContent.lastType === 'ol') htmlContent.html += '</ol>';

      return htmlContent.html;
    };


    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${prdDocument.title}</title>
  <style>
    body { font-family: sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 20px auto; padding: 0 15px; }
    h1 { color: #2563eb; border-bottom: 1px solid #eee; padding-bottom: 10px; margin-top: 0; }
    h2 { color: #111; margin-top: 40px; border-bottom: 1px solid #eee; padding-bottom: 5px; }
    .description { color: #555; margin-bottom: 30px; font-size: 1.1em; }
    .section { margin-bottom: 30px; }
    p { margin-bottom: 1em; }
    ul, ol { margin-bottom: 1em; padding-left: 2em; }
    li { margin-bottom: 0.5em; }
    strong { font-weight: bold; }
    em { font-style: italic; }
    .meta { font-size: 0.85em; color: #777; text-align: right; margin-top: 50px; border-top: 1px solid #eee; padding-top: 10px;}
  </style>
</head>
<body>
  <h1>${prdDocument.title}</h1>
  ${prdDocument.description ? `<div class="description">${renderContentToHtml(prdDocument.description)}</div>` : ''}

  ${prdDocument.sections.map(section => `
  <div class="section" id="${section.id}">
    <h2>${section.title}</h2>
    <div>${renderContentToHtml(section.content)}</div>
  </div>
  `).join('')}

  <div class="meta">Last updated: ${new Date(prdDocument.lastUpdated).toLocaleString()}</div>
</body>
</html>`;

    // Create and download file
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${prdDocument.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };


  // Handle zoom in/out
  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 0.1, 1.5));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 0.1, 0.7));
  const handleZoomReset = () => setZoomLevel(1);

  // Generate outline items only if prdDocument is loaded
  const outlineItems = prdDocument ? [
    { id: 'title', title: prdDocument.title || 'Overview' }, // Use PRD title
    ...prdDocument.sections.map((section) => ({
      id: section.id,
      title: section.title,
    }))
  ] : [];

  // Handle initial state and loading
  if (!showWorkbench) return null;


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
        width: 'var(--workbench-width)', // Controlled by animation
      }}
    >
      <div className="h-full flex flex-col">
        {/* Toolbar */}
        <div className="flex justify-between items-center p-3 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 flex-shrink-0">
          <div className="flex items-center gap-2 overflow-hidden">
            <IconButton
              title="Toggle Outline"
              onClick={() => setShowOutline(!showOutline)}
              className={classNames("text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary flex-shrink-0", {
                "bg-bolt-elements-background-depth-3": showOutline
              })}
            >
              <div className="i-ph:sidebar" />
            </IconButton>
            <span className="text-sm font-medium text-bolt-elements-textPrimary truncate flex-shrink min-w-0">
              {prdDocument?.title || 'PRD Workbench'}
            </span>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            <IconButton title="Zoom Out" onClick={handleZoomOut} disabled={!prdDocument} className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary disabled:opacity-50">
              <div className="i-ph:minus" />
            </IconButton>
            <span className="text-xs text-bolt-elements-textSecondary px-1 w-10 text-center">
              {prdDocument ? `${Math.round(zoomLevel * 100)}%` : '-'}
            </span>
            <IconButton title="Zoom In" onClick={handleZoomIn} disabled={!prdDocument} className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary disabled:opacity-50">
              <div className="i-ph:plus" />
            </IconButton>
            <IconButton title="Reset Zoom" onClick={handleZoomReset} disabled={!prdDocument} className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary ml-1 disabled:opacity-50">
              <div className="i-ph:frame-corners" />
            </IconButton>

            <div className="h-4 mx-2 border-r border-bolt-elements-borderColor"></div>

            <IconButton title="Export as Markdown" onClick={exportPRDAsMarkdown} disabled={!prdDocument} className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary disabled:opacity-50">
              <div className="i-ph:file-markdown" />
            </IconButton>
            <IconButton title="Export as HTML" onClick={exportPRDAsHTML} disabled={!prdDocument} className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary disabled:opacity-50">
              <div className="i-ph:file-html" />
            </IconButton>
          </div>
        </div>

        {/* Main content area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Outline sidebar */}
          {showOutline && (
            <div className="w-64 border-r border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 overflow-y-auto flex-shrink-0">
               {prdDocument ? (
                 <div className="p-4">
                   <h3 className="text-sm font-medium text-bolt-elements-textPrimary mb-3">Document Outline</h3>
                   <ul className="space-y-1">
                     {outlineItems.map((item) => (
                       <li key={item.id}>
                         <button
                           onClick={() => {
                             const targetElement = document.getElementById(item.id);
                             if (targetElement) {
                               setActiveSection(item.id === 'title' ? null : item.id);
                               // Scroll container logic (simplified)
                               const container = contentRef.current?.querySelector('.bg-white.rounded-lg.shadow-lg');
                               if(container) {
                                   const elementTop = targetElement.offsetTop;
                                   container.scrollTo({ top: elementTop - 30, behavior: 'smooth' }); // Adjust offset
                               }
                             }
                           }}
                           className={classNames(
                             "w-full text-left py-1.5 px-2 rounded-md flex items-center justify-between text-sm transition-colors",
                             (activeSection === item.id || (activeSection === null && item.id === 'title')) // Highlight title when activeSection is null
                               ? "bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary font-medium"
                               : "hover:bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary"
                           )}
                         >
                           <span className="truncate">{item.title}</span>
                         </button>
                       </li>
                     ))}
                   </ul>

                   <div className="mt-6 p-3 bg-bolt-elements-background-depth-2 rounded-lg">
                     <h4 className="text-xs font-medium text-bolt-elements-textPrimary mb-2">Document Info</h4>
                     <div className="text-xs text-bolt-elements-textSecondary space-y-1">
                       <div>Sections: {prdDocument.sections.length}</div>
                       <div>Last Updated: {new Date(prdDocument.lastUpdated).toLocaleDateString()}</div>
                       {/* Simple word count */}
                       <div>Word count: {
                         [prdDocument.description, ...prdDocument.sections.map(s => s.content)]
                           .join(' ')
                           .split(/\s+/)
                           .filter(Boolean)
                           .length
                       }</div>
                     </div>
                   </div>
                 </div>
               ) : (
                  <div className="p-4 text-center text-sm text-bolt-elements-textTertiary mt-10">
                     No PRD loaded. Generate one using the PRD Assistant.
                  </div>
               )}
            </div>
          )}

          {/* Document viewer */}
          <div
              ref={contentRef} // Ref for the scrollable container
              className="flex-1 flex flex-col overflow-auto bg-bolt-elements-background-depth-2 p-4 md:p-6 lg:p-8" // Added padding, overflow-auto
           >
             {prdDocument ? (
               <div
                 className="bg-white rounded-lg shadow-lg transition-transform w-full max-w-4xl mx-auto" // Use max-width, remove fixed width
                 style={{
                   transform: `scale(${zoomLevel})`,
                   transformOrigin: 'top center',
                 }}
               >
                 {/* Single page PRD document */}
                 <div className="p-6 md:p-8 lg:p-12"> {/* Added responsive padding */}
                   {/* Title and description */}
                   <div id="title" className="mb-8 lg:mb-12 border-b border-gray-200 pb-6 lg:pb-8">
                     <div className="flex justify-between items-center mb-4">
                         <span className="text-sm font-medium text-bolt-elements-textSecondary">
                            Product Requirements Document
                         </span>
                         <div className="text-xs text-bolt-elements-textTertiary">
                           Last updated: {new Date(prdDocument.lastUpdated).toLocaleString()}
                         </div>
                     </div>
                     <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-bolt-elements-textPrimary mb-3 text-center">{prdDocument.title}</h1>
                     {prdDocument.description && (
                         <div className="prose prose-bolt max-w-none text-bolt-elements-textSecondary text-center mt-4">
                            <SimpleMarkdownRenderer content={prdDocument.description} />
                         </div>
                     )}
                   </div>

                   {/* Sections */}
                   {prdDocument.sections.map((section, index) => (
                     <div key={section.id} id={section.id} className="mb-8 lg:mb-10">
                       <div className="flex justify-between items-center mb-4 group">
                         <h2 className="text-xl md:text-2xl font-semibold text-bolt-elements-textPrimary flex items-center">
                           {/* Optional section numbering */}
                            {/* <span className="inline-flex justify-center items-center w-7 h-7 rounded-full bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary mr-3 text-sm">
                             {index + 1}
                            </span> */}
                           {section.title}
                         </h2>
                         {!editMode && (
                           <IconButton
                             title={editMode && activeSection === section.id ? "Cancel editing" : "Edit section"}
                             onClick={() => {
                               if (editMode && activeSection === section.id) {
                                 setEditMode(false);
                                 setActiveSection(null);
                               } else {
                                 startEditing(section.id);
                               }
                             }}
                              // Show edit button on hover
                             className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary opacity-0 group-hover:opacity-100 transition-opacity"
                           >
                             <div className="i-ph:pencil-simple" />
                           </IconButton>
                         )}
                       </div>

                       {editMode && activeSection === section.id ? (
                         <div className="mb-4">
                           <textarea
                             value={editContent}
                             onChange={(e) => setEditContent(e.target.value)}
                             rows={15} // Adjust rows as needed
                             className="w-full p-4 border border-bolt-elements-borderColor rounded-lg bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary focus:outline-none focus:ring-1 focus:ring-bolt-elements-borderColorFocus"
                           />
                           <div className="flex justify-end mt-2 gap-2">
                             <button
                               onClick={() => { setEditMode(false); setActiveSection(null); }}
                               className="px-4 py-2 bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary rounded-md text-sm transition-colors"
                             >
                               Cancel
                             </button>
                             <button
                               onClick={saveEdits}
                               className="px-4 py-2 bg-bolt-elements-background-accent hover:bg-bolt-elements-background-accentHover text-bolt-elements-textOnAccent rounded-md text-sm transition-colors"
                             >
                               Save Changes
                             </button>
                           </div>
                         </div>
                       ) : (
                         // Use the improved renderer for section content
                         <div className="prose prose-bolt max-w-none text-bolt-elements-textPrimary">
                            <SimpleMarkdownRenderer content={section.content} />
                         </div>
                       )}
                     </div>
                   ))}
                 </div>
               </div>
              ) : (
                 // Placeholder when no PRD is loaded
                 <div className="flex-1 flex items-center justify-center">
                     <div className="text-center p-10">
                         <div className="i-ph:clipboard-text text-6xl text-bolt-elements-textTertiary mb-6 mx-auto"></div>
                         <h3 className="text-xl font-semibold text-bolt-elements-textPrimary mb-2">No PRD Loaded</h3>
                         <p className="text-bolt-elements-textSecondary max-w-md">
                           Use the PRD Assistant chat to generate or load a Product Requirements Document.
                           It will appear here.
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