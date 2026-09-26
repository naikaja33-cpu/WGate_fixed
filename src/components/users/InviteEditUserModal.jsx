import { useState } from 'react';
import { X, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { base44 } from '@/api/base44Client';

export default function InviteEditUserModal({ member, onClose, onSaved }) {
  const isEdit = !!member;
  const [email, setEmail] = useState(member?.email || '');
  const [name, setName] = useState(member?.full_name || '');
  const [phone, setPhone] = useState(member?.phone || '');
  const [role, setRole] = useState(member?.role || 'tenant');
  const [flatNumber, setFlatNumber] = useState(member?.flat_number || '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [invited, setInvited] = useState(null); // { email, password } once an invite succeeds
  const [copied, setCopied] = useState(false);

  const handleSubmit = async () => {
    setError('');
    if (!email.trim()) { setError('Email is required'); return; }
    setIsLoading(true);
    try {
      if (isEdit) {
        await base44.entities.User.update(member.id, { role, flat_number: flatNumber, phone });
        onSaved();
      } else {
        const created = await base44.users.inviteUser(email.trim(), role, {
          full_name: name.trim() || undefined,
          phone: phone.trim() || undefined,
        });
        // Show the credentials so the admin can share them — there's no
        // email service in this local/self-hosted setup, so this is the
        // only place the new user's temporary password is visible.
        setInvited({ email: created.email, password: created.initial_password });
      }
    } catch (e) {
      setError(e?.message || 'Something went wrong');
    }
    setIsLoading(false);
  };

  const handleCopy = async () => {
    if (!invited) return;
    const text = `Email: ${invited.email}\nPassword: ${invited.password}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — credentials are still shown on screen.
    }
  };

  const handleDone = () => {
    setInvited(null);
    onSaved();
  };

  if (invited) {
    return (
      <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
        <div className="bg-card w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Member Invited</h2>
            <button onClick={handleDone}><X className="w-5 h-5 text-muted-foreground" /></button>
          </div>

          <p className="text-sm text-muted-foreground">
            Share these login details with them directly — there's no automatic invite email in this setup.
          </p>

          <div className="bg-muted rounded-xl p-3 space-y-1 text-sm">
            <p><span className="text-muted-foreground">Email:</span> <span className="font-medium">{invited.email}</span></p>
            <p><span className="text-muted-foreground">Temporary password:</span> <span className="font-medium">{invited.password}</span></p>
          </div>

          <p className="text-xs text-muted-foreground">They should change this password after signing in.</p>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={handleCopy}>
              {copied ? <Check className="w-4 h-4 mr-1.5" /> : <Copy className="w-4 h-4 mr-1.5" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button className="flex-1" onClick={handleDone}>Done</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
      <div className="bg-card w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{isEdit ? 'Edit Member' : 'Invite New Member'}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Full Name</Label>
            <Input
              placeholder="e.g. Rahul Sharma"
              value={name}
              onChange={e => setName(e.target.value)}
              disabled={isEdit}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Contact Number</Label>
            <Input
              placeholder="e.g. 9876543210"
              value={phone}
              onChange={e => setPhone(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Email</Label>
            <Input
              placeholder="member@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              disabled={isEdit}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="owner">Owner</SelectItem>
                <SelectItem value="tenant">Tenant</SelectItem>
                <SelectItem value="guard">Security</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isEdit && (
            <div className="space-y-1.5">
              <Label className="text-xs">Flat Number</Label>
              <Input
                placeholder="e.g. A-101"
                value={flatNumber}
                onChange={e => setFlatNumber(e.target.value)}
              />
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <Button className="w-full" onClick={handleSubmit} disabled={isLoading}>
          {isLoading ? 'Saving...' : isEdit ? 'Save Changes' : 'Send Invite'}
        </Button>
      </div>
    </div>
  );
}
