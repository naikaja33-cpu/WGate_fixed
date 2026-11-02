import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, UserPlus, Trash2, Copy, Check, X } from 'lucide-react';
import { wgate } from '@/api/wgateClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const RELATIONS = [
  { value: 'spouse', label: 'Spouse' },
  { value: 'son', label: 'Son' },
  { value: 'daughter', label: 'Daughter' },
  { value: 'father', label: 'Father' },
  { value: 'mother', label: 'Mother' },
  { value: 'brother', label: 'Brother' },
  { value: 'sister', label: 'Sister' },
  { value: 'other', label: 'Other' },
];
const relationLabel = (value) => RELATIONS.find((r) => r.value === value)?.label || 'Family';
const EMPTY = { full_name: '', relation: 'spouse', phone: '', email: '' };

export default function FamilySection() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null); // login details shown once after adding
  const [copied, setCopied] = useState(false);

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['family'],
    queryFn: () => wgate.family.list(),
  });

  const addMutation = useMutation({
    mutationFn: (data) => wgate.family.add(data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['family'] });
      setShowForm(false);
      setForm(EMPTY);
      setCreated({ email: result.email, password: result.initial_password, email_sent: result.email_sent });
    },
    onError: (err) => setError(err?.message || 'Could not add family member'),
  });

  const removeMutation = useMutation({
    mutationFn: (id) => wgate.family.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['family'] }),
    onError: (err) => window.alert(err?.message || 'Could not remove family member'),
  });

  const setField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = () => {
    setError('');
    if (!form.full_name.trim()) return setError("Enter the family member's name");
    if (!form.email.trim()) return setError('Enter an email address');
    const digits = form.phone.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) return setError('Enter a valid phone number');
    addMutation.mutate({ ...form, full_name: form.full_name.trim(), email: form.email.trim(), phone: form.phone.trim() });
  };

  const handleRemove = (member) => {
    if (window.confirm(`Remove ${member.full_name} from your family members? They will be signed out and lose access.`)) {
      removeMutation.mutate(member.id);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`Email: ${created.email}\nPassword: ${created.password}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — the details are still on screen.
    }
  };

  return (
    <>
      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" /> Family Members
            </CardTitle>
            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => { setError(''); setShowForm(true); }}>
              <UserPlus className="w-4 h-4 mr-1" /> Add
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Family members get their own login for your flat. They can approve visitors and create
            pre-approvals and gate passes. They cannot see billing.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No family members added yet.</p>
          ) : (
            members.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3 bg-muted rounded-xl px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{m.full_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{relationLabel(m.relation)} · {m.email}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(m)}
                  disabled={removeMutation.isPending}
                  aria-label={`Remove ${m.full_name}`}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
          <div className="bg-card w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Add Family Member</h2>
              <button onClick={() => setShowForm(false)} aria-label="Close"><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Full Name</Label>
                <Input value={form.full_name} onChange={setField('full_name')} maxLength={100} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Relation</Label>
                <Select value={form.relation} onValueChange={(v) => setForm((f) => ({ ...f, relation: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RELATIONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Phone</Label>
                <Input
                  type="tel"
                  inputMode="tel"
                  placeholder="e.g. 9876543210"
                  value={form.phone}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const digits = raw.replace(/\D/g, '').slice(0, 15);
                    setForm((f) => ({ ...f, phone: raw.trim().startsWith('+') ? `+${digits}` : digits }));
                  }}
                  maxLength={16}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Email (their login)</Label>
                <Input type="email" placeholder="name@email.com" value={form.email} onChange={setField('email')} />
              </div>
              {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
            </div>
            <Button className="w-full" onClick={handleSubmit} disabled={addMutation.isPending}>
              {addMutation.isPending ? 'Adding...' : 'Add Family Member'}
            </Button>
          </div>
        </div>
      )}

      {created && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
          <div className="bg-card w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Family Member Added</h2>
              <button onClick={() => setCreated(null)} aria-label="Close"><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <p className="text-sm text-muted-foreground">
              {created.email_sent
                ? `An email with these login details was sent to ${created.email}.`
                : 'We could not send an email, so please share these login details with them directly.'}
            </p>
            <div className="bg-muted rounded-xl p-3 space-y-1 text-sm">
              <p><span className="text-muted-foreground">Email:</span> <span className="font-medium">{created.email}</span></p>
              <p><span className="text-muted-foreground">Temporary password:</span> <span className="font-medium">{created.password}</span></p>
            </div>
            <p className="text-xs text-muted-foreground">They will be asked to choose a new password when they first sign in.</p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={handleCopy}>
                {copied ? <Check className="w-4 h-4 mr-1.5" /> : <Copy className="w-4 h-4 mr-1.5" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
              <Button className="flex-1" onClick={() => setCreated(null)}>Done</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}