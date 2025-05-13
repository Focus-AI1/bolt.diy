import { SignIn } from '@clerk/remix';
import { useEffect } from 'react';

export default function SignInPage() {
  // Add analytics or custom tracking if needed
  useEffect(() => {
    console.log('Sign-in page loaded');
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="w-full max-w-md">
        <SignIn 
          routing="path" 
          path="/sign-in"
          signUpUrl="/sign-up"
          afterSignInUrl="/"
          appearance={{
            elements: {
              rootBox: 'w-full',
              card: 'w-full shadow-lg border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden',
              headerTitle: 'text-xl font-semibold text-gray-900 dark:text-white',
              headerSubtitle: 'text-gray-600 dark:text-gray-400',
              socialButtonsBlockButton: 'w-full',
              formFieldInput: 'dark:bg-gray-800 dark:text-white',
              formButtonPrimary: 'bg-purple-600 hover:bg-purple-700',
            }
          }}
        />
      </div>
    </div>
  );
}
