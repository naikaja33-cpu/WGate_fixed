import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { wgate } from '@/api/wgateClient';
import { useAuth } from '@/lib/AuthContext';
import { toast } from 'sonner';
import { Plus, Users, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import UserManagementCard from './UserManagementCard';
import InviteEditUserModal from './InviteEditUserModal';
import PasswordResetModal from './PasswordResetModal';

export default function UserManagementSection() {
  const { user } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [resetResult, setResetResult] = useState(null); // { name, email, password, email_sent, email_error }
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['all-users'],
    queryFn: () => wgate.entities.User.list('-created_date', 200),
  });

  const { data: resetRequests = [] } = useQuery({
    queryKey: ['reset-requests'],
    queryFn: () => wgate.users.listResetRequests(),
    refetchInterval: 30000,
  });

  const handleEdit = (member) => {
    setEditingMember(member);
    setShowModal(true);
  };

  const handleDelete = async (member) => {
    if (!window.confirm(`Remove ${member.full_name || member.email} from the app?`)) return;
    await wgate.entities.User.delete(member.id);
    queryClient.invalidateQueries({ queryKey: ['all-users'] });
  };

  const handleResetPassword = async (member) => {
    const label = member.full_name || member.email;
    if (!window.confirm(`Reset the password for ${label}? They will be signed out and given a new temporary password.`)) return;
    try {
      const result = await wgate.users.resetPassword(member.id);
      setResetResult({ ...result, name: label });
    } catch (err) {
      toast.error(err?.message || 'Could not reset the password');
    }
  };

  const handleResolveRequest = async (request) => {
    const label = request.full_name || request.email;
    if (!window.confirm(`Reset the password for ${label}? They will be signed out and given a new temporary password.`)) return;
    try {
      const result = await wgate.users.resolveResetRequest(request.id);
      setResetResult({ ...result, name: result.name || label });
      queryClient.invalidateQueries({ queryKey: ['reset-requests'] });
    } catch (err) {
      toast.error(err?.message || 'Could not resolve the request');
    }
  };

  const handleDismissRequest = async (request) => {
    const label = request.full_name || request.email;
    if (!window.confirm(`Dismiss the reset request from ${label}?`)) return;
    try {
      await wgate.users.dismissResetRequest(request.id);
      queryClient.invalidateQueries({ queryKey: ['reset-requests'] });
    } catch (err) {
      toast.error(err?.message || 'Could not dismiss the request');
    }
  };

  const setApproval = async (member, status) => {
    if (status === 'rejected' && !window.confirm(`Reject the registration from ${member.full_name || member.email}?`)) return;
    try {
      await wgate.entities.User.update(member.id, {
        approval_status: status,
        is_verified: status === 'approved',
      });
      toast.success(status === 'approved' ? 'Owner approved' : 'Registration rejected');
      queryClient.invalidateQueries({ queryKey: ['all-users'] });
    } catch (err) {
      toast.error(err?.message || 'Could not update the registration');
    }
  };

  const handleSaved = () => {
    setShowModal(false);
    setEditingMember(null);
    queryClient.invalidateQueries({ queryKey: ['all-users'] });
  };

  const pendingCount = members.filter(m => m.approval_status === 'pending').length;

  const filtered = members.filter(m => {
    const q = search.toLowerCase();
    return (
      !q ||
      m.email?.toLowerCase().includes(q) ||
      m.full_name?.toLowerCase().includes(q) ||
      m.flat_number?.toLowerCase().includes(q)
    );
  }).sort((a, b) => Number(b.approval_status === 'pending') - Number(a.approval_status === 'pending'));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-foreground flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          Society Members
        </h2>
        <Button size="sm" className="rounded-xl" onClick={() => { setEditingMember(null); setShowModal(true); }}>
          <Plus className="w-4 h-4 mr-1" /> Invite
        </Button>
      </div>

      {pendingCount > 0 && (
        <p className="text-sm rounded-xl border border-amber-200 bg-amber-50 text-amber-800 px-3 py-2">
          {pendingCount} owner registration{pendingCount === 1 ? '' : 's'} awaiting your approval.
        </p>
      )}

      {resetRequests.length > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 space-y-2">
          <p className="text-sm font-medium text-blue-900 flex items-center gap-1.5">
            <KeyRound className="w-4 h-4" />
            {resetRequests.length} password reset request{resetRequests.length === 1 ? '' : 's'}
          </p>
          <div className="space-y-1.5">
            {resetRequests.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 bg-white rounded-lg px-2.5 py-1.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{r.full_name || r.email}</p>
                  <p className="text-xs text-muted-foreground truncate">{r.email}</p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleDismissRequest(r)}>
                    Dismiss
                  </Button>
                  <Button size="sm" className="h-7 text-xs" onClick={() => handleResolveRequest(r)}>
                    Reset
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Input
        placeholder="Search by name, email or flat..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="h-8 text-sm"
      />

      {isLoading ? (
        <div className="flex justify-center py-6">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No members found</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(m => (
            <UserManagementCard
              key={m.id}
              member={m}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onApprove={(mem) => setApproval(mem, 'approved')}
              onReject={(mem) => setApproval(mem, 'rejected')}
              onResetPassword={m.id === user?.id ? undefined : handleResetPassword}
            />
          ))}
        </div>
      )}

      {showModal && (
        <InviteEditUserModal
          member={editingMember}
          onClose={() => { setShowModal(false); setEditingMember(null); }}
          onSaved={handleSaved}
        />
      )}

      {resetResult && (
        <PasswordResetModal
          result={resetResult}
          memberName={resetResult.name}
          onClose={() => setResetResult(null)}
        />
      )}
    </div>
  );
}