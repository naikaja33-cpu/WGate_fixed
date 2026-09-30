import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { User, Pencil, Trash2, Check, X } from 'lucide-react';

const roleColors = {
  admin: 'bg-purple-100 text-purple-700 border-purple-200',
  owner: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  tenant: 'bg-blue-100 text-blue-700 border-blue-200',
  guard: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

const roleLabels = {
  admin: 'Admin',
  owner: 'Owner',
  tenant: 'Tenant',
  guard: 'Security',
};

export default function UserManagementCard({ member, onEdit, onDelete, onApprove, onReject }) {
  const isPending = member.approval_status === 'pending';
  const isRejected = member.approval_status === 'rejected';

  return (
    <div className="bg-card rounded-2xl border border-border p-4 flex items-center gap-3 hover:shadow-sm transition-all">
      <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
        <User className="w-5 h-5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-foreground text-sm truncate">{member.full_name || '—'}</p>
        <p className="text-xs text-muted-foreground truncate">{member.email}</p>
        {member.flat_number && (
          <p className="text-xs text-muted-foreground">Flat {member.flat_number}</p>
        )}
        {member.phone && isPending && (
          <p className="text-xs text-muted-foreground">{member.phone}</p>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {isPending && (
          <Badge className="text-xs border bg-amber-100 text-amber-700 border-amber-200">Pending</Badge>
        )}
        {isRejected && (
          <Badge className="text-xs border bg-red-100 text-red-700 border-red-200">Rejected</Badge>
        )}
        {(isPending || isRejected) && onApprove && (
          <button
            onClick={() => onApprove(member)}
            title="Approve"
            aria-label={`Approve ${member.full_name || member.email}`}
            className="text-muted-foreground hover:text-emerald-600 transition-colors"
          >
            <Check className="w-4 h-4" />
          </button>
        )}
        {isPending && onReject && (
          <button
            onClick={() => onReject(member)}
            title="Reject"
            aria-label={`Reject ${member.full_name || member.email}`}
            className="text-muted-foreground hover:text-destructive transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        <Badge className={`text-xs border capitalize ${roleColors[member.role] || roleColors.resident}`}>
          {roleLabels[member.role] || member.role}
        </Badge>
        <button onClick={() => onEdit(member)} className="text-muted-foreground hover:text-foreground transition-colors">
          <Pencil className="w-4 h-4" />
        </button>
        <button onClick={() => onDelete(member)} className="text-muted-foreground hover:text-destructive transition-colors">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}