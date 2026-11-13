import { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { wgate } from '@/api/wgateClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Wrench, Clock, CheckCircle2, Bell, BellRing, ChevronRight } from 'lucide-react';
import StatCard from '@/components/dashboard/StatCard';
import HomeTabs from '@/components/dashboard/HomeTabs';
import VisitorCard from '@/components/visitors/VisitorCard';
import TicketCard from '@/components/tickets/TicketCard';
import NoticeCard from '@/components/notices/NoticeCard';
import { Link } from 'react-router-dom';
import { useEnabledMenus } from '@/lib/useEnabledMenus';
import { effectiveStatus } from '@/lib/billing';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';


export default function Dashboard() {
  const { user } = useAuth();
  const role = user?.role || 'resident';
  const isAdmin = role === 'admin';
  const isStaff = isAdmin || role === 'guard';
  const isResident = role === 'owner' || role === 'tenant' || role === 'family';

  // Sections the super admin has switched off are neither fetched nor shown.
  const { isEnabled } = useEnabledMenus();
  const showNotices = isEnabled('NoticeBoard');
  const showVisitors = isEnabled('Visitors');
  const showTickets = isEnabled('ServiceTickets');
  const showBilling = isEnabled('Billing') && (isAdmin || role === 'owner' || role === 'tenant');

  const { data: notices = [] } = useQuery({
    queryKey: ['notices-dashboard', user?.society_id],
    queryFn: () => wgate.entities.Notice.filter({ society_id: user?.society_id }, '-created_date', 3),
    enabled: !!user?.society_id && showNotices,
  });

  const { data: visitors = [] } = useQuery({
    queryKey: ['visitors-dashboard', user?.flat_number],
    queryFn: () => {
      if (isStaff) return wgate.entities.Visitor.list('-created_date', 50);
      return wgate.entities.Visitor.filter({ flat_number: user.flat_number }, '-created_date', 20);
    },
    enabled: !!user && showVisitors,
  });

  const { data: tickets = [] } = useQuery({
    queryKey: ['tickets-dashboard'],
    queryFn: () => {
      if (isStaff) return wgate.entities.ServiceTicket.list('-created_date', 50);
      return wgate.entities.ServiceTicket.filter({ resident_email: user.email }, '-created_date', 20);
    },
    enabled: !!user && showTickets,
  });

  // Same request as the Billing page, so the two share one cached answer.
  const { data: bills = [] } = useQuery({
    queryKey: ['bills'],
    queryFn: () => {
      if (isAdmin) return wgate.entities.MaintenanceBill.list('-created_date', 200);
      return wgate.entities.MaintenanceBill.filter({ flat_number: user.flat_number }, '-created_date', 50);
    },
    enabled: !!user && showBilling,
  });

  const pendingVisitors = visitors.filter(v => v.status === 'pending');
  const openTickets = tickets.filter(t => t.status === 'open' || t.status === 'in_progress');
  // A member sees how many bills they still owe; the admin sees how many payments wait for confirmation.
  const billCount = isAdmin
    ? bills.filter(b => b.status !== 'paid' && b.payment_claim).length
    : bills.filter(b => effectiveStatus(b) !== 'paid').length;

  // --- Pending-visitor popup (residents only) ---
  const queryClient = useQueryClient();
  const [dismissedIds, setDismissedIds] = useState([]);

  const visitorMutation = useMutation({
    mutationFn: ({ id, data }) => wgate.entities.Visitor.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visitors-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['visitors'] });
    },
  });

  const popupVisitor = isResident
    ? pendingVisitors.find((v) => !dismissedIds.includes(v.id))
    : null;

  const dismissPopup = (id) => setDismissedIds((ids) => [...ids, id]);

  const handlePopupApprove = (visitor) => {
    visitorMutation.mutate({ id: visitor.id, data: { status: 'approved' } });
    dismissPopup(visitor.id);
  };

  const handlePopupReject = (visitor) => {
    visitorMutation.mutate({ id: visitor.id, data: { status: 'rejected' } });
    dismissPopup(visitor.id);
  };

  const waiting = pendingVisitors.length;

  return (
    <div className="p-4 space-y-5 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Hello, {user?.full_name?.split(' ')[0] || 'there'} 👋
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isAdmin ? `${user?.society_name || 'Society'} Society` : isResident ? `Flat ${user?.flat_number || '—'}` : (user?.society_name || '')}
        </p>
      </div>

      {/* The most urgent thing is always on top: someone is waiting at the gate. */}
      {showVisitors && waiting > 0 && (
        <div className="flex items-center gap-3 rounded-2xl bg-red-600 p-4 text-white shadow-md">
          <BellRing className="h-6 w-6 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold leading-tight">
              {waiting} visitor{waiting > 1 ? 's' : ''} waiting
            </p>
            <p className="text-sm text-white/90">{isResident ? 'Waiting at the gate for your answer' : 'Waiting for the resident to approve'}</p>
          </div>
          {isResident ? (
            <button
              type="button"
              onClick={() => setDismissedIds([])}
              className="shrink-0 rounded-xl bg-white px-4 py-2 text-sm font-bold text-red-700"
            >
              Approve now
            </button>
          ) : (
            <Link to="/Visitors" className="flex shrink-0 items-center rounded-xl bg-white px-4 py-2 text-sm font-bold text-red-700">
              Open <ChevronRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      )}

      <HomeTabs
        role={role}
        isEnabled={isEnabled}
        counts={{ visitors: waiting, tickets: openTickets.length, bills: billCount }}
      />

      {isAdmin && (showVisitors || showTickets) && (
        <div className="grid grid-cols-2 gap-3">
          {showVisitors && (
            <StatCard title="Pending Visitors" value={waiting} icon={Users} color="bg-amber-100 text-amber-600" />
          )}
          {showTickets && (
            <StatCard title="Open Tickets" value={openTickets.length} icon={Wrench} color="bg-blue-100 text-blue-600" />
          )}
          {showVisitors && (
            <StatCard title="Today's Visitors" value={visitors.filter(v => {
              if (!v.check_in_time) return false;
              return new Date(v.check_in_time).toDateString() === new Date().toDateString();
            }).length} icon={Clock} color="bg-emerald-100 text-emerald-600" />
          )}
          {showTickets && (
            <StatCard title="Resolved" value={tickets.filter(t => t.status === 'resolved' || t.status === 'closed').length} icon={CheckCircle2} color="bg-purple-100 text-purple-600" />
          )}
        </div>
      )}

      {showNotices && notices.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary" />
              Notice Board
            </h2>
            <Link to="/NoticeBoard" className="text-sm text-primary font-medium">View all →</Link>
          </div>
          {notices.map(n => (
            <NoticeCard key={n.id} notice={n} isAdmin={false} />
          ))}
        </div>
      )}

      {showTickets && role !== 'family' && openTickets.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground">Open Tickets</h2>
            <Link to="/ServiceTickets" className="text-sm text-primary font-medium">View all →</Link>
          </div>
          {openTickets.slice(0, 3).map(t => (
            <TicketCard key={t.id} ticket={t} isAdmin={false} />
          ))}
        </div>
      )}

      {popupVisitor && (
        <Dialog open={!!popupVisitor} onOpenChange={(open) => { if (!open) dismissPopup(popupVisitor.id); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Visitor waiting at the gate</DialogTitle>
              <DialogDescription>Approve or reject this visitor for your flat.</DialogDescription>
            </DialogHeader>
            <VisitorCard
              visitor={popupVisitor}
              showActions
              role={role}
              onApprove={handlePopupApprove}
              onReject={handlePopupReject}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}