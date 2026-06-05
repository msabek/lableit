import { useEffect, useRef } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { setClerkTokenGetter } from '../api';

/**
 * This component sets up the Clerk token getter for the API client.
 * It should be rendered inside ClerkProvider.
 * 
 * IMPORTANT: We set up the token getter synchronously (via ref + immediate call)
 * to avoid race conditions where children make API calls before the token
 * getter is available.
 */
export default function ClerkTokenProvider({ children }: { children: React.ReactNode }) {
  const { getToken, isLoaded } = useAuth();
  const hasSetupRef = useRef(false);
  
  // Set up token getter synchronously on first render
  // This runs during render, not after, to avoid race conditions
  if (!hasSetupRef.current && isLoaded) {
    setClerkTokenGetter(async () => {
      try {
        const token = await getToken();
        return token;
      } catch (e) {
        console.error('Failed to get Clerk token:', e);
        return null;
      }
    });
    hasSetupRef.current = true;
  }
  
  // Also update if getToken changes (shouldn't normally happen)
  useEffect(() => {
    if (isLoaded) {
      setClerkTokenGetter(async () => {
        try {
          const token = await getToken();
          return token;
        } catch (e) {
          console.error('Failed to get Clerk token:', e);
          return null;
        }
      });
    }
  }, [getToken, isLoaded]);
  
  // Don't render children until auth is loaded
  // This prevents API calls from happening before we have a token getter
  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-background)]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }
  
  return <>{children}</>;
}
