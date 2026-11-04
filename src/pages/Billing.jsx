import { useMemo, useState } from 'react';
import { wgate } from '@/api/wgateClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { Plus, IndianRupee, TrendingUp, AlertCircle, CheckCircle2, Ruler } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import BillCard from '@/components/billing/BillCard';
import GenerateBillsModal from '@/components/billing/GenerateBillsModal';
import FlatSizesModal from '@/components/billing/FlatSizesModal';
import MarkPaidModal from '@/components/billing/MarkPaidModal';
import StatCard from '@/components/dashboard/StatCard';
import { formatSqft, effectiveStatus, amountDue } from '@/lib/billing';

// Compact rupee amounts that keep their precision (2500 -> ₹2.5K, not ₹3k).
const formatRupees = (amount) =>
  '₹' + new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 2 }).format(Number(amount) || 0);

export default function Billing() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [showGenerate, setShowGenerate] = useState(false);
  const [showSizes, setShowSizes] = useState(false);
  const [markingBill, setMarkingBill] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const queryClient = useQueryClient();

  const { data: bills = [], isLoading } = useQuery({
    queryKey: ['bills'],
    queryFn: () => {
      if (isAdmin) return wgate.entities.MaintenanceBill.list('-created_date', 200);
      return wgate.entities.MaintenanceBill.filter({ flat_number: user.flat_number }, '-created_date', 50);
    },
  });

  // Flat sizes: the admin sees every flat, a resident only sees their own.
  const { data: areaRecords = [] } = useQuery({
    queryKey: ['flat-areas', isAdmin ? 'all' : user?.flat_number],
    queryFn: () => {
      if (isAdmin) return wgate.entities.FlatArea.list('-created_date', 1000);
      return wgate.entities.FlatArea.filter({ flat_number: user.flat_number }, '-created_date', 1);
    },
  });
  const areas = useMemo(
    () => Object.fromEntries(areaRecords.map((r) => [r.flat_number, r.area_sqft])),
    [areaRecords]
  );
  const myArea = !isAdmin ? areas[user?.flat_number] : null;
  // The rate used on the most recent bill, pre-filled next time.
    const defaultRate = bills.find((b) => b.rate_per_sqft)?.rate_per_sqft;
  const defaultLateFine = bills.find((b) => b.late_fine != null)?.late_fine;

  const generateMutation = useMutation({
    mutationFn: (records) => wgate.entities.MaintenanceBill.bulkCreate(records),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      setShowGenerate(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => wgate.entities.MaintenanceBill.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      setMarkingBill(null);
    },
  });

    const handleGenerate = ({ month, monthLabel, dueDate, rate, rows, lateFine }) => {
    const records = rows.map((r) => ({
      flat_number: r.flat,
      month,
      month_label: monthLabel,
      due_date: dueDate,
      amount: r.total,
      line_items: r.lineItems,
      area_sqft: r.area,
      rate_per_sqft: rate,
      late_fine: lateFine,
      status: 'pending',
    }));
    generateMutation.mutate(records);
  };

  const handleMarkPaid = (data) => {
    updateMutation.mutate({ id: markingBill.id, data });
  };

   const filtered = statusFilter === 'all' ? bills : bills.filter((b) => effectiveStatus(b) === statusFilter);

  const totalCollected = bills.filter((b) => b.status === 'paid').reduce((s, b) => s + amountDue(b), 0);
  const totalPending = bills.filter((b) => b.status !== 'paid').reduce((s, b) => s + amountDue(b), 0);
  const overdueCount = bills.filter((b) => effectiveStatus(b) === 'overdue').length;

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-foreground">Maintenance Billing</h1>
        {isAdmin && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowSizes(true)} className="rounded-xl">
              <Ruler className="w-4 h-4 mr-1" /> Flat Sizes
            </Button>
            <Button size="sm" onClick={() => setShowGenerate(true)} className="rounded-xl">
              <Plus className="w-4 h-4 mr-1" /> Generate Bills
            </Button>
          </div>
        )}
      </div>

      {!isAdmin && (
        <div className="bg-card rounded-2xl border border-border p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Ruler className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Flat {user?.flat_number || '—'}</p>
            <p className="text-xs text-muted-foreground">
              {myArea
                ? `${formatSqft(myArea)} sq ft · your bill is calculated on your flat's size`
                : 'Flat size not set yet. Your society admin will add it.'}
            </p>
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="grid grid-cols-2 gap-3">
          <StatCard title="Collected" value={formatRupees(totalCollected)} icon={TrendingUp} color="bg-emerald-100 text-emerald-600" />
          <StatCard title="Pending" value={formatRupees(totalPending)} icon={IndianRupee} color="bg-amber-100 text-amber-600" />
          <StatCard title="Paid Bills" value={bills.filter((b) => b.status === 'paid').length} icon={CheckCircle2} color="bg-blue-100 text-blue-600" />
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
          {filtered.map((bill) => (
            <BillCard key={bill.id} bill={bill} isAdmin={isAdmin} onMarkPaid={setMarkingBill} />
          ))}
        </div>
      )}

      {showGenerate && (
        <GenerateBillsModal
          onGenerate={handleGenerate}
          onClose={() => setShowGenerate(false)}
          isGenerating={generateMutation.isPending}
          areas={areas}
          existingBills={bills}
          defaultRate={defaultRate}
          defaultLateFine={defaultLateFine}
        />
      )}

      {showSizes && (
        <FlatSizesModal
          areaRecords={areaRecords}
          onClose={() => setShowSizes(false)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['flat-areas'] });
            setShowSizes(false);
          }}
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