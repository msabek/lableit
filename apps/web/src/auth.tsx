import React from 'react';
import { SignIn, SignUp, useAuth, useUser } from '@clerk/clerk-react';
import Logo from './components/Logo';

interface AuthProps {
  mode?: 'sign-in' | 'sign-up';
}

export default function Auth({ mode = 'sign-in' }: AuthProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0f1117] py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Logo size="xl" showText={false} />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Lableit
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            AI-powered vision labeling platform
          </p>
        </div>
        
        <div className="flex justify-center">
          {mode === 'sign-in' ? (
            <SignIn 
              appearance={{
                elements: {
                  rootBox: 'mx-auto',
                  card: 'bg-white dark:bg-[#1c1e2e] shadow-xl border border-gray-200 dark:border-white/10',
                  headerTitle: 'text-gray-900 dark:text-white',
                  headerSubtitle: 'text-gray-600 dark:text-gray-400',
                  socialButtonsBlockButton: 'bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700',
                  socialButtonsBlockButtonText: 'text-gray-700 dark:text-gray-200',
                  dividerLine: 'bg-gray-200 dark:bg-gray-700',
                  dividerText: 'text-gray-500 dark:text-gray-400',
                  formFieldLabel: 'text-gray-700 dark:text-gray-300',
                  formFieldInput: 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white',
                  formButtonPrimary: 'bg-indigo-600 hover:bg-indigo-700',
                  footerActionLink: 'text-indigo-600 dark:text-indigo-400 hover:text-indigo-500',
                  identityPreviewEditButton: 'text-indigo-600 dark:text-indigo-400',
                  formFieldAction: 'text-indigo-600 dark:text-indigo-400',
                }
              }}
              routing="path"
              path="/auth/sign-in"
              signUpUrl="/auth/sign-up"
              fallbackRedirectUrl="/projects"
            />
          ) : (
            <SignUp 
              appearance={{
                elements: {
                  rootBox: 'mx-auto',
                  card: 'bg-white dark:bg-[#1c1e2e] shadow-xl border border-gray-200 dark:border-white/10',
                  headerTitle: 'text-gray-900 dark:text-white',
                  headerSubtitle: 'text-gray-600 dark:text-gray-400',
                  socialButtonsBlockButton: 'bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700',
                  socialButtonsBlockButtonText: 'text-gray-700 dark:text-gray-200',
                  dividerLine: 'bg-gray-200 dark:bg-gray-700',
                  dividerText: 'text-gray-500 dark:text-gray-400',
                  formFieldLabel: 'text-gray-700 dark:text-gray-300',
                  formFieldInput: 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white',
                  formButtonPrimary: 'bg-indigo-600 hover:bg-indigo-700',
                  footerActionLink: 'text-indigo-600 dark:text-indigo-400 hover:text-indigo-500',
                  identityPreviewEditButton: 'text-indigo-600 dark:text-indigo-400',
                  formFieldAction: 'text-indigo-600 dark:text-indigo-400',
                }
              }}
              routing="path"
              path="/auth/sign-up"
              signInUrl="/auth/sign-in"
              fallbackRedirectUrl="/projects"
            />
          )}
        </div>
      </div>
    </div>
  );
}

// Hook to get authenticated user info
export function useAuthUser() {
  const { isSignedIn, isLoaded } = useAuth();
  const { user } = useUser();
  
  return {
    isLoaded,
    isSignedIn,
    user: user ? {
      id: user.id,
      email: user.primaryEmailAddress?.emailAddress || '',
      name: user.fullName || user.firstName || '',
      imageUrl: user.imageUrl,
    } : null,
  };
}
