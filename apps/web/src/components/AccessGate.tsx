import React, { useEffect, useState, useCallback } from 'react';
import { useUser, useClerk } from '@clerk/clerk-react';
import { access } from '../api';
import Logo from './Logo';
import { Loader2, Clock, ShieldX, Send, LogOut, AlertCircle, CheckCircle2 } from 'lucide-react';

type GateView = 'loading' | 'approved' | 'form' | 'pending' | 'denied' | 'error';

// Wraps protected content. After Clerk sign-in it checks the account's access
// status: approved accounts render the app; everyone else gets the gate screen
// (request form / pending / denied) and the app shell never mounts.
export function AccessGuard({ children }: { children: React.ReactNode }) {
  const { isLoaded } = useUser();
  const [view, setView] = useState<GateView>('loading');
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async () => {
    try {
      const s = await access.getStatus();
      if (s.isAdmin || s.status === 'approved') setView('approved');
      else if (s.status === 'denied') setView('denied');
      else setView(s.requested ? 'pending' : 'form');
    } catch (err: any) {
      setError(err?.message || 'Could not check access status');
      setView('error');
    }
  }, []);

  useEffect(() => {
    if (isLoaded) check();
  }, [isLoaded, check]);

  if (!isLoaded || view === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-background)] bg-mesh-gradient">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  if (view === 'approved') return <>{children}</>;

  return <AccessGateScreen view={view} error={error} onSubmitted={() => setView('pending')} onRetry={check} />;
}

function AccessGateScreen({
  view, error, onSubmitted, onRetry,
}: {
  view: GateView;
  error: string | null;
  onSubmitted: () => void;
  onRetry: () => void;
}) {
  const { user } = useUser();
  const { signOut } = useClerk();

  const name = user?.fullName || user?.firstName || '';
  const email = user?.primaryEmailAddress?.emailAddress || '';

  const [institution, setInstitution] = useState('');
  const [phone, setPhone] = useState('');
  const [useCase, setUseCase] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const submit = async () => {
    if (!institution.trim() || !useCase.trim()) {
      setFormError('Please fill in your institution and how you intend to use Lableit.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await access.submitRequest({ name, institution: institution.trim(), phone: phone.trim(), useCase: useCase.trim() });
      onSubmitted();
    } catch (err: any) {
      setFormError(err?.response?.data?.error || err?.message || 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-background)] bg-mesh-gradient p-4">
      <div className="glass-card rounded-2xl shadow-elevated-lg w-full max-w-lg p-6 sm:p-8 animate-scale-in">
        <div className="flex items-center justify-between mb-6">
          <Logo size="md" />
          <button
            onClick={() => signOut()}
            className="text-sm text-text-muted hover:text-text flex items-center gap-1.5 transition-colors"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>

        {view === 'denied' && (
          <div className="text-center py-6">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-red-500/15 flex items-center justify-center">
              <ShieldX className="w-7 h-7 text-red-400" />
            </div>
            <h2 className="text-xl font-bold text-text mb-2">Access not granted</h2>
            <p className="text-sm text-text-muted">
              Your request to use Lableit was not approved. If you believe this is a mistake,
              contact the administrator at the IHT Lab, University of Alberta.
            </p>
          </div>
        )}

        {view === 'pending' && (
          <div className="text-center py-6">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-amber-500/15 flex items-center justify-center">
              <Clock className="w-7 h-7 text-amber-400" />
            </div>
            <h2 className="text-xl font-bold text-text mb-2">Request received</h2>
            <p className="text-sm text-text-muted">
              Thanks{name ? `, ${name}` : ''}. Your access request is pending review by the
              administrator. You'll be able to use Lableit once it's approved.
            </p>
            <button
              onClick={onRetry}
              className="btn-secondary-glass mt-5 inline-flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" /> Check status
            </button>
          </div>
        )}

        {view === 'error' && (
          <div className="text-center py-6">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-red-500/15 flex items-center justify-center">
              <AlertCircle className="w-7 h-7 text-red-400" />
            </div>
            <h2 className="text-xl font-bold text-text mb-2">Something went wrong</h2>
            <p className="text-sm text-text-muted mb-5">{error}</p>
            <button onClick={onRetry} className="btn-primary-gradient inline-flex items-center gap-2">
              Try again
            </button>
          </div>
        )}

        {view === 'form' && (
          <>
            <h2 className="text-xl font-bold text-text mb-1">Request access</h2>
            <p className="text-sm text-text-muted mb-5">
              Lableit access is approved by the administrator. Tell us who you are and how you
              plan to use it; your request is emailed to the IHT Lab for review.
            </p>

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1">Name</label>
                  <input value={name} readOnly className="w-full px-3 py-2 rounded-xl glass-input text-text opacity-70" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1">Email</label>
                  <input value={email} readOnly className="w-full px-3 py-2 rounded-xl glass-input text-text opacity-70" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Institution / Organization *</label>
                <input
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                  placeholder="e.g. University of Alberta"
                  className="w-full px-3 py-2 rounded-xl glass-input text-text"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Phone number</label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 ..."
                  className="w-full px-3 py-2 rounded-xl glass-input text-text"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">How do you intend to use Lableit? *</label>
                <textarea
                  value={useCase}
                  onChange={(e) => setUseCase(e.target.value)}
                  rows={4}
                  placeholder="Briefly describe your project and intended use."
                  className="w-full px-3 py-2 rounded-xl glass-input text-text resize-none"
                />
              </div>

              {formError && (
                <div className="p-3 glass-panel rounded-xl border-red-500/30 flex items-center gap-2 text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <button
                onClick={submit}
                disabled={submitting}
                className="btn-primary-gradient w-full flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Submit request
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default AccessGuard;
