import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from '@remix-run/react';
import { useUser } from '@clerk/remix';
import { isPublicRoute } from '~/lib/auth/protectedRoutes';
import ClerkLoadingOverlay from '~/components/ui/ClerkLoadingOverlay';

interface AuthenticationGuardProps {
  children: React.ReactNode;
}

export const AuthenticationGuard = ({ children }: AuthenticationGuardProps) => {
  const { isLoaded, isSignedIn, user } = useUser();
  const location = useLocation();
  const navigate = useNavigate();
  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    // Only run this check after Clerk has loaded the user state
    if (!isLoaded) return;

    // Identify user to PostHog when signed in
    if (isSignedIn && user) {
      const email = user.emailAddresses?.[0]?.emailAddress;
      if (email && typeof window !== 'undefined' && window.posthog) {
        window.posthog.identify(
          user.id, // Use Clerk's user ID as the unique identifier
          { email } // Just pass the email address
        );
      }
    }

    const currentPath = location.pathname;
    
    // If the user is not signed in and the route is not public, redirect to sign-in
    if (!isSignedIn && !isPublicRoute(currentPath) && !isRedirecting) {
      // Set redirecting state to prevent multiple redirects
      setIsRedirecting(true);
      
      // Encode the current URL to redirect back after authentication
      const returnUrl = encodeURIComponent(
        `${location.pathname}${location.search}`
      );
      
      // Use setTimeout to ensure smooth transition and prevent potential race conditions
      setTimeout(() => {
        // Navigate to sign-in with the return URL as a query parameter
        navigate(`/sign-in?redirect_url=${returnUrl}`);
      }, 0);
    } else if (isSignedIn || isPublicRoute(currentPath)) {
      // Reset redirecting state when conditions change
      setIsRedirecting(false);
    }
  }, [isLoaded, isSignedIn, location, navigate, isRedirecting, user]);

  // If still loading authentication state, show our custom Clerk loading overlay
  if (!isLoaded) {
    return <ClerkLoadingOverlay message="Loading..." />;
  }
  
  // If redirecting, show our custom Clerk loading overlay to prevent UI flicker
  if (isRedirecting) {
    return <ClerkLoadingOverlay message="Redirecting..." />;
  }
  
  // If route is public or user is authenticated, render children
  return <>{children}</>;
};
