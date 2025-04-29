import React, { useEffect, useState, useRef } from 'react';
import { motion, type Variants } from 'framer-motion';
import { useStore } from '@nanostores/react';
import { workbenchStore } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';
import { cubicEasingFn } from '~/utils/easings';
import { IconButton } from '~/components/ui/IconButton';
import { createScopedLogger } from '~/utils/logger';
import { toast } from 'react-toastify';
import type { Message } from 'ai';
import { useChatHistory, chatType } from '~/lib/persistence/useChatHistory'; // Import chatType store

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
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [showOutline, setShowOutline] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const { setChatType } = useChatHistory(); // Get the setChatType function from useChatHistory
  
  // Replace static sample data with state that can be updated from chat
  const [prdDocument, setPrdDocument] = useState<PRDDocument>({
    title: 'Untitled PRD',
    description: 'No PRD content available yet. Use the PRD Assistant to generate a PRD.',
    sections: [],
    lastUpdated: new Date().toISOString()
  });

  // Set the chat type to 'prd' when the PRD workbench is shown
  useEffect(() => {
    if (showWorkbench) {
      // Set the chat type to 'prd' when the PRD workbench is shown
      setChatType('prd');
      chatType.set('prd');
      logger.debug('Chat type set to PRD');
    }
  }, [showWorkbench, setChatType]);

  // Load PRD from sessionStorage if available
  useEffect(() => {
    try {
      const storedPRD = sessionStorage.getItem('current_prd');
      if (storedPRD) {
        const parsedPRD = JSON.parse(storedPRD);
        setPrdDocument(parsedPRD);
        logger.debug('PRD loaded from sessionStorage:', parsedPRD.title);
      }
    } catch (error) {
      logger.error('Error loading PRD from sessionStorage:', error);
    }
  }, [showWorkbench]); // Re-check when workbench visibility changes

  // Function to scroll to a specific section when navigating from chat
  useEffect(() => {
    // Check if we need to scroll to a section based on URL hash or other trigger
    const hash = window.location.hash;
    if (hash && hash.startsWith('#section-')) {
      const sectionId = hash.replace('#', '');
      setActiveSection(sectionId);
      setTimeout(() => {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [prdDocument]);

  // Function to handle section editing
  const startEditing = (sectionId: string) => {
    const section = prdDocument.sections.find(s => s.id === sectionId);
    if (section) {
      setEditContent(section.content);
      setEditMode(true);
      setActiveSection(sectionId);
    }
  };

  // Function to save edited section
  const saveEdits = () => {
    if (!activeSection) return;
    
    setPrdDocument(current => {
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
      
      // Save to sessionStorage
      sessionStorage.setItem('current_prd', JSON.stringify(updated));
      
      return updated;
    });
    
    setEditMode(false);
    toast.success('Section updated successfully');
  };

  // Function to export PRD as markdown
  const exportPRDAsMarkdown = () => {
    let markdown = `# ${prdDocument.title}\n\n`;
    markdown += `## Description\n${prdDocument.description}\n\n`;
    
    prdDocument.sections.forEach(section => {
      markdown += `## ${section.title}\n${section.content}\n\n`;
    });
    
    // Create and download file
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${prdDocument.title.replace(/\s+/g, '-').toLowerCase()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Function to export PRD as HTML
  const exportPRDAsHTML = () => {
    // Simple HTML template with some basic styling
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${prdDocument.title}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    h1 {
      color: #2563eb;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 10px;
    }
    h2 {
      color: #4b5563;
      margin-top: 30px;
    }
    .description {
      color: #6b7280;
      font-style: italic;
      margin-bottom: 30px;
    }
    .section {
      margin-bottom: 30px;
      padding: 20px;
      background-color: #f9fafb;
      border-radius: 8px;
    }
    .meta {
      font-size: 0.8em;
      color: #9ca3af;
      text-align: right;
      margin-top: 50px;
    }
  </style>
</head>
<body>
  <h1>${prdDocument.title}</h1>
  <div class="description">${prdDocument.description}</div>
  
  ${prdDocument.sections.map(section => `
  <div class="section" id="${section.id}">
    <h2>${section.title}</h2>
    <div>${section.content.replace(/\n/g, '<br>')}</div>
  </div>
  `).join('')}
  
  <div class="meta">Last updated: ${new Date(prdDocument.lastUpdated).toLocaleString()}</div>
</body>
</html>`;
    
    // Create and download file
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${prdDocument.title.replace(/\s+/g, '-').toLowerCase()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Handle zoom in/out
  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 0.1, 1.5));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 0.1, 0.7));
  const handleZoomReset = () => setZoomLevel(1);

  // Generate outline items
  const outlineItems = [
    { id: 'title', title: 'Title & Overview', },
    ...prdDocument.sections.map((section) => ({
      id: section.id,
      title: section.title,
    }))
  ];

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
        width: showWorkbench ? 'var(--workbench-width)' : 0,
        transition: 'width 0.2s cubic-bezier(0.65, 0, 0.35, 1)'
      }}
    >
      <div className="h-full flex flex-col">
        {/* Toolbar */}
        <div className="flex justify-between items-center p-3 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-1">
          <div className="flex items-center gap-2">
            <IconButton 
              title="Toggle Outline" 
              onClick={() => setShowOutline(!showOutline)}
              className={classNames("text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary", {
                "bg-bolt-elements-background-depth-3": showOutline
              })}
            >
              <div className="i-ph:sidebar" />
            </IconButton>
            <span className="text-sm font-medium text-bolt-elements-textPrimary truncate max-w-[150px]">
              {prdDocument.title}
            </span>
          </div>
          
          <div className="flex items-center gap-1">
            <IconButton title="Zoom Out" onClick={handleZoomOut} className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary">
              <div className="i-ph:minus" />
            </IconButton>
            
            <span className="text-xs text-bolt-elements-textSecondary px-1">
              {Math.round(zoomLevel * 100)}%
            </span>
            
            <IconButton title="Zoom In" onClick={handleZoomIn} className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary">
              <div className="i-ph:plus" />
            </IconButton>
            
            <IconButton title="Reset Zoom" onClick={handleZoomReset} className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary ml-1">
              <div className="i-ph:arrows-in" />
            </IconButton>
            
            <div className="h-4 mx-2 border-r border-bolt-elements-borderColor"></div>
            
            <IconButton title="Export as Markdown" onClick={exportPRDAsMarkdown} className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary">
              <div className="i-ph:file-markdown" />
            </IconButton>
            
            <IconButton title="Export as HTML" onClick={exportPRDAsHTML} className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary">
              <div className="i-ph:file-html" />
            </IconButton>
          </div>
        </div>
        
        {/* Main content area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Outline sidebar */}
          {showOutline && (
            <div className="w-64 border-r border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 overflow-y-auto">
              <div className="p-4">
                <h3 className="text-sm font-medium text-bolt-elements-textPrimary mb-3">Document Outline</h3>
                <ul className="space-y-1">
                  {outlineItems.map((item) => (
                    <li key={item.id}>
                      <button
                        onClick={() => {
                          setActiveSection(item.id === 'title' ? null : item.id);
                          // Scroll to section
                          setTimeout(() => {
                            document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth' });
                          }, 100);
                        }}
                        className={classNames(
                          "w-full text-left py-1.5 px-2 rounded-md flex items-center justify-between text-sm transition-colors",
                          activeSection === item.id
                            ? "bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary"
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
                    <div>Created: {new Date(prdDocument.lastUpdated).toLocaleDateString()}</div>
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
            </div>
          )}
          
          {/* Document viewer - Single page view */}
          <div className="flex-1 flex flex-col overflow-hidden bg-bolt-elements-background-depth-0">
            {/* Document content */}
            <div 
              ref={contentRef}
              className="flex-1 overflow-y-auto p-4 flex justify-center bg-bolt-elements-background-depth-2"
            >
              <div 
                className="bg-white rounded-lg shadow-lg overflow-y-auto transition-transform"
                style={{ 
                  transform: `scale(${zoomLevel})`,
                  width: '800px',
                  maxWidth: '100%',
                  transformOrigin: 'top center',
                  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
                  maxHeight: 'calc(100vh - 120px)'
                }}
              >
                {/* Single page PRD document */}
                <div className="p-8">
                  {/* Title and description */}
                  <div id="title" className="mb-12 border-b border-bolt-elements-borderColor pb-8">
                    <div className="flex justify-end mb-2">
                      <div className="text-xs inline-flex items-center px-2.5 py-1 rounded-full bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary">
                        <span className="i-ph:file-doc mr-1"></span>
                        PRD Document
                      </div>
                    </div>
                    <h1 className="text-3xl font-bold text-bolt-elements-textPrimary mb-4 text-center">{prdDocument.title}</h1>
                    <div className="max-w-2xl mx-auto text-bolt-elements-textSecondary mb-4 whitespace-pre-wrap text-center">
                      {prdDocument.description}
                    </div>
                    <div className="text-sm text-bolt-elements-textTertiary text-center">
                      Last updated: {new Date(prdDocument.lastUpdated).toLocaleString()}
                    </div>
                  </div>
                  
                  {/* Sections */}
                  {prdDocument.sections.map((section, index) => (
                    <div key={section.id} id={section.id} className="mb-10">
                      <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-semibold text-bolt-elements-textPrimary flex items-center">
                          <span className="inline-flex justify-center items-center w-7 h-7 rounded-full bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary mr-3 text-sm">
                            {index + 1}
                          </span>
                          {section.title}
                        </h2>
                        {!editMode && (
                          <IconButton
                            title={editMode && activeSection === section.id ? "Cancel editing" : "Edit section"}
                            onClick={() => {
                              if (editMode && activeSection === section.id) {
                                setEditMode(false);
                              } else {
                                startEditing(section.id);
                              }
                            }}
                            className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
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
                            className="w-full h-64 p-4 border border-bolt-elements-borderColor rounded-lg bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary focus:outline-none focus:ring-1 focus:ring-bolt-elements-borderColorFocus"
                          />
                          <div className="flex justify-end mt-2">
                            <button
                              onClick={() => setEditMode(false)}
                              className="px-4 py-2 mr-2 bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary rounded-md text-sm transition-colors"
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
                        <div className="prose prose-bolt max-w-none whitespace-pre-wrap text-bolt-elements-textPrimary bg-bolt-elements-background-depth-1 p-4 rounded-lg border border-bolt-elements-borderColor">
                          {/* Format section content with Markdown-like rendering */}
                          {section.content.split('\n').map((line, i) => {
                            // Check if line is a bullet point
                            if (line.trim().startsWith('•') || line.trim().startsWith('-') || line.trim().startsWith('*')) {
                              return (
                                <div key={i} className="flex items-start mb-2">
                                  <span className="mr-2 text-bolt-elements-textTertiary">•</span>
                                  <span>{line.trim().substring(1).trim()}</span>
                                </div>
                              );
                            }
                            
                            // Check if line is a heading
                            if (line.trim().startsWith('#')) {
                              const headingMatch = line.trim().match(/^(#+)/);
                              const level = headingMatch ? headingMatch[0].length : 1;
                              const text = line.trim().replace(/^#+\s*/, '');
                              const headingClass = level === 1 
                                ? 'text-lg font-bold mt-4 mb-2' 
                                : 'text-base font-semibold mt-3 mb-1';
                              return <div key={i} className={headingClass}>{text}</div>;
                            }
                            
                            // Check if line is empty (paragraph break)
                            if (line.trim() === '') {
                              return <div key={i} className="h-4"></div>;
                            }
                            
                            // Regular text
                            return <div key={i} className="mb-2">{line}</div>;
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default PRDWorkbench;