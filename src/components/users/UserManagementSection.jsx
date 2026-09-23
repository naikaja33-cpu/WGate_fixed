import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import UserManagementCard from './UserManagementCard';
import InviteEditUserModal from './InviteEditUserModal';

export default function UserManagementSection() {
  const [showModal, setShowModal] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['all-users'],
    queryFn: () => base44.entities.User.list('-created_date', 200),
  });

  const handleEdit = (member) => {
    setEditingMember(member);
    setShowModal(true);
  };

  const handleDelete = async (member) => {
    if (!window.confirm(`Remove ${member.full_name || member.email} from the app?`)) return;
    await base44.entities.User.delete(member.id);
    queryClient.invalidateQueries({ queryKey: ['all-users'] });
  };

  const handleSaved = () => {
    setShowModal(false);
    setEditingMember(null);
    queryClient.invalidateQueries({ queryKey: ['all-users'] });
  };

  const filtered = members.filter(m => {
    const q = search.toLowerCase();
    return (
      !q ||
      m.email?.toLowerCase().includes(q) ||
      m.full_name?.toLowerCase().includes(q) ||
      m.flat_number?.toLowerCase().includes(q)
    );
  });

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
    </div>
  );
}
