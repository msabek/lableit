import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { access, AccessRequestItem } from '../api';
import Logo from './Logo';
import { Loader2, Check, ArrowLeft, ShieldCheck, Clock, ShieldX, RefreshCw } from 'lucide-react';

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-500/15 text-amber-500',
  approved: 'bg-emerald-500/15 text-emerald-500',
  denied: 'bg-red-500/15 text-red-400',
};

// Admin-only page to review and approve/deny access requests. The API forbids
// non-admins, so a non-admin who reaches the URL just sees a forbidden state.
export default function AdminAccessRequests() {
  const navigate = useNavigate();
  const [requests, setRequests] = useState<AccessRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { requests } = await access.adminList();
      setRequests(requests);
    } catch (err: any) {
      setError(err?.response?.status === 403
        ? 'You do not have admin access.'
        : (err?.message || 'Failed to load requests'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const decide = async (id: string, decision: 'approve' | 'deny') => {
    setActing(id);
    try {
      await access.adminDecide(id, decision);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Action failed');
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-background)] bg-mesh-gradient">
      <header className="sticky top-0 z-40 glass-panel border-b border-glass-border">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/projects')} className="icon-button-glass" title="Back to projects">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <Logo size="md" />
            <span className="badge-glass text-xs text-text-muted flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" /> Admin · Access requests
            </span>
          </div>
          <button onClick={load} className="icon-button-glass" title="Refresh">
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto p-6">
        {error && (
          <div className="mb-5 p-4 glass-panel rounded-xl border-red-500/30 text-red-400 text-sm">{error}</div>
        )}

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : requests.length === 0 ? (
          <div className="glass-card rounded-2xl text-center py-16">
            <Clock className="w-10 h-10 mx-auto mb-3 text-text-muted opacity-50" />
            <p className="text-text">No access requests yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((r) => (
              <div key={r.id} className="glass-card rounded-2xl p-5">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-text truncate">{r.email}</span>
                      <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-md ${STATUS_STYLES[r.accessStatus] || ''}`}>
                        {r.accessStatus}
                      </span>
                    </div>
                    <div className="text-sm text-text-muted space-y-0.5">
                      {r.institution && <p><span className="text-text">Institution:</span> {r.institution}</p>}
                      {r.phone && <p><span className="text-text">Phone:</span> {r.phone}</p>}
                      {r.useCase && <p><span className="text-text">Use:</span> {r.useCase}</p>}
                      {r.requestedAt && (
                        <p className="text-xs opacity-70">Requested {new Date(r.requestedAt).toLocaleString()}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {r.accessStatus !== 'approved' && (
                      <button
                        onClick={() => decide(r.id, 'approve')}
                        disabled={acting === r.id}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25 transition-all text-sm disabled:opacity-50"
                      >
                        {acting === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Approve
                      </button>
                    )}
                    {r.accessStatus !== 'denied' && (
                      <button
                        onClick={() => decide(r.id, 'deny')}
                        disabled={acting === r.id}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-all text-sm disabled:opacity-50"
                      >
                        <ShieldX className="w-4 h-4" /> Deny
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
