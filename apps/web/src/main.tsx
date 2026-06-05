import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import App from './App';
import './index.css';

declare global {
  interface Window {
    __LABLEIT_CONFIG__?: {
      VITE_CLERK_PUBLISHABLE_KEY?: string;
      VITE_API_URL?: string;
    };
  }
}

// Read build-time env first, then runtime-injected config for Railway.
const PUBLISHABLE_KEY =
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ||
  window.__LABLEIT_CONFIG__?.VITE_CLERK_PUBLISHABLE_KEY;

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element not found');
}

// If no Clerk key, show setup instructions instead of crashing
if (!PUBLISHABLE_KEY) {
  createRoot(root).render(
    <StrictMode>
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0f1117] p-4">
        <div className="max-w-lg w-full text-center">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg mb-6">
            L
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Clerk Setup Required
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Please configure Clerk authentication to continue.
          </p>
          <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 text-left mb-6">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              1. Create a Clerk account at{' '}
              <a href="https://clerk.com" target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 hover:underline">
                clerk.com
              </a>
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              2. Create an application and enable Google OAuth
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              3. Copy your Publishable Key from the{' '}
              <a href="https://dashboard.clerk.com/last-active?path=api-keys" target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 hover:underline">
                API Keys page
              </a>
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              4. Create <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">apps/web/.env.local</code> with:
            </p>
            <code className="block text-sm text-indigo-600 dark:text-indigo-400 bg-gray-200 dark:bg-gray-700 p-2 rounded mt-1">
              VITE_CLERK_PUBLISHABLE_KEY=pk_test_YOUR_KEY
            </code>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            After adding the key, restart the dev server with <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">bun run dev:web</code>
          </p>
        </div>
      </div>
    </StrictMode>
  );
} else {
  // Normal app with Clerk authentication
  createRoot(root).render(
    <StrictMode>
      <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
        <App />
      </ClerkProvider>
    </StrictMode>
  );
}
