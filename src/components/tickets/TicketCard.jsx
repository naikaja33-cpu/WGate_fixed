import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import { Clock, ArrowRight, UserCheck } from 'lucide-react';
import { useState } from 'react';

const statusStyles = {
  open: 'bg-blue-100 text-blue-700 border-blue-200',
  in_progress: 'bg-amber-100 text-amber-700 border-amber-200',
  resolved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  closed: 'bg-muted text-muted-foreground border-border',
};

const priorityStyles = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-blue-50 text-blue-600',
  high: 'bg-orange-50 text-orange-600',
  urgent: 'bg-red-50 text-red-600',
};

const categoryIcons = {
  plumber: '🔧',
  electrician: '⚡',
  carpenter: '🪚',
  cleaning: '🧹',
  pest_control: '🐛',
  security: '🔒',
  other: '📋',
};

export default function TicketCard({ ticket, onUpdateStatus, isAdmin, isGuard }) {
  const [assigning, setAssigning] = useState(false);
  const [assignee, setAssignee] = useState(ticket.assigned_to || '');

  const nextStatus = {
    open: 'in_progress',
    in_progress: 'resolved',
    resolved: 'closed',
  };

  return (
    <div className="bg-card rounded-2xl border border-border p-4 space-y-3 transition-all hover:shadow-md">
      <div className="flex items-start justify-between">
        <div className="space-y-1 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-lg">{categoryIcons[ticket.category] || '📋'}</span>
            <h3 className="font-semibold text-foreground text-sm">{ticket.title}</h3>
          </div>
          <p className="text-xs text-muted-foreground">Flat {ticket.flat_number}</p>
        </div>
        <Badge className={`text-xs border ${statusStyles[ticket.status]} capitalize`}>
          {ticket.status?.replace('_', ' ')}
        </Badge>
      </div>

      {ticket.description && (
        <p className="text-sm text-muted-foreground line-clamp-2">{ticket.description}</p>
      )}

      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Badge variant="secondary" className={`text-xs ${priorityStyles[ticket.priority]} capitalize`}>
            {ticket.priority}
          </Badge>
          {ticket.created_date && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              {format(new Date(ticket.created_date), 'MMM d')}
            </span>
          )}
        </div>

        {isAdmin && nextStatus[ticket.status] && (
          <Button size="sm" variant="ghost" className="text-xs h-7 text-primary" onClick={() => onUpdateStatus(ticket, nextStatus[ticket.status])}>
            {nextStatus[ticket.status].replace('_', ' ')} <ArrowRight className="w-3 h-3 ml-1" />
          </Button>
        )}
        {isGuard && (
          <Button size="sm" variant="ghost" className="text-xs h-7 text-primary" onClick={() => setAssigning(v => !v)}>
            <UserCheck className="w-3 h-3 mr-1" /> Assign
          </Button>
        )}
      </div>

      {ticket.assigned_to && !assigning && (
        <p className="text-xs text-muted-foreground">Assigned to: <span className="font-medium text-foreground">{ticket.assigned_to}</span></p>
      )}

      {isGuard && assigning && (
        <div className="flex gap-2">
          <Input
            className="h-7 text-xs"
            placeholder="Enter assignee name"
            value={assignee}
            onChange={e => setAssignee(e.target.value)}
          />
          <Button size="sm" className="h-7 text-xs" onClick={() => {
            onUpdateStatus(ticket, ticket.status, { assigned_to: assignee });
            setAssigning(false);
          }}>Save</Button>
        </div>
      )}
    </div>
  );
}
