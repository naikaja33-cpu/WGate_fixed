import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import TicketCard from '@/components/tickets/TicketCard';
import AddTicketForm from '@/components/tickets/AddTicketForm';

export default function ServiceTickets() {
  const { user } = useAuth();
  const role = user?.role || 'resident';
  const isAdmin = role === 'admin';
  const isGuard = role === 'guard';
  const isResident = role === 'tenant' || role === 'owner';

  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const queryClient = useQueryClient();

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['tickets'],
    queryFn: () => {
      if (isAdmin || isGuard) return base44.entities.ServiceTicket.list('-created_date', 100);
      return base44.entities.ServiceTicket.filter({ resident_email: user.email }, '-created_date', 50);
    },
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.ServiceTicket.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      setShowForm(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ServiceTicket.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tickets'] }),
  });

  const handleUpdateStatus = (ticket, newStatus, extra = {}) => {
    updateMutation.mutate({ id: ticket.id, data: { status: newStatus, ...extra } });
  };

  const filtered = statusFilter === 'all'
    ? tickets
    : tickets.filter(t => t.status === statusFilter);

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Service Tickets</h1>
        {(isResident || isAdmin) && (
          <Button size="sm" onClick={() => setShowForm(true)} className="rounded-xl">
            <Plus className="w-4 h-4 mr-1" /> New Ticket
          </Button>
        )}
      </div>

      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList className="w-full bg-muted">
          <TabsTrigger value="all" className="flex-1 text-xs">All</TabsTrigger>
          <TabsTrigger value="open" className="flex-1 text-xs">Open</TabsTrigger>
          <TabsTrigger value="in_progress" className="flex-1 text-xs">In Progress</TabsTrigger>
          <TabsTrigger value="resolved" className="flex-1 text-xs">Resolved</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm">No tickets found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(t => (
            <TicketCard
              key={t.id}
              ticket={t}
              isAdmin={isAdmin}
              isGuard={isGuard}
              onUpdateStatus={handleUpdateStatus}
            />
          ))}
        </div>
      )}

      {showForm && (
        <AddTicketForm
          onSubmit={(data) => createMutation.mutate(data)}
          onClose={() => setShowForm(false)}
          isSubmitting={createMutation.isPending}
          userFlat={user?.flat_number}
          userEmail={user?.email}
        />
      )}
    </div>
  );
}
