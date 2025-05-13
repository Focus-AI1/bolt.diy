// Protected routes configuration
// This file defines which routes require authentication and which are public

// Routes that don't require authentication
export const publicRoutes = [
  '/',         // Landing page
  '/sign-in',  // Sign in page
  '/sign-up',  // Sign up page
  '/sign-out', // Sign out page
  // Add any other public routes here
];

// Check if a route is public
export const isPublicRoute = (pathname: string): boolean => {
  // Check if the current path matches any public route patterns
  return publicRoutes.some(route => {
    // Handle exact matches
    if (route === pathname) return true;
    
    // Handle wildcard routes (e.g., /sign-in/*)
    if (route.endsWith('*')) {
      const baseRoute = route.slice(0, -1);
      return pathname.startsWith(baseRoute);
    }
    
    // Handle Remix catch-all routes (e.g., /sign-in/$)
    if (pathname.startsWith(route) && (
      pathname === route || 
      pathname.startsWith(`${route}/`) ||
      pathname.match(new RegExp(`^${route.replace(/\$/g, '\\$')}\\?`))
    )) {
      return true;
    }
    
    return false;
  });
};
