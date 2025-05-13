// // Client-side Clerk utilities
// import { useAuth, useUser } from '@clerk/remix';

// // No need to create a clerk client on the client side

// // Helper function to check if user is authenticated
// export const isAuthenticated = (): boolean => {
//   return !!window.__CLERK_DATA__?.userId;
// };

// // Helper function to get user data
// export const getUserData = () => {
//   if (!window.__CLERK_DATA__?.userId) {
//     return null;
//   }
  
//   return {
//     userId: window.__CLERK_DATA__.userId,
//     sessionId: window.__CLERK_DATA__.sessionId
//   };
// };

// // Add Clerk types to the global window object
// declare global {
//   interface Window {
//     __CLERK_DATA__?: {
//       userId?: string;
//       sessionId?: string;
//     };
//   }
// }
