// import { SignIn } from '@clerk/remix';
// import { useEffect } from 'react';
// import { useLocation } from '@remix-run/react';

// export default function SignInPage() {
//   const location = useLocation();

//   // Extract the redirect URL from the query parameters
//   const searchParams = new URLSearchParams(location.search);
//   const redirectUrl = searchParams.get('redirect_url');

//   // The redirect will be handled automatically by Clerk using the afterSignInUrl prop

//   // Add analytics or custom tracking if needed
//   useEffect(() => {
//     console.log('Sign-in page loaded', redirectUrl ? `with redirect to: ${redirectUrl}` : '');
//   }, [redirectUrl]);

//   return (
//     <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
//       <div className="w-full max-w-md">
//         <SignIn 
//           routing="path" 
//           path="/sign-in"
//           signUpUrl={redirectUrl ? `/sign-up?redirect_url=${redirectUrl}` : '/sign-up'}
//           redirectUrl={redirectUrl ? decodeURIComponent(redirectUrl) : '/'}
//           afterSignInUrl={redirectUrl ? decodeURIComponent(redirectUrl) : '/'}
//           appearance={{
//             elements: {
//               rootBox: 'w-full',
//               card: 'w-full shadow-lg border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden',
//               headerTitle: 'text-xl font-semibold text-gray-900 dark:text-white',
//               headerSubtitle: 'text-gray-600 dark:text-gray-400',
//               socialButtonsBlockButton: 'w-full',
//               formFieldInput: 'dark:bg-gray-800 dark:text-white',
//               formButtonPrimary: 'bg-[#01536b] hover:bg-[#01536b]/90', //PLEASE DO NOT CHANGE THIS COLOR!!!
//             }
//           }}
//         />
//       </div>
//     </div>
//   );
// }
