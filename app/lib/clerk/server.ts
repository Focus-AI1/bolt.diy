import { getAuth } from '@clerk/remix/ssr.server';
import { createClerkClient } from '@clerk/remix/api.server';
import { redirect } from '@remix-run/node';
import type { LoaderFunctionArgs } from '@remix-run/node';

export const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

// Helper to require authentication for protected routes
export const requireAuth = async (args: LoaderFunctionArgs) => {
  const { userId } = await getAuth(args);
  
  if (!userId) {
    // Redirect to sign-in page if not authenticated
    return redirect('/sign-in');
  }
  
  return { userId };
};

// Helper to get user data if authenticated
export const getAuthData = async (args: LoaderFunctionArgs) => {
  const { userId, sessionId, getToken } = await getAuth(args);
  
  if (!userId) {
    return { userId: null, sessionId: null, token: null };
  }
  
  // Get JWT token if needed
  const token = await getToken();
  
  return { userId, sessionId, token };
};

// Helper to get user profile data
export const getUserProfile = async (userId: string) => {
  if (!userId) return null;
  
  try {
    const user = await clerkClient.users.getUser(userId);
    return {
      id: user.id,
      username: user.username || `${user.firstName} ${user.lastName}`.trim(),
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.emailAddresses[0]?.emailAddress,
      imageUrl: user.imageUrl,
    };
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return null;
  }
};
