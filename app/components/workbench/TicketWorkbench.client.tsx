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
import { ticketStreamingState } from '~/lib/stores/streaming';
import TicketStreamingIndicator from '../ui/Ticket/TicketStreamingIndicator';
import { useMediaQuery } from '~/lib/hooks/useMediaQuery';

const logger = createScopedLogger('TicketWorkbench');

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

// Card animation variants
const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.05,
      duration: 0.3,
      ease: cubicEasingFn,
    }
  })
};

// Ticket interfaces
interface Ticket {
  id: string;
  title: string;
  description: string;
  type: string;
  priority: string;
  status: string;
  assignee?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  _manuallyEdited?: boolean;
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
        elements.push(<ul key={`list-${elements.length}`} className="list-disc pl-5 mb-2 space-y-0.5">{listItems}</ul>);
      } else if (listType === 'ol') {
        elements.push(<ol key={`list-${elements.length}`} className="list-decimal pl-5 mb-2 space-y-0.5">{listItems}</ol>);
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
      elements.push(<h3 key={index} className="text-base font-semibold mt-2 mb-1">{renderLine(trimmedLine.substring(4))}</h3>);
    }
     else if (trimmedLine.startsWith('## ')) { // Handle ## if used within section content
      closeList();
      elements.push(<h2 key={index} className="text-lg font-semibold mt-3 mb-1">{renderLine(trimmedLine.substring(3))}</h2>);
     }
    // Paragraphs (non-empty lines that are not lists or headings)
    else if (trimmedLine !== '') {
      closeList();
      elements.push(<p key={index} className="mb-1.5">{renderLine(trimmedLine)}</p>);
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

// Ticket Workbench component that displays the tickets
const TicketWorkbench = () => {
  const showWorkbench = useStore(workbenchStore.showWorkbench);
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const contentRef = useRef<HTMLDivElement>(null);
  const isStreaming = useStore(ticketStreamingState);
  const isMobile = useMediaQuery('(max-width: 768px)');
  
  // State for tickets
  const [tickets, setTickets] = useState<Ticket[]>([]);

  // Load tickets from sessionStorage
  const loadTickets = () => {
    try {
      const storedTickets = sessionStorage.getItem('tickets');
      if (storedTickets) {
        const parsedTickets = JSON.parse(storedTickets);
        // Basic validation
        if (Array.isArray(parsedTickets)) {
          // Check if the tickets have actually changed before updating state
          setTickets(currentTickets => {
            if (JSON.stringify(currentTickets) !== JSON.stringify(parsedTickets)) {
              logger.debug('Tickets loaded from sessionStorage.');
              return parsedTickets;
            }
            return currentTickets;
          });
        } else {
          logger.error('Invalid tickets data structure in sessionStorage.');
          sessionStorage.removeItem('tickets');
        }
      } else {
        // Only set to empty array if it's not already empty
        setTickets(currentTickets => currentTickets.length > 0 ? [] : currentTickets);
      }
    } catch (error) {
      logger.error('Error loading tickets from sessionStorage:', error);
      setTickets([]);
      sessionStorage.removeItem('tickets');
    }
  };

  // Listen for storage events to update tickets if changed in another tab/window
  const handleStorageChange = (event: StorageEvent) => {
    if (event.key === 'tickets') {
      loadTickets();
    }
  };

  // Load tickets on initial render
  useEffect(() => {
    loadTickets();
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // Set chat type to 'ticket' when Ticket workbench is shown
  useEffect(() => {
    if (showWorkbench) {
      chatType.set('ticket');
      logger.debug('Ticket Workbench visible: Chat type set to ticket');
    }
  }, [showWorkbench]);

  // Force load tickets on mobile
  useEffect(() => {
    if (isMobile) {
      // Force workbench to be shown on mobile
      workbenchStore.showWorkbench.set(true);
      
      // Ensure tickets are loaded
      loadTickets();
      
      // Log for debugging
      logger.debug('Mobile view: forcing ticket display');
      
      // Log current tickets for debugging
      const storedTickets = sessionStorage.getItem('tickets');
      logger.debug('Stored tickets:', storedTickets ? 'Found' : 'None');
    }
  }, [isMobile]);
  
  // Debug output for tickets
  useEffect(() => {
    if (isMobile) {
      logger.debug(`Mobile view: ${tickets.length} tickets loaded`);
    }
  }, [tickets, isMobile]);

  // Function to handle ticket editing
  const startEditing = (ticketId: string) => {
    if (tickets.length === 0) return;
    const ticket = tickets.find(t => t.id === ticketId);
    if (ticket) {
      // Format the ticket nicely for editing (like PRD)
      const ticketString = JSON.stringify(
          ticket,
          (key, value) => (key === 'description' ? value : value), // Keep description as is
          2 // Indentation
      );
      setEditContent(ticketString);
      setEditMode(true);
      setActiveTicketId(ticketId);
    }
  };

  // Function to save edited ticket
  const saveEdits = () => {
    if (!activeTicketId || tickets.length === 0) return;

    try {
      const editedTicketData = JSON.parse(editContent);
      const now = new Date().toISOString();

      setTickets(current => {
         const updatedTickets = current.map(ticket =>
             ticket.id === activeTicketId
             ? { 
                 ...ticket, 
                 ...editedTicketData, 
                 updatedAt: now,
                 _manuallyEdited: true // Add flag to indicate this was manually edited
               }
             : ticket
         );

        // Save to sessionStorage
        sessionStorage.setItem('tickets', JSON.stringify(updatedTickets));
        logger.debug('Ticket saved to sessionStorage.');
        
        // Notify the workbench store that tickets have been updated
        // This is critical to ensure the edited version is treated as authoritative
        workbenchStore.updateTickets(now);
        
        // Trigger storage event for other listeners (like chat)
        window.dispatchEvent(new StorageEvent('storage', { 
          key: 'tickets', 
          storageArea: sessionStorage,
          newValue: JSON.stringify(updatedTickets)
        }));

        return updatedTickets;
      });

      setEditMode(false);
      setActiveTicketId(null);
      toast.success('Ticket updated successfully');
    } catch (error) {
      logger.error('Error parsing edited ticket JSON:', error);
      toast.error('Invalid JSON format. Please check your edits.');
    }
  };

  // Function to export tickets as JSON
  const exportTicketsAsJSON = () => {
    if (tickets.length === 0) {
      toast.error("No tickets available to export.");
      return;
    }

    // Create and download file
    const blob = new Blob([JSON.stringify(tickets, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tickets-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success('Tickets exported as JSON');
  };

  // Function to export tickets as CSV
  const exportTicketsAsCSV = () => {
    if (tickets.length === 0) {
      toast.error("No tickets available to export.");
      return;
    }

    // Define CSV headers
    const headers = ['id', 'title', 'description', 'type', 'priority', 'status', 'assignee', 'tags', 'createdAt', 'updatedAt'];
    
    // Convert tickets to CSV rows
    const csvRows = [
      headers.join(','), // Header row
      ...tickets.map(ticket => {
        return headers.map(header => {
          const value = ticket[header as keyof Ticket];
          if (Array.isArray(value)) {
            return `"${value.join(', ')}"`;
          }
          if (typeof value === 'string') {
            // Escape quotes and wrap in quotes
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value || '';
        }).join(',');
      })
    ];

    // Create and download file
    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tickets-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success('Tickets exported as CSV');
  };

  // Handle zoom in/out
  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 0.1, 1.5));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 0.1, 0.7));
  const handleZoomReset = () => setZoomLevel(1);

  // Handle initial state and loading
  if (!showWorkbench && !isMobile) return null; // Only return null on desktop if workbench is hidden

  // For debugging - add a test ticket if none exist on mobile
  const ensureTestTicket = () => {
    if (isMobile && tickets.length === 0) {
      const testTicket = {
        id: "test-1",
        title: "Test Ticket",
        description: "This is a test ticket to verify mobile display",
        type: "Feature",
        priority: "Medium",
        status: "Open",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tags: ["test", "mobile"]
      };
      
      setTickets([testTicket]);
      sessionStorage.setItem('tickets', JSON.stringify([testTicket]));
      return true;
    }
    return false;
  };

  return (
    <motion.div
      variants={isMobile ? {} : workbenchVariants} // Skip animation on mobile
      initial={isMobile ? "open" : "closed"}
      animate={isMobile || showWorkbench ? 'open' : 'closed'}
      className={classNames(
        "h-full bg-bolt-elements-background-depth-1 border-l border-bolt-elements-borderColor overflow-hidden",
        "flex flex-col",
        isMobile ? "w-full fixed inset-0 top-[112px] z-30" : "" // Position fixed on mobile, below nav bars
      )}
    >
      {/* Debug info for mobile */}
      {isMobile && (
        <div className="bg-yellow-100 text-yellow-800 p-2 text-xs">
          {tickets.length > 0 ? 
            `Displaying ${tickets.length} tickets` : 
            <button 
              onClick={ensureTestTicket}
              className="underline"
            >
              No tickets found - Click to create test ticket
            </button>
          }
        </div>
      )}
      
      <div className="flex flex-col h-full">
        {/* Toolbar */}
        <div className="border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-0 p-2 flex items-center justify-between">
          <div className="flex items-center">
            <h2 className="text-bolt-elements-textPrimary font-medium text-sm px-2">
              Tickets {tickets.length > 0 && `(${tickets.length})`}
            </h2>
          </div>
          
          {/* Toolbar buttons - simplified for mobile */}
          <div className="flex items-center gap-1">
            {!isMobile && (
              // Desktop-only controls
              <>
                <IconButton title="Zoom Out" onClick={handleZoomOut} disabled={tickets.length === 0} className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary disabled:opacity-50">
                  <div className="i-ph:minus" />
                </IconButton>
                <IconButton title="Zoom In" onClick={handleZoomIn} disabled={tickets.length === 0} className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary disabled:opacity-50">
                  <div className="i-ph:plus" />
                </IconButton>
                <IconButton title="Reset Zoom" onClick={handleZoomReset} disabled={tickets.length === 0} className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary ml-1 disabled:opacity-50">
                  <div className="i-ph:frame-corners" />
                </IconButton>
                <div className="h-4 mx-2 border-r border-bolt-elements-borderColor"></div>
              </>
            )}
            
            <IconButton title="Export as CSV" onClick={exportTicketsAsCSV} disabled={tickets.length === 0 || isStreaming} className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary disabled:opacity-50">
              <div className="i-ph:file-csv" />
            </IconButton>
          </div>
        </div>

        {/* Streaming indicator */}
        {isStreaming && (
          <div className="w-full bg-bolt-elements-background-depth-1 border-b border-bolt-elements-borderColor">
            <TicketStreamingIndicator />
          </div>
        )}

        {/* Main content area */}
        <div className="flex-1 flex overflow-hidden">
          <div
            ref={contentRef}
            className="flex-1 overflow-auto bg-bolt-elements-background-depth-2 p-3"
          >
            {tickets.length > 0 ? (
              <div
                className="w-full mx-auto"
                style={{
                  transform: isMobile ? 'none' : `scale(${zoomLevel})`, // No zoom on mobile
                  transformOrigin: 'top center',
                }}
              >
                {/* Responsive grid layout for tickets */}
                <div className={classNames(
                  "grid gap-3",
                  isMobile ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3", // Single column on mobile
                  isStreaming ? "opacity-90" : ""
                )}>
                  {tickets.map((ticket, index) => (
                    <motion.div
                      key={ticket.id}
                      custom={index}
                      variants={cardVariants}
                      initial="hidden"
                      animate="visible"
                      className="flex flex-col h-full overflow-hidden bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 border border-gray-100 dark:bg-gray-800 dark:border-gray-700"
                    >
                      {/* Ticket header with colored bar based on priority */}
                      <div className={classNames(
                        "h-1 w-full",
                        ticket.priority === 'High' ? "bg-red-500" :
                        ticket.priority === 'Medium' ? "bg-amber-500" :
                        "bg-blue-500"
                      )} />
                      
                      <div className="flex-1 flex flex-col p-3">
                        {/* Ticket header with ID, title, and edit button */}
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center mb-1">
                              <span className="text-xs font-medium text-gray-500 bg-gray-100 rounded px-1.5 py-0.5 mr-1.5 dark:bg-gray-700 dark:text-gray-300">
                                #{ticket.id}
                              </span>
                              <span className={classNames(
                                "text-xs font-medium rounded px-1.5 py-0.5",
                                ticket.status === 'Open' ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" :
                                ticket.status === 'In Progress' ? "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300" :
                                "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                              )}>
                                {ticket.status}
                              </span>
                            </div>
                            <h2 className="text-base font-semibold text-gray-800 truncate dark:text-gray-200">
                              {ticket.title}
                            </h2>
                          </div>
                          <IconButton
                            title={editMode && activeTicketId === ticket.id ? "Cancel editing" : "Edit ticket"}
                            onClick={() => {
                              if (editMode && activeTicketId === ticket.id) {
                                setEditMode(false);
                                setActiveTicketId(null);
                              } else {
                                startEditing(ticket.id);
                              }
                            }}
                            className="ml-1.5 text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300"
                          >
                            <div className="i-ph:pencil-simple w-3.5 h-3.5" />
                          </IconButton>
                        </div>

                        {/* Ticket content - edit mode or display mode */}
                        {editMode && activeTicketId === ticket.id ? (
                          <div className="flex-1 flex flex-col">
                            <textarea
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              rows={isMobile ? 8 : 12} // Fewer rows on mobile
                              className="flex-1 w-full p-2 border border-gray-300 rounded-lg bg-white text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-xs dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600"
                            />
                            <div className="flex justify-end mt-2 gap-2">
                              <button
                                onClick={() => { setEditMode(false); setActiveTicketId(null); }}
                                className="px-3 py-1 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded text-xs transition-colors dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={saveEdits}
                                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs transition-colors"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {/* Ticket description with scrollable area */}
                            <div className="flex-1 overflow-y-auto mb-2 prose-sm prose-gray max-h-28 text-xs dark:prose-invert">
                              <div className="prose prose-bolt max-w-none text-gray-700 dark:text-gray-300">
                                <SimpleMarkdownRenderer content={ticket.description} />
                              </div>
                            </div>

                            {/* Ticket metadata */}
                            <div className="mt-auto">
                              {/* Tags */}
                              {ticket.tags && ticket.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mb-1.5">
                                  {ticket.tags.map(tag => (
                                    <span
                                      key={tag}
                                      className="px-1.5 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}
                              
                              {/* Ticket properties */}
                              <div className="flex flex-wrap gap-1.5 mb-1.5">
                                <span className="px-1.5 py-0.5 text-xs rounded bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                                  Type: {ticket.type}
                                </span>
                                {ticket.assignee && (
                                  <span className="px-1.5 py-0.5 text-xs rounded bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                                    Assignee: {ticket.assignee}
                                  </span>
                                )}
                              </div>
                              
                              {/* Timestamps - simplified on mobile */}
                              <div className="text-xs text-gray-500 mt-1.5 dark:text-gray-400">
                                {isMobile ? (
                                  <span>Updated: {new Date(ticket.updatedAt).toLocaleDateString()}</span>
                                ) : (
                                  <>
                                    <span>Created: {new Date(ticket.createdAt).toLocaleString()}</span>
                                    <span className="mx-1.5">•</span>
                                    <span>Updated: {new Date(ticket.updatedAt).toLocaleString()}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center p-6">
                  <div className="i-ph:ticket text-5xl text-bolt-elements-textTertiary mb-4 mx-auto"></div>
                  <h3 className="text-lg font-semibold text-bolt-elements-textPrimary mb-1.5">No Tickets Available</h3>
                  <p className="text-bolt-elements-textSecondary max-w-md text-sm">
                    {isMobile ? 
                      "Tap the chat button to generate tickets." : 
                      "Use the Ticket Assistant chat to generate or load tickets."}
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

export default TicketWorkbench;