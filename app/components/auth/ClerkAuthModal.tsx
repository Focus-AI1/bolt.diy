import { useState, useEffect } from 'react';
import { SignIn, SignUp, useClerk } from '@clerk/remix';
import { Dialog, DialogButton, DialogRoot, DialogTitle } from '~/components/ui/Dialog';

type AuthMode = 'sign-in' | 'sign-up';

interface ClerkAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: AuthMode;
}

export const ClerkAuthModal = ({ isOpen, onClose, initialMode = 'sign-in' }: ClerkAuthModalProps) => {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const { session } = useClerk();
  
  // Reset mode when modal opens
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
    }
  }, [isOpen, initialMode]);

  // Check for authentication status changes
  useEffect(() => {
    // If user becomes authenticated while modal is open, close the modal
    if (isOpen && session) {
      onClose();
    }
  }, [session, isOpen, onClose]);

  // Handle navigation to sign-in/sign-up routes
  const handleAuthNavigation = () => {
    onClose();
    window.location.href = mode === 'sign-in' ? '/sign-in' : '/sign-up';
  };

  const toggleMode = () => {
    setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');
  };

  return (
    <DialogRoot open={isOpen} onOpenChange={onClose}>
      <Dialog className="w-full max-w-md overflow-hidden">
        <div className="p-6 bg-white dark:bg-gray-950">
          <DialogTitle className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            {mode === 'sign-in' ? 'Sign In' : 'Sign Up'}
          </DialogTitle>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
            {mode === 'sign-in' 
              ? 'Sign in to your account to access all features.' 
              : 'Create a new account to get started.'}
          </p>
          
          <div className="flex flex-col items-center justify-center space-y-4">
            <button
              onClick={handleAuthNavigation}
              className="w-full py-2 px-4 bg-cyan-800 hover:bg-cyan-900 text-white rounded-md transition-colors"
            >
              Continue to {mode === 'sign-in' ? 'Sign In' : 'Sign Up'} Page
            </button>
          
            <div className="text-center w-full">
              <button 
                onClick={toggleMode}
                className="text-sm text-cyan-800 hover:text-cyan-900 dark:text-cyan-600 dark:hover:text-cyan-500"
              >
                {mode === 'sign-in' 
                  ? 'Don\'t have an account? Sign up' 
                  : 'Already have an account? Sign in'}
              </button>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800">
          <DialogButton type="secondary" onClick={onClose}>
            Cancel
          </DialogButton>
        </div>
      </Dialog>
    </DialogRoot>
  );
};

export const UserProfileButton = () => {
  return (
    <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center overflow-hidden">
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500 dark:text-gray-400" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
      </svg>
    </div>
  );
};
