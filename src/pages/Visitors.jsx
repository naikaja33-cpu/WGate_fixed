import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { Plus, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import VisitorCard from '@/components/visitors/VisitorCard';
import AddVisitorForm from '@/components/visitors/AddVisitorForm';

export default function Visitors() {
  const { user } = useAuth();
  const role = user?.role || 'tenant';
  const isGuard = role === 'guard';
  const isAdmin = role === 'admin';
  const isResident = role === 'tenant' || role === 'owner';
  const canAdd = isGuard || isAdmin;

  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const queryClient = useQueryClient();

  const { data: visitors = [], isLoading } = useQuery({
    queryKey: ['visitors'],
    queryFn: () => {
      if (isAdmin) return base44.entities.Visitor.list('-created_date', 100);
      if (isGuard) return base44.entities.Visitor.list('-created_date', 100);
      return base44.entities.Visitor.filter({ flat_number: user.flat_number }, '-created_date', 50);
    },
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Visitor.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visitors'] });
      setShowForm(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Visitor.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visitors'] });
      queryClient.invalidateQueries({ queryKey: ['visitors-dashboard'] });
    },
  });

  const handleApprove = (visitor) => updateMutation.mutate({ id: visitor.id, data: { status: 'approved' } });
  const handleReject = (visitor) => updateMutation.mutate({ id: visitor.id, data: { status: 'rejected' } });
  const handleCheckout = (visitor) => updateMutation.mutate({ id: visitor.id, data: { check_out_time: new Date().toISOString() } });

  const filtered = statusFilter === 'all'
    ? visitors
    : visitors.filter(v => v.status === statusFilter);

  const showActions = isResident || isAdmin;

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">
          {isGuard ? 'Gate Management' : 'Visitors'}
        </h1>
        {canAdd && (
          <Button size="sm" onClick={() => setShowForm(true)} className="rounded-xl">
            <Plus className="w-4 h-4 mr-1" /> Check In
          </Button>
        )}
      </div>

      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList className="w-full bg-muted">
          <TabsTrigger value="all" className="flex-1 text-xs">All</TabsTrigger>
          <TabsTrigger value="pending" className="flex-1 text-xs">Pending</TabsTrigger>
          <TabsTrigger value="approved" className="flex-1 text-xs">Approved</TabsTrigger>
          <TabsTrigger value="rejected" className="flex-1 text-xs">Rejected</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm">No visitors found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(v => (
            <VisitorCard
              key={v.id}
              visitor={v}
              showActions={showActions}
              role={role}
              onApprove={handleApprove}
              onReject={handleReject}
              onCheckout={handleCheckout}
            />
          ))}
        </div>
      )}

      {showForm && (
        <AddVisitorForm
          onSubmit={(data) => createMutation.mutate(data)}
          onClose={() => setShowForm(false)}
          isSubmitting={createMutation.isPending}
        />
      )}
    </div>
  );
}
