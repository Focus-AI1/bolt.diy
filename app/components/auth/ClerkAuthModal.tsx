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
          
          <div className="clerk-auth-container">
            {mode === 'sign-in' ? (
              <SignIn 
                routing="virtual"
                afterSignInUrl="/"
                redirectUrl="/"
                signUpUrl="/sign-up"
                appearance={{
                  elements: {
                    rootBox: 'w-full',
                    card: 'w-full shadow-none p-0 m-0 border-0',
                    header: 'hidden',
                    footer: 'hidden',
                    main: 'p-3 m-3',
                    formButtonPrimary: 'bg-cyan-800 hover:bg-cyan-900',
                    formFieldInput: 'dark:bg-gray-800 dark:text-white border-gray-300 dark:border-gray-700',
                    formFieldLabel: 'text-gray-700 dark:text-gray-300',
                    socialButtonsBlockButton: 'border-gray-300 dark:border-gray-700',
                    socialButtonsBlockButtonText: 'text-gray-700 dark:text-gray-300',
                    dividerLine: 'bg-gray-300 dark:bg-gray-700',
                    dividerText: 'text-gray-500 dark:text-gray-400',
                    formFieldAction: 'text-cyan-800 hover:text-cyan-900 dark:text-cyan-600 dark:hover:text-cyan-500',
                    footerActionLink: 'text-cyan-800 hover:text-cyan-900 dark:text-cyan-600 dark:hover:text-cyan-500',
                  },
                  layout: {
                    socialButtonsPlacement: 'top',
                    showOptionalFields: false,
                  },
                  variables: {
                    borderRadius: '0.375rem',
                    colorPrimary: '#01536b',
                  }
                }}
              />
            ) : (
              <SignUp 
                routing="virtual"
                afterSignUpUrl="/"
                redirectUrl="/"
                signInUrl="/sign-in"
                appearance={{
                  elements: {
                    rootBox: 'w-full',
                    card: 'w-full shadow-none p-0 m-0 border-0',
                    header: 'hidden',
                    footer: 'hidden',
                    main: 'p-3 m-3',
                    formButtonPrimary: 'bg-cyan-800 hover:bg-cyan-900',
                    formFieldInput: 'dark:bg-gray-800 dark:text-white border-gray-300 dark:border-gray-700',
                    formFieldLabel: 'text-gray-700 dark:text-gray-300',
                    socialButtonsBlockButton: 'border-gray-300 dark:border-gray-700',
                    socialButtonsBlockButtonText: 'text-gray-700 dark:text-gray-300',
                    dividerLine: 'bg-gray-300 dark:bg-gray-700',
                    dividerText: 'text-gray-500 dark:text-gray-400',
                    formFieldAction: 'text-cyan-800 hover:text-cyan-900 dark:text-cyan-600 dark:hover:text-cyan-500',
                    footerActionLink: 'text-cyan-800 hover:text-cyan-900 dark:text-cyan-600 dark:hover:text-cyan-500',
                  },
                  layout: {
                    socialButtonsPlacement: 'top',
                    showOptionalFields: false,
                  },
                  variables: {
                    borderRadius: '0.375rem',
                    colorPrimary: '#01536b',
                  }
                }}
              />
            )}
          </div>
          
          <div className="mt-6 text-center">
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
