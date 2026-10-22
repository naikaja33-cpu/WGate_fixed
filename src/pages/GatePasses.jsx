import { useMemo, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { wgate } from '@/api/wgateClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { KeyRound, X, Copy, Check, ShieldCheck, ScanLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const todayStr = () => new Date().toISOString().slice(0, 10);

function StatusBadge({ status }) {
  const styles = {
    active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    used: 'bg-muted text-muted-foreground border-border',
    cancelled: 'bg-red-50 text-red-600 border-red-200',
  };
  const labels = { active: 'Active', used: 'Used', cancelled: 'Cancelled' };
  return (
    <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border ${styles[status] || styles.active}`}>
      {labels[status] || status}
    </span>
  );
}

function CodeDisplay({ code }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — the code is already shown on screen
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="flex items-center gap-2 font-mono text-2xl font-bold tracking-[0.2em] text-primary bg-primary/5 border border-primary/20 rounded-xl px-4 py-2"
    >
      {code}
      {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
    </button>
  );
}

export default function GatePasses() {
  const { user } = useAuth();
  const role = user?.role || 'resident';
  const isAdmin = role === 'admin';
  const isGuard = role === 'guard';
  const isResident = role === 'tenant' || role === 'owner';
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    visitor_name: '',
    visitor_phone: '',
    valid_date: todayStr(),
    notes: '',
  });
  const [formError, setFormError] = useState('');
  const [lastCreated, setLastCreated] = useState(null);

  const [verifyCode, setVerifyCode] = useState('');
  const [verifyResult, setVerifyResult] = useState(null); // { ok, message, visitor_name }

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['gate-passes'],
    queryFn: () => wgate.entities.GatePass.list('-created_date', 200),
    enabled: !isGuard, // guard only verifies codes, doesn't need the full list
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['gate-passes'] });

  const createMutation = useMutation({
    mutationFn: (data) => wgate.entities.GatePass.create(data),
    onSuccess: (record) => {
      invalidate();
      setFormError('');
      setLastCreated(record);
      setForm((f) => ({ ...f, visitor_name: '', visitor_phone: '', notes: '' }));
    },
    onError: (err) => setFormError(err?.message || 'Failed to create gate pass'),
  });

  const cancelMutation = useMutation({
    mutationFn: (id) => wgate.entities.GatePass.update(id, { status: 'cancelled' }),
    onSuccess: invalidate,
  });

  const verifyMutation = useMutation({
    mutationFn: (code) => wgate.gatePass.verify(code),
    onSuccess: (res) => {
      setVerifyResult({ ok: true, message: `Admitted — ${res.visitor.visitor_name}` });
      setVerifyCode('');
    },
    onError: (err) => setVerifyResult({ ok: false, message: err?.message || 'Could not verify that code' }),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.visitor_name.trim()) {
      setFormError('Visitor name is required');
      return;
    }
    createMutation.mutate(form);
  };

  const handleVerify = (e) => {
    e.preventDefault();
    setVerifyResult(null);
    if (verifyCode.trim().length !== 6) {
      setVerifyResult({ ok: false, message: 'Enter the 6-character code' });
      return;
    }
    verifyMutation.mutate(verifyCode.trim());
  };

  const myRecords = useMemo(
    () =>
      records
        .filter((r) => r.resident_email === user?.email)
        .sort((a, b) => (a.status === b.status ? 0 : a.status === 'active' ? -1 : 1)),
    [records, user?.email]
  );
  const allRecords = useMemo(
    () => [...records].sort((a, b) => (a.status === b.status ? 0 : a.status === 'active' ? -1 : 1)),
    [records]
  );
  const list = isAdmin ? allRecords : myRecords;

  return (
    <div className="p-4 space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-foreground">Gate Pass</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isGuard
            ? 'Enter the code the visitor shows you — no approval needed, the code is the approval.'
            : 'Create a one-time code for a guest. Share it with them — security just checks the code, no waiting on you.'}
        </p>
      </div>

      {(isGuard || isAdmin) && (
        <form onSubmit={handleVerify} className="bg-card rounded-2xl border border-border p-4 space-y-3">
          <Label className="flex items-center gap-2">
            <ScanLine className="w-4 h-4 text-primary" /> Verify a code
          </Label>
          <div className="flex gap-2">
            <Input
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
              placeholder="e.g. H4KQ2P"
              className="font-mono text-lg tracking-widest uppercase"
              maxLength={6}
            />
            <Button type="submit" disabled={verifyMutation.isPending}>
              {verifyMutation.isPending ? 'Checking…' : 'Verify'}
            </Button>
          </div>
          {verifyResult && (
            <p className={`text-sm flex items-center gap-1.5 ${verifyResult.ok ? 'text-emerald-600' : 'text-red-600'}`}>
              {verifyResult.ok && <ShieldCheck className="w-4 h-4" />}
              {verifyResult.message}
            </p>
          )}
        </form>
      )}

      {(isResident || isAdmin) && (
        <form onSubmit={handleSubmit} className="bg-card rounded-2xl border border-border p-4 space-y-4">
          {lastCreated && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-2">
              <p className="text-xs font-medium text-emerald-800">Pass created — share this code:</p>
              <CodeDisplay code={lastCreated.code} />
              <p className="text-xs text-emerald-700">Valid on {format(new Date(lastCreated.valid_date), 'd MMM yyyy')} only.</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Visitor name</Label>
              <Input
                value={form.visitor_name}
                onChange={(e) => setForm((f) => ({ ...f, visitor_name: e.target.value }))}
                placeholder="e.g. Rahul"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Phone (optional)</Label>
              <Input
                value={form.visitor_phone}
                onChange={(e) => setForm((f) => ({ ...f, visitor_phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                placeholder="10-digit number"
                inputMode="numeric"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Valid date</Label>
            <Input
              type="date"
              min={todayStr()}
              value={form.valid_date}
              onChange={(e) => setForm((f) => ({ ...f, valid_date: e.target.value }))}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Input
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="e.g. picking up a parcel"
            />
          </div>

          {formError && <p className="text-sm text-red-600">{formError}</p>}

          <Button type="submit" className="w-full" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Creating…' : 'Create Gate Pass'}
          </Button>
        </form>
      )}

      {!isGuard && (
        <div className="space-y-3">
          <h2 className="font-semibold text-foreground flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-primary" />
            {isAdmin ? 'All gate passes' : 'My gate passes'}
          </h2>

          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : list.length === 0 ? (
            <p className="text-sm text-muted-foreground">No gate passes yet.</p>
          ) : (
            list.map((r) => (
              <div key={r.id} className="bg-card rounded-2xl border border-border p-4 flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-mono font-bold text-foreground tracking-wider">{r.code}</p>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="text-sm text-muted-foreground">{r.visitor_name}{r.visitor_phone ? ` · ${r.visitor_phone}` : ''}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Valid {format(new Date(r.valid_date), 'd MMM yyyy')}
                    {r.status === 'used' && r.used_at ? ` · used ${format(new Date(r.used_at), 'd MMM, h:mm a')}` : ''}
                  </p>
                  {isAdmin && <p className="text-xs text-muted-foreground mt-1">Flat {r.flat_number || '—'} · {r.resident_email}</p>}
                  {r.notes && <p className="text-xs text-muted-foreground mt-1">{r.notes}</p>}
                </div>
                {r.status === 'active' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-red-200 text-red-600 hover:bg-red-50 shrink-0"
                    onClick={() => cancelMutation.mutate(r.id)}
                    disabled={cancelMutation.isPending}
                  >
                    <X className="w-4 h-4 mr-1" /> Cancel
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
