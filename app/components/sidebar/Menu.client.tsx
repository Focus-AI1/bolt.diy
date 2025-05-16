import { motion, type Variants } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { Dialog, DialogButton, DialogDescription, DialogRoot, DialogTitle } from '~/components/ui/Dialog';
import { ThemeSwitch } from '~/components/ui/ThemeSwitch';
import { ControlPanel } from '~/components/@settings/core/ControlPanel';
import { SettingsButton } from '~/components/ui/SettingsButton';
import { Button } from '~/components/ui/Button';
import { db, deleteById, getAll, chatId, type ChatHistoryItem, useChatHistory } from '~/lib/persistence';
import { cubicEasingFn } from '~/utils/easings';
import { HistoryItem } from './HistoryItem';
import { binDates } from './date-binning';
import { useSearchFilter } from '~/lib/hooks/useSearchFilter';
import { classNames } from '~/utils/classNames';
import { useStore } from '@nanostores/react';
import { profileStore } from '~/lib/stores/profile';
// Import Clerk components and our custom modal
import { SignedIn, SignedOut, useUser, useClerk } from '@clerk/remix';
import { ClerkAuthModal } from '~/components/auth/ClerkAuthModal';
import { useNavigate } from '@remix-run/react';

// Define the window interface extension for TypeScript
declare global {
  interface Window {
    __USER_DATA__?: {
      name?: string;
      email?: string;
      imageUrl?: string;
    };
  }
}

const menuVariants = {
  closed: {
    opacity: 0,
    visibility: 'hidden',
    left: '-340px',
    transition: {
      duration: 0.2,
      ease: cubicEasingFn,
    },
  },
  open: {
    opacity: 1,
    visibility: 'initial',
    left: 0,
    transition: {
      duration: 0.2,
      ease: cubicEasingFn,
    },
  },
} satisfies Variants;

// Add this function at the top level to communicate with the parent window
function requestUserDataFromParent() {
  try {
    if (window.parent && window.parent !== window) {
      console.log('Requesting user data from parent window');
      window.parent.postMessage({ type: 'REQUEST_USER_DATA' }, '*');
      return true;
    }
  } catch (e) {
    console.error('Error requesting user data from parent:', e);
  }
  return false;
}

// UserButton component 
function UserButton() {
  const [userData, setUserData] = useState<{name?: string; imageUrl?: string; email?: string} | null>(null);
  const profile = useStore(profileStore);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { isLoaded: isUserLoaded, isSignedIn, user } = useUser();
  const { signOut } = useClerk();

  useEffect(() => {
    // Close menu when clicking outside
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }

    // Add event listener when menu is open
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen]);

  useEffect(() => {
    // Initialize: First check window.__USER_DATA__, then listen for messages
    const getUserData = () => {
      // Try to get data from window.__USER_DATA__ first
      if (window.__USER_DATA__) {
        console.log('Found user data in window.__USER_DATA__:', window.__USER_DATA__);
        setUserData(window.__USER_DATA__);
        return true;
      }
      return false;
    };

    // Try to get data immediately
    const found = getUserData();
    if (!found) {
      console.log('No user data found in window.__USER_DATA__, will listen for messages');
      // Immediately request data from parent if not found
      requestUserDataFromParent();
    }
    
    // Set up message listener for receiving user data
    const handleMessage = (event: MessageEvent) => {
      console.log('Received message in focus:', event.data?.type);
      
      // Handle direct user data updates
      if (event.data && event.data.type === 'USER_DATA_UPDATE') {
        console.log('Received user data update:', event.data.userData);
        if (event.data.userData) {
          setUserData(event.data.userData);
        }
      }
      
      // Handle initial connection messages that might contain user data
      if (event.data && (event.data.type === 'INIT_CONNECTION' || event.data.type === 'SET_PROMPT')) {
        if (event.data.userData) {
          console.log('Received user data in connection message:', event.data.userData);
          setUserData(event.data.userData);
        }
      }
    };
    
    // Add message listener
    window.addEventListener('message', handleMessage);
    
    // Let parent know we're ready to receive user data
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'BOLT_READY' }, '*');
        console.log('Sent BOLT_READY message to parent');
      }
    } catch (e) {
      console.error('Error sending ready message to parent:', e);
    }
    
    // Poll for user data every 2 seconds for the first 30 seconds
    // This handles cases where the iframe loads before the parent sets the data
    let attempts = 0;
    const maxAttempts = 15; // 15 attempts * 2 seconds = 30 seconds
    
    const checkInterval = setInterval(() => {
      attempts++;
      if (attempts > maxAttempts || userData) {
        clearInterval(checkInterval);
        return;
      }
      
      const found = getUserData();
      if (found) {
        console.log(`Found user data on attempt ${attempts}`);
        clearInterval(checkInterval);
      } else if (attempts % 3 === 0) {
        // Every 6 seconds (every 3rd attempt), request data from parent
        requestUserDataFromParent();
      }
    }, 2000);
    
    return () => {
      window.removeEventListener('message', handleMessage);
      clearInterval(checkInterval);
    };
  }, []);
  
  // Use Clerk user data if available, then fall back to userData from parent window, then profile store
  const displayName = isSignedIn ? user?.fullName || user?.username : userData?.name || profile?.username || 'Guest User';
  const hasAvatar = isSignedIn ? !!user?.imageUrl : !!userData?.imageUrl || !!profile?.avatar;
  const avatarUrl = isSignedIn ? user?.imageUrl : userData?.imageUrl || profile?.avatar;
  
  // For debugging
  const userSource = isSignedIn ? 'Clerk' : userData ? 'Parent window' : profile?.username ? 'Profile Store' : 'Default';

  // Handler for managing account - opens Clerk user profile if signed in, otherwise shows auth modal
  const handleManageAccount = () => {
    if (isSignedIn) {
      // If signed in with Clerk, use Clerk's user profile
      try {
        window.open('/user/account', '_blank');
        setIsMenuOpen(false);
      } catch (error) {
        console.error('Error opening user account page:', error);
        toast.error('Could not open account management page');
      }
    } else {
      // If not signed in with Clerk, try parent window communication
      try {
        if (window.parent && window.parent !== window) {
          console.log('Sending MANAGE_ACCOUNT message to parent');
          window.parent.postMessage({ type: 'MANAGE_ACCOUNT' }, '*');
          setIsMenuOpen(false);
        } else {
          // Open auth modal if not in iframe
          setIsAuthModalOpen(true);
          setIsMenuOpen(false);
        }
      } catch (error) {
        console.error('Error sending manage account message to parent:', error);
        setIsAuthModalOpen(true);
        setIsMenuOpen(false);
      }
    }
  };

  // Handler for signing out - uses Clerk SignOutButton if signed in, otherwise shows auth modal
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const navigate = useNavigate();
  
  const handleSignOut = () => {
    if (isSignedIn) {
      // If signed in with Clerk, show the sign-out confirmation dropdown
      setShowSignOutConfirm(true);
    } else {
      // If not signed in with Clerk, try parent window communication
      try {
        if (window.parent && window.parent !== window) {
          console.log('Sending SIGN_OUT message to parent');
          window.parent.postMessage({ type: 'SIGN_OUT' }, '*');
          setIsMenuOpen(false);
        } else {
          // Use window.location.href instead of navigate to avoid scroll position issues
          setIsMenuOpen(false);
          window.location.href = '/sign-in';
        }
      } catch (error) {
        console.error('Error sending sign out message to parent:', error);
        window.location.href = '/sign-in';
        setIsMenuOpen(false);
      }
    }
  };
  
  // Close the sign-out confirmation dropdown
  const closeSignOutConfirm = () => {
    setShowSignOutConfirm(false);
  };
  
  // Handle click outside for sign-out dropdown
  useEffect(() => {
    function handleClickOutsideSignOut(event: MouseEvent) {
      if (showSignOutConfirm && menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowSignOutConfirm(false);
      }
    }
    
    if (showSignOutConfirm) {
      document.addEventListener('mousedown', handleClickOutsideSignOut);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutsideSignOut);
    };
  }, [showSignOutConfirm]);
  
  // Handler for sign-in/sign-up
  const handleAuthClick = (mode: 'sign-in' | 'sign-up' = 'sign-in') => {
    // Use window.location.href instead of navigate to avoid scroll position issues
    setIsMenuOpen(false);
    window.location.href = mode === 'sign-in' ? '/sign-in' : '/sign-up';
  };
  
  return (
    <div className="flex items-center gap-3 relative" ref={menuRef}>
      <span className="font-medium text-sm text-gray-900 dark:text-white truncate">
        {displayName}
      </span>
      <div 
        className="flex items-center justify-center w-[32px] h-[32px] overflow-hidden bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-500 rounded-full shrink-0 hover:ring-2 hover:ring-purple-500/20 transition-all cursor-pointer"
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        title={`User: ${displayName} (Source: ${userSource})`}
      >
        {hasAvatar ? (
          <img
            src={avatarUrl || ''} /* Fix TypeScript error by providing fallback empty string */
            alt={displayName || ''}
            className="w-full h-full object-cover"
            loading="eager"
            decoding="sync"
          />
        ) : (
          <div className="i-ph:user-fill text-lg" />
        )}
      </div>

      {/* User dropdown menu */}
      {isMenuOpen && (
        <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg z-50 py-1 border border-gray-200 dark:border-gray-700">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{displayName}</p>
            {userData?.email && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{userData.email}</p>
            )}
            {isSignedIn && user?.emailAddresses && user.emailAddresses[0] && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{user.emailAddresses[0].emailAddress}</p>
            )}
          </div>
          <div className="py-1">
            <SignedIn>
              {/* Show these buttons only when signed in with Clerk */}
              {/* <button
                onClick={handleManageAccount}
                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <span className="i-ph:gear h-4 w-4 mr-2 opacity-80"></span>
                Manage account
              </button> */}
              <div className="relative">
                <button
                  onClick={handleSignOut}
                  className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <span className="i-ph:sign-out h-4 w-4 mr-2 opacity-80"></span>
                  Sign out
                </button>
                
                {/* Sign Out Confirmation Dropdown */}
                {showSignOutConfirm && (
                  <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg z-50 py-1 border border-gray-200 dark:border-gray-700">
                    <div className="p-3 flex flex-col gap-2">
                      <button 
                        onClick={() => {
                          signOut().then(() => {
                            setTimeout(() => {
                              navigate('/', { replace: true });
                            }, 300);
                          }).catch(error => {
                            console.error("Sign out error:", error);
                          });
                        }}
                        className="w-full py-1.5 px-3 bg-[#01536b] hover:bg-[#014358] text-white text-sm font-medium rounded-md transition-colors"
                      >
                        Sign Out
                      </button>
                      <button 
                        onClick={closeSignOutConfirm}
                        className="w-full py-1.5 px-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-white text-sm font-medium rounded-md transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </SignedIn>
            <SignedOut>
              {/* Show these buttons when not signed in with Clerk */}
              <button
                onClick={() => handleAuthClick('sign-in')}
                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <span className="i-ph:sign-in h-4 w-4 mr-2 opacity-80"></span>
                Sign in
              </button>
              <button
                onClick={() => handleAuthClick('sign-up')}
                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <span className="i-ph:user-plus h-4 w-4 mr-2 opacity-80"></span>
                Sign up
              </button>
            </SignedOut>
          </div>
        </div>
      )}
      
      {/* Clerk Authentication Modal */}
      <ClerkAuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setIsAuthModalOpen(false)} 
        initialMode={localStorage.getItem('auth_initial_mode') === 'sign-up' ? 'sign-up' : 'sign-in'}
      />
    </div>
  );
}

type DialogContent =
  | { type: 'delete'; item: ChatHistoryItem }
  | { type: 'bulkDelete'; items: ChatHistoryItem[] }
  | null;

function CurrentDateTime() {
  const [dateTime, setDateTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setDateTime(new Date());
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800/50">
      <div className="h-4 w-4 i-ph:clock opacity-80" />
      <div className="flex gap-2">
        <span>{dateTime.toLocaleDateString()}</span>
        <span>{dateTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    </div>
  );
}

export const Menu = () => {
  const { duplicateCurrentChat, exportChat } = useChatHistory();
  const menuRef = useRef<HTMLDivElement>(null);
  const toggleButtonRef = useRef<HTMLDivElement>(null);
  const [list, setList] = useState<ChatHistoryItem[]>([]);
  const [open, setOpen] = useState(false);
  const [dialogContent, setDialogContent] = useState<DialogContent>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const profile = useStore(profileStore);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);

  // Defining toggle function at component level for accessibility throughout the component
  const toggleMenu = () => {
    console.log('Toggle menu called, current state:', open);
    setOpen(!open);
  };

  const { filteredItems: filteredList, handleSearchChange } = useSearchFilter({
    items: list,
    searchFields: ['description'],
  });

  const loadEntries = useCallback(() => {
    if (db) {
      getAll(db)
        .then((list) => list.filter((item) => item.urlId && item.description))
        .then(setList)
        .catch((error) => toast.error(error.message));
    }
  }, []);

  const deleteChat = useCallback(
    async (id: string): Promise<void> => {
      if (!db) {
        throw new Error('Database not available');
      }

      // Delete chat snapshot from localStorage
      try {
        const snapshotKey = `snapshot:${id}`;
        localStorage.removeItem(snapshotKey);
        console.log('Removed snapshot for chat:', id);
      } catch (snapshotError) {
        console.error(`Error deleting snapshot for chat ${id}:`, snapshotError);
      }

      // Delete the chat from the database
      await deleteById(db, id);
      console.log('Successfully deleted chat:', id);
    },
    [db],
  );

  const deleteItem = useCallback(
    (event: React.UIEvent, item: ChatHistoryItem) => {
      event.preventDefault();
      event.stopPropagation();

      // Log the delete operation to help debugging
      console.log('Attempting to delete chat:', { id: item.id, description: item.description });

      deleteChat(item.id)
        .then(() => {
          toast.success('Chat deleted successfully', {
            position: 'bottom-right',
            autoClose: 3000,
          });

          // Always refresh the list
          loadEntries();

          if (chatId.get() === item.id) {
            // hard page navigation to clear the stores
            console.log('Navigating away from deleted chat');
            window.location.pathname = '/';
          }
        })
        .catch((error) => {
          console.error('Failed to delete chat:', error);
          toast.error('Failed to delete conversation', {
            position: 'bottom-right',
            autoClose: 3000,
          });

          // Still try to reload entries in case data has changed
          loadEntries();
        });
    },
    [loadEntries, deleteChat],
  );

  const deleteSelectedItems = useCallback(
    async (itemsToDeleteIds: string[]) => {
      if (!db || itemsToDeleteIds.length === 0) {
        console.log('Bulk delete skipped: No DB or no items to delete.');
        return;
      }

      console.log(`Starting bulk delete for ${itemsToDeleteIds.length} chats`, itemsToDeleteIds);

      let deletedCount = 0;
      const errors: string[] = [];
      const currentChatId = chatId.get();
      let shouldNavigate = false;

      // Process deletions sequentially using the shared deleteChat logic
      for (const id of itemsToDeleteIds) {
        try {
          await deleteChat(id);
          deletedCount++;

          if (id === currentChatId) {
            shouldNavigate = true;
          }
        } catch (error) {
          console.error(`Error deleting chat ${id}:`, error);
          errors.push(id);
        }
      }

      // Show appropriate toast message
      if (errors.length === 0) {
        toast.success(`${deletedCount} chat${deletedCount === 1 ? '' : 's'} deleted successfully`);
      } else {
        toast.warning(`Deleted ${deletedCount} of ${itemsToDeleteIds.length} chats. ${errors.length} failed.`, {
          autoClose: 5000,
        });
      }

      // Reload the list after all deletions
      await loadEntries();

      // Clear selection state
      setSelectedItems([]);
      setSelectionMode(false);

      // Navigate if needed
      if (shouldNavigate) {
        console.log('Navigating away from deleted chat');
        window.location.pathname = '/';
      }
    },
    [deleteChat, loadEntries, db],
  );

  const closeDialog = () => {
    setDialogContent(null);
  };

  const toggleSelectionMode = () => {
    setSelectionMode(!selectionMode);

    if (selectionMode) {
      // If turning selection mode OFF, clear selection
      setSelectedItems([]);
    }
  };

  const toggleItemSelection = useCallback((id: string) => {
    setSelectedItems((prev) => {
      const newSelectedItems = prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id];
      console.log('Selected items updated:', newSelectedItems);

      return newSelectedItems; // Return the new array
    });
  }, []); // No dependencies needed

  const handleBulkDeleteClick = useCallback(() => {
    if (selectedItems.length === 0) {
      toast.info('Select at least one chat to delete');
      return;
    }

    const selectedChats = list.filter((item) => selectedItems.includes(item.id));

    if (selectedChats.length === 0) {
      toast.error('Could not find selected chats');
      return;
    }

    setDialogContent({ type: 'bulkDelete', items: selectedChats });
  }, [selectedItems, list]); // Keep list dependency

  const selectAll = useCallback(() => {
    const allFilteredIds = filteredList.map((item) => item.id);
    setSelectedItems((prev) => {
      const allFilteredAreSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => prev.includes(id));

      if (allFilteredAreSelected) {
        // Deselect only the filtered items
        const newSelectedItems = prev.filter((id) => !allFilteredIds.includes(id));
        console.log('Deselecting all filtered items. New selection:', newSelectedItems);

        return newSelectedItems;
      } else {
        // Select all filtered items, adding them to any existing selections
        const newSelectedItems = [...new Set([...prev, ...allFilteredIds])];
        console.log('Selecting all filtered items. New selection:', newSelectedItems);

        return newSelectedItems;
      }
    });
  }, [filteredList]); // Depends only on filteredList

  useEffect(() => {
    if (open) {
      loadEntries();
    }
  }, [open, loadEntries]);

  // Exit selection mode when sidebar is closed
  useEffect(() => {
    if (!open && selectionMode) {
      /*
       * Don't clear selection state anymore when sidebar closes
       * This allows the selection to persist when reopening the sidebar
       */
      console.log('Sidebar closed, preserving selection state');
    }
  }, [open, selectionMode]);

  useEffect(() => {
    // Handle clicking outside to close menu
    function handleClickOutside(event: MouseEvent) {
      // Don't close if clicking the toggle button itself
      if (toggleButtonRef.current && toggleButtonRef.current.contains(event.target as Node)) {
        console.log('Click on toggle button detected, not closing menu');
        return;
      }
      
      // Close if clicking outside the menu when it's open
      if (open && menuRef.current && !menuRef.current.contains(event.target as Node)) {
        console.log('Click outside detected, closing menu');
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  const handleDuplicate = async (id: string) => {
    await duplicateCurrentChat(id);
    loadEntries(); // Reload the list after duplication
  };

  const handleSettingsClick = () => {
    setIsSettingsOpen(true);
    setOpen(false);
  };

  const handleSettingsClose = () => {
    setIsSettingsOpen(false);
  };

  // Function to navigate to the correct route based on chat type
  const navigateToChatById = useCallback((item: ChatHistoryItem) => {
    // Check if the chat has a type field, if not, default to 'chat' for backward compatibility
    const chatType = item.type || 'chat';
    
    // Navigate to the appropriate route based on chat type
    if (chatType === 'prd') {
      window.location.href = `/prd/${item.urlId}`;
    } else if (chatType === 'ticket') {
      window.location.href = `/ticket/${item.urlId}`;
    } else {
      window.location.href = `/chat/${item.urlId}`;
    }
  }, []);

  // Render the chat history items
  const renderHistoryItems = useCallback(
    (items: ChatHistoryItem[]) => {
      return items.map((item) => (
        <HistoryItem
          key={item.id}
          item={item}
          selectionMode={selectionMode}
          isSelected={selectedItems.includes(item.id)}
          onToggleSelection={(id: string) => {
            if (selectedItems.includes(id)) {
              setSelectedItems(selectedItems.filter((itemId) => itemId !== id));
            } else {
              setSelectedItems([...selectedItems, id]);
            }
          }}
          onClick={() => {
            if (!selectionMode) {
              // Use the new navigation function based on chat type
              navigateToChatById(item);
            }
          }}
          onDelete={(event) => {
            setDialogContent({ type: 'delete', item });
            event.stopPropagation();
          }}
          onDuplicate={(event) => {
            handleDuplicate(item.id);
            event.stopPropagation();
          }}
          onExport={(event) => {
            exportChat(item.urlId);
            event.stopPropagation();
          }}
        />
      ));
    },
    [exportChat, handleDuplicate, navigateToChatById, selectedItems, selectionMode],
  );

  return (
    <>
      {/* Full-height vertical toggle bar with professional arrow indicator */}
      <motion.div
        ref={toggleButtonRef}
        initial={{ x: 0 }}
        animate={{ 
          x: open ? 339 : 0,
        }}
        transition={{
          type: "spring",
          stiffness: 400,
          damping: 30
        }}
        className="fixed top-0 left-0 h-screen z-[100] cursor-pointer hidden sm:block" /* Hide on mobile, visible on sm and above */
        onClick={() => {
          console.log('Menu toggle strip clicked, toggling from', open, 'to', !open);
          toggleMenu();
        }}
        aria-label={open ? "Close sidebar menu" : "Open sidebar menu"}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            toggleMenu();
            e.preventDefault(); // Prevent scrolling when space is pressed
          }
        }}
      >
        {/* Enhanced full height toggle bar with premium design */}
        <div className="h-full w-[40px] bg-gradient-to-b from-gray-50 via-white to-gray-50 dark:from-gray-800 dark:via-gray-850 dark:to-gray-800 border-r border-gray-200 dark:border-gray-700 relative group transition-all duration-300 rounded-tr-2xl rounded-br-2xl shadow-[2px_0px_12px_rgba(0,0,0,0.03)] dark:shadow-[2px_0px_12px_rgba(0,0,0,0.15)] overflow-hidden">
          {/* Subtle gradient overlay in Focus AI theme colors */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#01536b]/15 via-[#01536b]/5 to-[#01536b]/15 dark:from-[#01536b]/20 dark:via-[#01536b]/8 dark:to-[#01536b]/20 opacity-90 rounded-tr-2xl rounded-br-2xl"></div>
          
          {/* Sleek gradient */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#01536b]/3 via-transparent to-[#01536b]/3 opacity-50 dark:opacity-60 pointer-events-none rounded-tr-2xl rounded-br-2xl"></div>
          
          {/* Enhanced hover overlay with darker gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#01536b]/15 via-[#01536b]/10 to-[#01536b]/20 dark:from-[#01536b]/20 dark:via-[#01536b]/15 dark:to-[#01536b]/25 opacity-0 group-hover:opacity-100 transition-all duration-300 rounded-tr-2xl rounded-br-2xl"></div>

          {/* Center arrow indicator with improved styling */}
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <motion.div
              animate={{ rotate: open ? 180 : 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              className="relative"
            >
              {/* Enhanced circular background with subtle glow */}
              <div className="absolute inset-0 bg-white dark:bg-gray-800 rounded-full shadow-[0_2px_12px_rgba(1,83,107,0.18)] dark:shadow-[0_2px_12px_rgba(1,83,107,0.3)] scale-90 opacity-0 group-hover:opacity-100 group-hover:scale-100 transition-all duration-300"></div>
              
              {/* Premium arrow design with improved contrast */}
              <div className="relative z-10 w-8 h-8 flex items-center justify-center bg-white dark:bg-gray-800 rounded-full shadow-sm border border-gray-100 dark:border-gray-700 transition-all duration-300 group-hover:shadow-md">
                <svg 
                  width="20" 
                  height="20" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  xmlns="http://www.w3.org/2000/svg"
                  className="text-[#01536b] dark:text-[#01536b] group-hover:text-[#01536b] dark:group-hover:text-[#01536b] transition-colors"
                >
                  <path 
                    d="M10.5 8L14.5 12L10.5 16" 
                    stroke="currentColor" 
                    strokeWidth="2.5"
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                  />
                </svg>
                
                {/* Enhanced glow effect on hover */}
                <div className="absolute inset-0 rounded-full bg-[#01536b]/0 group-hover:bg-[#01536b]/10 transition-all duration-300"></div>
              </div>
            </motion.div>
          </div>
          
          {/* Visual indicators for top and bottom - subtle bullets with glow */}
          <div className="absolute top-[20%] left-1/2 transform -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[#01536b]/60 dark:bg-[#01536b]/70 shadow-[0_0_4px_rgba(1,83,107,0.4)] opacity-0 group-hover:opacity-100 transition-opacity duration-500 delay-100"></div>
          <div className="absolute bottom-[20%] left-1/2 transform -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[#01536b]/60 dark:bg-[#01536b]/70 shadow-[0_0_4px_rgba(1,83,107,0.4)] opacity-0 group-hover:opacity-100 transition-opacity duration-500 delay-100"></div>
          
          {/* Top decorative gradient - stronger */}
          <div className="absolute top-0 left-0 right-0 h-[150px] bg-gradient-to-b from-[#01536b]/25 to-transparent dark:from-[#01536b]/30 dark:to-transparent opacity-80 pointer-events-none rounded-tr-2xl"></div>
          
          {/* Bottom decorative gradient - stronger */}
          <div className="absolute bottom-0 left-0 right-0 h-[150px] bg-gradient-to-t from-[#01536b]/25 to-transparent dark:from-[#01536b]/30 dark:to-transparent opacity-80 pointer-events-none rounded-br-2xl"></div>
          
          {/* Edge glow for floating effect */}
          <div className="absolute inset-y-0 -right-0.5 w-[3px] bg-gradient-to-r from-[#01536b]/10 to-transparent opacity-70 pointer-events-none rounded-tr-2xl rounded-br-2xl"></div>
        </div>
      </motion.div>

      <motion.div
        ref={menuRef}
        initial="closed"
        animate={open ? 'open' : 'closed'}
        variants={menuVariants}
        style={{ width: '340px' }}
        className={classNames(
          'flex selection-accent flex-col side-menu fixed top-0 h-full',
          'bg-white dark:bg-gray-950 border-r border-gray-100 dark:border-gray-800/50',
          'shadow-sm text-sm',
          isSettingsOpen ? 'z-40' : 'z-sidebar',
          'hidden sm:flex' /* Hide on mobile, display flex on sm breakpoint and above */
        )}
      >
        <div className="h-12 flex items-center justify-between px-4 border-b border-gray-100 dark:border-gray-800/50 bg-gray-50/50 dark:bg-gray-900/50">
          <div className="text-gray-900 dark:text-white font-medium"></div>
          <UserButton />
        </div>
        <CurrentDateTime />
        <div className="flex-1 flex flex-col h-full w-full overflow-hidden">
          <div className="p-4 space-y-3">
            <div className="flex gap-2">
              <a
                href="/"
                className="flex-1 flex gap-2 items-center bg-[#01536b]/10 dark:bg-[#01536b]/10 text-[#01536b] dark:text-[#01536b]/90 hover:bg-[#01536b]/20 dark:hover:bg-[#01536b]/20 rounded-lg px-4 py-2 transition-colors"
              >
                <span className="inline-block i-ph:plus-circle h-4 w-4" />
                <span className="text-sm font-medium">Start new chat</span>
              </a>
              <button
                onClick={toggleSelectionMode}
                className={classNames(
                  'flex gap-1 items-center rounded-lg px-3 py-2 transition-colors',
                  selectionMode
                    ? 'bg-purple-600 dark:bg-purple-500 text-white border border-purple-700 dark:border-purple-600'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700',
                )}
                aria-label={selectionMode ? 'Exit selection mode' : 'Enter selection mode'}
              >
                <span className={selectionMode ? 'i-ph:x h-4 w-4' : 'i-ph:check-square h-4 w-4'} />
              </button>
            </div>
            <div className="relative w-full">
              <div className="absolute left-3 top-1/2 -translate-y-1/2">
                <span className="i-ph:magnifying-glass h-4 w-4 text-gray-400 dark:text-gray-500" />
              </div>
              <input
                className="w-full bg-gray-50 dark:bg-gray-900 relative pl-9 pr-3 py-2 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500/50 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-500 border border-gray-200 dark:border-gray-800"
                type="search"
                placeholder="Search chats..."
                onChange={handleSearchChange}
                aria-label="Search chats"
              />
            </div>
          </div>
          <div className="flex items-center justify-between text-sm px-4 py-2">
            <div className="font-medium text-gray-600 dark:text-gray-400">Your Chats</div>
            {selectionMode && (
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={selectAll}>
                  {selectedItems.length === filteredList.length ? 'Deselect all' : 'Select all'}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkDeleteClick}
                  disabled={selectedItems.length === 0}
                >
                  Delete selected
                </Button>
              </div>
            )}
          </div>
          <div className="flex-1 overflow-auto px-3 pb-3">
            {filteredList.length === 0 && (
              <div className="px-4 text-gray-500 dark:text-gray-400 text-sm">
                {list.length === 0 ? 'No previous conversations' : 'No matches found'}
              </div>
            )}
            <DialogRoot open={dialogContent !== null}>
              {binDates(filteredList).map(({ category, items }) => (
                <div key={category} className="mt-2 first:mt-0 space-y-1">
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400 sticky top-0 z-1 bg-white dark:bg-gray-950 px-4 py-1">
                    {category}
                  </div>
                  <div className="space-y-0.5 pr-1">
                    {renderHistoryItems(items)}
                  </div>
                </div>
              ))}
              <Dialog onBackdrop={closeDialog} onClose={closeDialog}>
                {dialogContent?.type === 'delete' && (
                  <>
                    <div className="p-6 bg-white dark:bg-gray-950">
                      <DialogTitle className="text-gray-900 dark:text-white">Delete Chat?</DialogTitle>
                      <DialogDescription className="mt-2 text-gray-600 dark:text-gray-400">
                        <p>
                          You are about to delete{' '}
                          <span className="font-medium text-gray-900 dark:text-white">
                            {dialogContent.item.description}
                          </span>
                        </p>
                        <p className="mt-2">Are you sure you want to delete this chat?</p>
                      </DialogDescription>
                    </div>
                    <div className="flex justify-end gap-3 px-6 py-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800">
                      <DialogButton type="secondary" onClick={closeDialog}>
                        Cancel
                      </DialogButton>
                      <DialogButton
                        type="danger"
                        onClick={(event) => {
                          console.log('Dialog delete button clicked for item:', dialogContent.item);
                          deleteItem(event, dialogContent.item);
                          closeDialog();
                        }}
                      >
                        Delete
                      </DialogButton>
                    </div>
                  </>
                )}
                {dialogContent?.type === 'bulkDelete' && (
                  <>
                    <div className="p-6 bg-white dark:bg-gray-950">
                      <DialogTitle className="text-gray-900 dark:text-white">Delete Selected Chats?</DialogTitle>
                      <DialogDescription className="mt-2 text-gray-600 dark:text-gray-400">
                        <p>
                          You are about to delete {dialogContent.items.length}{' '}
                          {dialogContent.items.length === 1 ? 'chat' : 'chats'}:
                        </p>
                        <div className="mt-2 max-h-32 overflow-auto border border-gray-100 dark:border-gray-800 rounded-md bg-gray-50 dark:bg-gray-900 p-2">
                          <ul className="list-disc pl-5 space-y-1">
                            {dialogContent.items.map((item) => (
                              <li key={item.id} className="text-sm">
                                <span className="font-medium text-gray-900 dark:text-white">{item.description}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <p className="mt-3">Are you sure you want to delete these chats?</p>
                      </DialogDescription>
                    </div>
                    <div className="flex justify-end gap-3 px-6 py-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800">
                      <DialogButton type="secondary" onClick={closeDialog}>
                        Cancel
                      </DialogButton>
                      <DialogButton
                        type="danger"
                        onClick={() => {
                          /*
                           * Pass the current selectedItems to the delete function.
                           * This captures the state at the moment the user confirms.
                           */
                          const itemsToDeleteNow = [...selectedItems];
                          console.log('Bulk delete confirmed for', itemsToDeleteNow.length, 'items', itemsToDeleteNow);
                          deleteSelectedItems(itemsToDeleteNow);
                          closeDialog();
                        }}
                      >
                        Delete
                      </DialogButton>
                    </div>
                  </>
                )}
              </Dialog>
            </DialogRoot>
          </div>
          <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-800 px-4 py-3">
            {/* Will be uncommented in the future once we have full settings */}
            {/* <SettingsButton onClick={handleSettingsClick} /> */}
            <ThemeSwitch />
          </div>
        </div>
      </motion.div>

      <ControlPanel open={isSettingsOpen} onClose={handleSettingsClose} />
    </>
  );
};