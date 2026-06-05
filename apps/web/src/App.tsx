import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams, useLocation } from 'react-router-dom';
import { SignedIn, SignedOut, useAuth } from '@clerk/clerk-react';
import './index.css';
import ClerkTokenProvider from './components/ClerkTokenProvider';
import { SettingsProvider } from './contexts/SettingsContext';
import { Dataset, ClassDef, projects as projectsApi } from './api';
import { ThemeDropdown } from './components/ThemeToggle';

// Route-level code splitting: each top-level page is loaded on demand so the
// anonymous landing page never pulls the labeling/canvas/inference bundles.
const LandingPage = lazy(() => import('./landing/LandingPage'));
const Auth = lazy(() => import('./auth'));
const Projects = lazy(() => import('./projects'));
const LabelingInterface = lazy(() => import('./labeling'));
const BuildFlow = lazy(() => import('./components/BuildFlow'));

// Shared fallback shown while a lazily-loaded route chunk is fetched.
function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0f1117]">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
    </div>
  );
}

// Error Boundary Component
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Application error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0f1117] py-12 px-4 sm:px-6 lg:px-6">
          <div className="max-w-md w-full space-y-8">
            <div className="text-center">
              <div className="mx-auto h-12 w-12 text-red-400">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h2 className="mt-2 text-lg font-medium text-gray-900 dark:text-white">Something went wrong</h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                An unexpected error occurred. Please refresh the page to try again.
              </p>
              <div className="mt-6">
                <button
                  onClick={() => window.location.reload()}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
                >
                  Refresh Page
                </button>
              </div>
              {import.meta.env.DEV && this.state.error && (
                <details className="mt-4 text-left">
                  <summary className="cursor-pointer text-sm text-gray-600 dark:text-gray-400">Error Details</summary>
                  <pre className="mt-2 text-xs text-red-600 bg-red-50 dark:bg-red-900/20 p-2 rounded overflow-auto">
                    {this.state.error.stack}
                  </pre>
                </details>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Wrapper for BuildFlow to handle data fetching
function BuildFlowWrapper() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { isLoaded: isAuthLoaded, isSignedIn } = useAuth();
  const [dataset, setDataset] = React.useState<Dataset | null>(null);
  const [projectClasses, setProjectClasses] = React.useState<ClassDef[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const loadData = async () => {
      // Don't load data if auth isn't ready or user isn't signed in
      if (!isAuthLoaded || !isSignedIn) return;
      if (!projectId) return;
      try {
        const project = await projectsApi.get(projectId);
        // With simplified schema, project directly contains assets
        // Create a virtual dataset from project assets for BuildFlow compatibility
        const virtualDataset: Dataset = {
          id: projectId,
          projectId: projectId,
          name: project.name,
          createdAt: project.createdAt,
          assets: project.assets || [],
        };
        setDataset(virtualDataset);
        setProjectClasses(project.classes);
      } catch (error) {
        console.error('Failed to load project:', error);
        // Don't navigate on 401 - auth will handle it
        if ((error as any)?.response?.status !== 401) {
          navigate('/projects');
        }
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [projectId, navigate, isAuthLoaded, isSignedIn]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0f1117]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!dataset) return null;

  return (
    <BuildFlow
      dataset={dataset}
      projectId={projectId}
      classes={projectClasses}
      onBack={() => navigate('/projects')}
      onComplete={() => navigate('/projects')}
    />
  );
}

function LabelingWrapper() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  return (
    <LabelingInterface
      onBack={() => navigate('/projects')}
      projectId={projectId}
    />
  );
}

// Protected route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut>
        <Navigate to="/auth/sign-in" replace />
      </SignedOut>
    </>
  );
}

// App routes
function AppRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
    <Routes>
      {/* Landing page - public */}
      <Route path="/" element={<LandingPage />} />
      
      {/* Auth routes */}
      <Route path="/auth/sign-in/*" element={<Auth mode="sign-in" />} />
      <Route path="/auth/sign-up/*" element={<Auth mode="sign-up" />} />
      
      {/* Protected routes */}
      <Route 
        path="/projects" 
        element={
          <ProtectedRoute>
            <Projects />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/labeling/:projectId" 
        element={
          <ProtectedRoute>
            <LabelingWrapper />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/build/:projectId" 
        element={
          <ProtectedRoute>
            <BuildFlowWrapper />
          </ProtectedRoute>
        } 
      />
      
      {/* Default redirect for unknown routes */}
      <Route path="*" element={<DefaultRedirect />} />
    </Routes>
    </Suspense>
  );
}

function DefaultRedirect() {
  return (
    <>
      <SignedIn>
        <Navigate to="/projects" replace />
      </SignedIn>
      <SignedOut>
        <Navigate to="/auth/sign-in" replace />
      </SignedOut>
    </>
  );
}

function AppContent() {
  const location = useLocation();
  const hideDockOn = location.pathname === '/projects' || location.pathname.startsWith('/labeling/');

  return (
    <>
      <AppRoutes />
      <SignedIn>
        {!hideDockOn && (
          <div className="fixed bottom-5 right-5 z-50">
            <ThemeDropdown className="shadow-glow" />
          </div>
        )}
      </SignedIn>
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ClerkTokenProvider>
        <SettingsProvider>
          <BrowserRouter>
            <AppContent />
          </BrowserRouter>
        </SettingsProvider>
      </ClerkTokenProvider>
    </ErrorBoundary>
  );
}
