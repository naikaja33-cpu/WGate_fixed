import { useMemo, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { wgate } from '@/api/wgateClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { UserCheck, X, Repeat, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';

// Keep this in sync with PRE_APPROVAL_CATEGORIES in server/wgate-server.mjs.
const CATEGORIES = ['Guest', 'Maid', 'Cook', 'Nanny', 'Driver', 'Delivery', 'Other'];

const todayStr = () => new Date().toISOString().slice(0, 10);

function StatusBadge({ status }) {
  const active = status === 'active';
  return (
    <span
      className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border ${
        active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-muted text-muted-foreground border-border'
      }`}
    >
      {active ? 'Active' : 'Cancelled'}
    </span>
  );
}

export default function PreApprovals() {
  const { user } = useAuth();
  const role = user?.role || 'resident';
  const isAdmin = role === 'admin';
  const isGuard = role === 'guard';
  const isResident = role === 'tenant' || role === 'owner';
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    visitor_name: '',
    visitor_phone: '',
    category: CATEGORIES[0],
    frequency: 'once',
    valid_from: todayStr(),
    valid_until: '',
    notes: '',
  });
  const [formError, setFormError] = useState('');

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['pre-approvals'],
    queryFn: () => wgate.entities.PreApproval.list('-created_date', 200),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['pre-approvals'] });

  const createMutation = useMutation({
    mutationFn: (data) => wgate.entities.PreApproval.create(data),
    onSuccess: () => {
      invalidate();
      setFormError('');
      setForm((f) => ({ ...f, visitor_name: '', visitor_phone: '', notes: '' }));
    },
    onError: (err) => setFormError(err?.message || 'Failed to create pre-approval'),
  });

  const cancelMutation = useMutation({
    mutationFn: (id) => wgate.entities.PreApproval.update(id, { status: 'cancelled' }),
    onSuccess: invalidate,
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.visitor_name.trim()) {
      setFormError('Visitor name is required');
      return;
    }
    const phoneDigits = form.visitor_phone.replace(/\D/g, '');
    if (phoneDigits.length < 7 || phoneDigits.length > 15) {
      setFormError('Enter a valid phone number');
      return;
    }
    if (form.frequency === 'daily' && !form.valid_until) {
      setFormError('An end date is required for a daily pre-approval');
      return;
    }
    createMutation.mutate(form);
  };

  // Resident: their own pre-approvals, active first, most recent first.
  const myRecords = useMemo(
    () =>
      records
        .filter((r) => r.resident_email === user?.email)
        .sort((a, b) => (a.status === b.status ? 0 : a.status === 'active' ? -1 : 1)),
    [records, user?.email]
  );

  // Admin: everyone's pre-approvals, active first.
  const allRecords = useMemo(
    () => [...records].sort((a, b) => (a.status === b.status ? 0 : a.status === 'active' ? -1 : 1)),
    [records]
  );

  // Guard: who's actually valid to walk in today, for quick reference at the gate.
  const activeToday = useMemo(() => {
    const today = todayStr();
    return records
      .filter((r) => r.status === 'active' && r.valid_from <= today && today <= r.valid_until)
      .sort((a, b) => a.visitor_name.localeCompare(b.visitor_name));
  }, [records]);

  const list = isGuard ? activeToday : isAdmin ? allRecords : myRecords;

  return (
    <div className="p-4 space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-foreground">Pre-Approvals</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pre-approve a guest or a recurring maid/cook/nanny so security can let them in without waiting on you each time.
        </p>
      </div>

      {(isResident || isAdmin) && (
        <form onSubmit={handleSubmit} className="bg-card rounded-2xl border border-border p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Visitor name</Label>
              <Input
                value={form.visitor_name}
                onChange={(e) => setForm((f) => ({ ...f, visitor_name: e.target.value }))}
                placeholder="e.g. Sunita"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Phone number</Label>
              <Input
                value={form.visitor_phone}
                onChange={(e) => setForm((f) => ({ ...f, visitor_phone: e.target.value.replace(/\D/g, '').slice(0, 15) }))}
                placeholder="Phone number (with country code if not Indian)"
                inputMode="numeric"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Frequency</Label>
              <Select
                value={form.frequency}
                onValueChange={(v) => setForm((f) => ({ ...f, frequency: v, valid_until: v === 'once' ? '' : f.valid_until }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="once">One-time visit</SelectItem>
                  <SelectItem value="daily">Daily / recurring</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{form.frequency === 'once' ? 'Expected date' : 'Start date'}</Label>
              <Input
                type="date"
                min={todayStr()}
                value={form.valid_from}
                onChange={(e) => setForm((f) => ({ ...f, valid_from: e.target.value }))}
                required
              />
            </div>
            {form.frequency === 'daily' && (
              <div className="space-y-2">
                <Label>Valid until</Label>
                <Input
                  type="date"
                  min={form.valid_from || todayStr()}
                  value={form.valid_until}
                  onChange={(e) => setForm((f) => ({ ...f, valid_until: e.target.value }))}
                  required
                />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Input
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="e.g. comes in through the back gate"
            />
          </div>

          {formError && <p className="text-sm text-red-600">{formError}</p>}

          <Button type="submit" className="w-full" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Saving…' : 'Create Pre-Approval'}
          </Button>
        </form>
      )}

      <div className="space-y-3">
        <h2 className="font-semibold text-foreground flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-primary" />
          {isGuard ? "Active today — let these in" : isAdmin ? 'All pre-approvals' : 'My pre-approvals'}
        </h2>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : list.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {isGuard ? 'No one is pre-approved for today.' : 'No pre-approvals yet.'}
          </p>
        ) : (
          list.map((r) => (
            <div key={r.id} className="bg-card rounded-2xl border border-border p-4 flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-foreground">{r.visitor_name}</p>
                  <span className="text-xs text-muted-foreground">({r.category})</span>
                  {!isGuard && <StatusBadge status={r.status} />}
                </div>
                <p className="text-sm text-muted-foreground">{r.visitor_phone}</p>
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  {r.frequency === 'daily' ? <Repeat className="w-3 h-3" /> : <CalendarDays className="w-3 h-3" />}
                  {r.frequency === 'daily'
                    ? `${format(new Date(r.valid_from), 'd MMM')} – ${format(new Date(r.valid_until), 'd MMM yyyy')}`
                    : format(new Date(r.valid_from), 'd MMM yyyy')}
                </p>
                {(isAdmin || isGuard) && (
                  <p className="text-xs text-muted-foreground mt-1">Flat {r.flat_number || '—'} · {r.resident_email}</p>
                )}
                {r.notes && <p className="text-xs text-muted-foreground mt-1">{r.notes}</p>}
              </div>
              {!isGuard && r.status === 'active' && (
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
    </div>
  );
}
