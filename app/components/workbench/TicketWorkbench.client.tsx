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
      elements.push(<p key={index} className="mb-3">{renderLine(trimmedLine)}</p>);
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
  const [showFilterSidebar, setShowFilterSidebar] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  
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

  // Filter tickets based on search term and filters
  const filteredTickets = tickets.filter(ticket => {
    const matchesSearch = searchTerm === '' || 
      ticket.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ticket.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === null || ticket.status === statusFilter;
    const matchesPriority = priorityFilter === null || ticket.priority === priorityFilter;
    const matchesType = typeFilter === null || ticket.type === typeFilter;
    
    return matchesSearch && matchesStatus && matchesPriority && matchesType;
  });

  // Get unique values for filters
  const statuses = [...new Set(tickets.map(ticket => ticket.status))];
  const priorities = [...new Set(tickets.map(ticket => ticket.priority))];
  const types = [...new Set(tickets.map(ticket => ticket.type))];

  // Calculate statistics for the sidebar
  const ticketStats = {
    total: filteredTickets.length,
    open: filteredTickets.filter(t => t.status === 'Open').length,
    inProgress: filteredTickets.filter(t => t.status === 'In Progress').length,
    closed: filteredTickets.filter(t => t.status === 'Closed').length,
  };

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
        width: 'var(--workbench-width)',
      }}
    >
      <div className="h-full flex flex-col">
        {/* Toolbar */}
        <div className="flex justify-between items-center p-3 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 flex-shrink-0">
          <div className="flex items-center gap-2 overflow-hidden">
            <IconButton
              title="Toggle Filters"
              onClick={() => setShowFilterSidebar(!showFilterSidebar)}
              className={classNames("text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary flex-shrink-0", {
                "bg-bolt-elements-background-depth-3": showFilterSidebar
              })}
            >
              <div className="i-ph:funnel" />
            </IconButton>
            <span className="text-sm font-medium text-bolt-elements-textPrimary truncate flex-shrink min-w-0">
              Ticket Workbench
            </span>
            <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary flex-shrink-0">
              {filteredTickets.length}
            </span>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            <IconButton title="Zoom Out" onClick={handleZoomOut} disabled={tickets.length === 0} className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary disabled:opacity-50">
              <div className="i-ph:minus" />
            </IconButton>
            <span className="text-xs text-bolt-elements-textSecondary px-1 w-10 text-center">
              {tickets.length > 0 ? `${Math.round(zoomLevel * 100)}%` : '-'}
            </span>
            <IconButton title="Zoom In" onClick={handleZoomIn} disabled={tickets.length === 0} className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary disabled:opacity-50">
              <div className="i-ph:plus" />
            </IconButton>
            <IconButton title="Reset Zoom" onClick={handleZoomReset} disabled={tickets.length === 0} className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary ml-1 disabled:opacity-50">
              <div className="i-ph:frame-corners" />
            </IconButton>

            <div className="h-4 mx-2 border-r border-bolt-elements-borderColor"></div>

            <IconButton title="Export as JSON" onClick={exportTicketsAsJSON} disabled={tickets.length === 0} className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary disabled:opacity-50">
              <div className="i-ph:file-json" />
            </IconButton>
            <IconButton title="Export as CSV" onClick={exportTicketsAsCSV} disabled={tickets.length === 0} className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary disabled:opacity-50">
              <div className="i-ph:file-csv" />
            </IconButton>
          </div>
        </div>

        {/* Main content area */}
        <div className="flex-1 flex overflow-hidden">
          {showFilterSidebar && (
            <div className="w-64 border-r border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 overflow-y-auto flex-shrink-0">
               <div className="p-4">
                 <h3 className="text-sm font-medium text-bolt-elements-textPrimary mb-3">Filters & Search</h3>
                 <div className="mb-4">
                   <div className="relative">
                     <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                       <div className="i-ph:magnifying-glass text-bolt-elements-textTertiary" />
                     </div>
                     <input
                       type="text"
                       placeholder="Search title/desc..."
                       value={searchTerm}
                       onChange={(e) => setSearchTerm(e.target.value)}
                       className="block w-full pl-10 pr-3 py-2 text-sm border border-bolt-elements-borderColor rounded-md bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary focus:outline-none focus:ring-1 focus:ring-bolt-elements-borderColorFocus"
                     />
                   </div>
                 </div>

                 <div className="space-y-3 mb-4">
                   <div>
                     <label className="block text-xs font-medium text-bolt-elements-textSecondary mb-1">Status</label>
                     <div className="relative">
                       <select
                         value={statusFilter || ''}
                         onChange={(e) => setStatusFilter(e.target.value || null)}
                         className="block w-full pl-3 pr-8 py-1.5 text-sm border border-bolt-elements-borderColor rounded-md bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary focus:outline-none focus:ring-1 focus:ring-bolt-elements-borderColorFocus appearance-none"
                       >
                         <option value="">All</option>
                         {statuses.map(status => (
                           <option key={status} value={status}>{status}</option>
                         ))}
                       </select>
                       <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                         <div className="i-ph:caret-down text-bolt-elements-textTertiary" />
                       </div>
                     </div>
                   </div>
                   <div>
                      <label className="block text-xs font-medium text-bolt-elements-textSecondary mb-1">Priority</label>
                      <div className="relative">
                         <select
                           value={priorityFilter || ''}
                           onChange={(e) => setPriorityFilter(e.target.value || null)}
                           className="block w-full pl-3 pr-8 py-1.5 text-sm border border-bolt-elements-borderColor rounded-md bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary focus:outline-none focus:ring-1 focus:ring-bolt-elements-borderColorFocus appearance-none"
                         >
                           <option value="">All</option>
                           {priorities.map(priority => (
                             <option key={priority} value={priority}>{priority}</option>
                           ))}
                         </select>
                         <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                            <div className="i-ph:caret-down text-bolt-elements-textTertiary" />
                         </div>
                      </div>
                   </div>
                   <div>
                      <label className="block text-xs font-medium text-bolt-elements-textSecondary mb-1">Type</label>
                       <div className="relative">
                         <select
                           value={typeFilter || ''}
                           onChange={(e) => setTypeFilter(e.target.value || null)}
                           className="block w-full pl-3 pr-8 py-1.5 text-sm border border-bolt-elements-borderColor rounded-md bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary focus:outline-none focus:ring-1 focus:ring-bolt-elements-borderColorFocus appearance-none"
                         >
                           <option value="">All</option>
                           {types.map(type => (
                             <option key={type} value={type}>{type}</option>
                           ))}
                         </select>
                         <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                           <div className="i-ph:caret-down text-bolt-elements-textTertiary" />
                         </div>
                       </div>
                   </div>
                 </div>

                 {(searchTerm || statusFilter || priorityFilter || typeFilter) && (
                   <button
                     onClick={() => {
                       setSearchTerm('');
                       setStatusFilter(null);
                       setPriorityFilter(null);
                       setTypeFilter(null);
                     }}
                     className="w-full px-3 py-1.5 text-sm border border-bolt-elements-borderColor rounded-md bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 focus:outline-none"
                   >
                     Clear Filters
                   </button>
                 )}

                 <div className="mt-6 p-3 bg-bolt-elements-background-depth-2 rounded-lg">
                   <h4 className="text-xs font-medium text-bolt-elements-textPrimary mb-2">Filtered Tickets</h4>
                   <div className="text-xs text-bolt-elements-textSecondary space-y-1">
                     <div>Total: {ticketStats.total}</div>
                     <div>Open: {ticketStats.open}</div>
                     <div>In Progress: {ticketStats.inProgress}</div>
                     <div>Closed: {ticketStats.closed}</div>
                   </div>
                 </div>
               </div>
            </div>
          )}

          <div
              ref={contentRef}
              className="flex-1 flex flex-col overflow-auto bg-bolt-elements-background-depth-2 p-4 md:p-6 lg:p-8"
           >
             {tickets.length > 0 ? (
               <div
                 className="bg-white rounded-lg shadow-lg transition-transform w-full max-w-4xl mx-auto"
                 style={{
                   transform: `scale(${zoomLevel})`,
                   transformOrigin: 'top center',
                 }}
               >
                  <div className="p-6 md:p-8 lg:p-10">
                    <div className="space-y-6">
                      {filteredTickets.map(ticket => (
                        <div
                          key={ticket.id}
                          className="p-4 border border-gray-200 rounded-lg bg-gray-50/50 group hover:border-gray-300 transition-colors shadow-sm"
                        >
                          <div className="flex justify-between items-start mb-3">
                            <h2 className="text-xl font-semibold text-gray-800 flex items-center">
                              <span className="mr-2 text-gray-500">#{ticket.id}</span>
                              {ticket.title}
                            </h2>
                            {!editMode && (
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
                                className="text-gray-500 hover:text-gray-700 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <div className="i-ph:pencil-simple" />
                              </IconButton>
                            )}
                          </div>

                          {editMode && activeTicketId === ticket.id ? (
                            <div className="mb-4">
                              <textarea
                                value={editContent}
                                onChange={(e) => setEditContent(e.target.value)}
                                rows={15}
                                className="w-full p-3 border border-gray-300 rounded-lg bg-white text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-sm"
                              />
                              <div className="flex justify-end mt-2 gap-2">
                                <button
                                  onClick={() => { setEditMode(false); setActiveTicketId(null); }}
                                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-md text-sm transition-colors"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={saveEdits}
                                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm transition-colors"
                                >
                                  Save Changes
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="mb-4">
                                <div className="prose prose-bolt max-w-none text-gray-700">
                                  <SimpleMarkdownRenderer content={ticket.description} />
                                </div>
                              </div>

                              <div className="flex flex-wrap gap-2 mb-3">
                                <span className="px-2 py-1 text-xs rounded-md bg-gray-100 text-gray-600">
                                  Type: {ticket.type}
                                </span>
                                <span className={classNames(
                                  "px-2 py-1 text-xs rounded-md",
                                  ticket.priority === 'High' ? "bg-red-100 text-red-700" :
                                  ticket.priority === 'Medium' ? "bg-yellow-100 text-yellow-700" :
                                  "bg-blue-100 text-blue-700"
                                )}>
                                  Priority: {ticket.priority}
                                </span>
                                <span className={classNames(
                                  "px-2 py-1 text-xs rounded-md",
                                  ticket.status === 'Open' ? "bg-green-100 text-green-700" :
                                  ticket.status === 'In Progress' ? "bg-purple-100 text-purple-700" :
                                  ticket.status === 'Closed' ? "bg-gray-200 text-gray-600" :
                                  "bg-gray-100 text-gray-600"
                                )}>
                                  Status: {ticket.status}
                                </span>
                                {ticket.assignee && (
                                  <span className="px-2 py-1 text-xs rounded-md bg-gray-100 text-gray-600">
                                    Assignee: {ticket.assignee}
                                  </span>
                                )}
                              </div>

                              {ticket.tags && ticket.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mb-3">
                                  {ticket.tags.map(tag => (
                                    <span
                                      key={tag}
                                      className="px-2 py-0.5 text-xs rounded-full bg-gray-200 text-gray-700"
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}

                              <div className="text-xs text-gray-500">
                                <span>Created: {new Date(ticket.createdAt).toLocaleString()}</span>
                                <span className="mx-2">•</span>
                                <span>Updated: {new Date(ticket.updatedAt).toLocaleString()}</span>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                 </div>
               </div>
              ) : (
                 <div className="flex-1 flex items-center justify-center">
                     <div className="text-center p-10">
                         <div className="i-ph:ticket text-6xl text-bolt-elements-textTertiary mb-6 mx-auto"></div>
                         <h3 className="text-xl font-semibold text-bolt-elements-textPrimary mb-2">No Tickets Available</h3>
                         <p className="text-bolt-elements-textSecondary max-w-md">
                           Use the Ticket Assistant chat to generate or load tickets.
                           They will appear here.
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