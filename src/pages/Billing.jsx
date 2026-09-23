import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { Plus, IndianRupee, TrendingUp, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import BillCard from '@/components/billing/BillCard';
import GenerateBillsModal from '@/components/billing/GenerateBillsModal';
import MarkPaidModal from '@/components/billing/MarkPaidModal';
import StatCard from '@/components/dashboard/StatCard';

export default function Billing() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [showGenerate, setShowGenerate] = useState(false);
  const [markingBill, setMarkingBill] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const queryClient = useQueryClient();

  const { data: bills = [], isLoading } = useQuery({
    queryKey: ['bills'],
    queryFn: () => {
      if (isAdmin) return base44.entities.MaintenanceBill.list('-created_date', 200);
      return base44.entities.MaintenanceBill.filter({ resident_email: user.email }, '-created_date', 50);
    },
  });

  const generateMutation = useMutation({
    mutationFn: (records) => base44.entities.MaintenanceBill.bulkCreate(records),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      setShowGenerate(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.MaintenanceBill.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      setMarkingBill(null);
    },
  });

  const handleGenerate = ({ month, monthLabel, dueDate, lineItems, selectedFlats, total }) => {
    const records = selectedFlats.map(flat => ({
      flat_number: flat,
      month,
      month_label: monthLabel,
      due_date: dueDate,
      amount: total,
      line_items: lineItems,
      status: 'pending',
    }));
    generateMutation.mutate(records);
  };

  const handleMarkPaid = (data) => {
    updateMutation.mutate({ id: markingBill.id, data });
  };

  const filtered = statusFilter === 'all' ? bills : bills.filter(b => b.status === statusFilter);

  const totalCollected = bills.filter(b => b.status === 'paid').reduce((s, b) => s + (b.amount || 0), 0);
  const totalPending = bills.filter(b => b.status === 'pending').reduce((s, b) => s + (b.amount || 0), 0);
  const overdueCount = bills.filter(b => b.status === 'overdue').length;

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Maintenance Billing</h1>
        {isAdmin && (
          <Button size="sm" onClick={() => setShowGenerate(true)} className="rounded-xl">
            <Plus className="w-4 h-4 mr-1" /> Generate Bills
          </Button>
        )}
      </div>

      {isAdmin && (
        <div className="grid grid-cols-2 gap-3">
          <StatCard title="Collected" value={`₹${(totalCollected / 1000).toFixed(0)}k`} icon={TrendingUp} color="bg-emerald-100 text-emerald-600" />
          <StatCard title="Pending" value={`₹${(totalPending / 1000).toFixed(0)}k`} icon={IndianRupee} color="bg-amber-100 text-amber-600" />
          <StatCard title="Paid Bills" value={bills.filter(b => b.status === 'paid').length} icon={CheckCircle2} color="bg-blue-100 text-blue-600" />
          <StatCard title="Overdue" value={overdueCount} icon={AlertCircle} color="bg-red-100 text-red-600" />
        </div>
      )}

      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList className="w-full bg-muted">
          <TabsTrigger value="all" className="flex-1 text-xs">All</TabsTrigger>
          <TabsTrigger value="pending" className="flex-1 text-xs">Pending</TabsTrigger>
          <TabsTrigger value="paid" className="flex-1 text-xs">Paid</TabsTrigger>
          <TabsTrigger value="overdue" className="flex-1 text-xs">Overdue</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">No bills found</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(bill => (
            <BillCard key={bill.id} bill={bill} isAdmin={isAdmin} onMarkPaid={setMarkingBill} />
          ))}
        </div>
      )}

      {showGenerate && (
        <GenerateBillsModal
          onGenerate={handleGenerate}
          onClose={() => setShowGenerate(false)}
          isGenerating={generateMutation.isPending}
        />
      )}

      {markingBill && (
        <MarkPaidModal
          bill={markingBill}
          onConfirm={handleMarkPaid}
          onClose={() => setMarkingBill(null)}
          isLoading={updateMutation.isPending}
        />
      )}
    </div>
  );
}
