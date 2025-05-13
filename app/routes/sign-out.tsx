import { useClerk } from "@clerk/remix";
import { useEffect } from "react";

export default function SignOutPage() {
  const { signOut } = useClerk();

  useEffect(() => {
    // Automatically sign out when this page is loaded
    const performSignOut = async () => {
      try {
        await signOut();
        // Redirect to home page after sign out
        window.location.href = "/";
      } catch (error) {
        console.error("Error signing out:", error);
        // Still redirect to home page even if there's an error
        window.location.href = "/";
      }
    };

    performSignOut();
  }, [signOut]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="w-full max-w-md text-center">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Signing out...
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          You are being signed out of your account.
        </p>
      </div>
    </div>
  );
}
