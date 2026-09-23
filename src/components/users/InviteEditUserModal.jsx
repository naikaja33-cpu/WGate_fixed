import { useState } from 'react';
import { X } from 'lucide-react';
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
  const [role, setRole] = useState(member?.role || 'resident');
  const [flatNumber, setFlatNumber] = useState(member?.flat_number || '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setError('');
    if (!email.trim()) { setError('Email is required'); return; }
    setIsLoading(true);
    try {
      if (isEdit) {
        await base44.entities.User.update(member.id, { role, flat_number: flatNumber, phone });
      } else {
        // inviteUser only accepts "user" or "admin"; map custom roles accordingly
        const inviteRole = role === 'admin' ? 'admin' : 'user';
        await base44.users.inviteUser(email.trim(), inviteRole);
        // Note: after invite, admin can edit the member to set the correct role
      }
      onSaved();
    } catch (e) {
      setError(e?.message || 'Something went wrong');
    }
    setIsLoading(false);
  };

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
