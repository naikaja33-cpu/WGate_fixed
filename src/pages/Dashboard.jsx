import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Users, Wrench, Clock, CheckCircle2, AlertTriangle, IndianRupee, Bell } from 'lucide-react';
import StatCard from '@/components/dashboard/StatCard';
import VisitorCard from '@/components/visitors/VisitorCard';
import TicketCard from '@/components/tickets/TicketCard';
import NoticeCard from '@/components/notices/NoticeCard';
import { Link } from 'react-router-dom';
import UserManagementSection from '@/components/users/UserManagementSection';
import MenuSettingsPanel from '@/components/settings/MenuSettingsPanel';

export default function Dashboard() {
  const { user } = useAuth();
  const role = user?.role || 'resident';
  const isAdmin = role === 'admin';

  const { data: notices = [] } = useQuery({
    queryKey: ['notices-dashboard', user?.society_id],
    queryFn: () => base44.entities.Notice.filter({ society_id: user?.society_id }, '-created_date', 3),
    enabled: !!user?.society_id,
  });

  const { data: visitors = [] } = useQuery({
    queryKey: ['visitors-dashboard', user?.flat_number],
    queryFn: () => {
      if (isAdmin) return base44.entities.Visitor.list('-created_date', 50);
      return base44.entities.Visitor.filter({ flat_number: user.flat_number }, '-created_date', 20);
    },
    enabled: !!user,
  });

  const { data: tickets = [] } = useQuery({
    queryKey: ['tickets-dashboard'],
    queryFn: () => {
      if (isAdmin) return base44.entities.ServiceTicket.list('-created_date', 50);
      return base44.entities.ServiceTicket.filter({ resident_email: user.email }, '-created_date', 20);
    },
  });

  const pendingVisitors = visitors.filter(v => v.status === 'pending');
  const openTickets = tickets.filter(t => t.status === 'open' || t.status === 'in_progress');

  return (
    <div className="p-4 space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Hello, {user?.full_name?.split(' ')[0] || 'there'} 👋
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isAdmin ? 'Society overview' : `Flat ${user?.flat_number || '—'}`}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard title="Pending Visitors" value={pendingVisitors.length} icon={Users} color="bg-amber-100 text-amber-600" />
        <StatCard title="Open Tickets" value={openTickets.length} icon={Wrench} color="bg-blue-100 text-blue-600" />
        <StatCard title="Today's Visitors" value={visitors.filter(v => {
          if (!v.check_in_time) return false;
          return new Date(v.check_in_time).toDateString() === new Date().toDateString();
        }).length} icon={Clock} color="bg-emerald-100 text-emerald-600" />
        <StatCard title="Resolved" value={tickets.filter(t => t.status === 'resolved' || t.status === 'closed').length} icon={CheckCircle2} color="bg-purple-100 text-purple-600" />
      </div>

      {notices.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary" />
              Notice Board
            </h2>
            <Link to="/NoticeBoard" className="text-xs text-primary font-medium">View all →</Link>
          </div>
          {notices.map(n => (
            <NoticeCard key={n.id} notice={n} isAdmin={false} />
          ))}
        </div>
      )}

      {pendingVisitors.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Pending Approvals
            </h2>
            <Link to="/Visitors" className="text-xs text-primary font-medium">View all →</Link>
          </div>
          {pendingVisitors.slice(0, 3).map(v => (
            <VisitorCard key={v.id} visitor={v} showActions={false} />
          ))}
        </div>
      )}

      {openTickets.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground">Open Tickets</h2>
            <Link to="/ServiceTickets" className="text-xs text-primary font-medium">View all →</Link>
          </div>
          {openTickets.slice(0, 3).map(t => (
            <TicketCard key={t.id} ticket={t} isAdmin={false} />
          ))}
        </div>
      )}

      {isAdmin && <UserManagementSection />}
      {isAdmin && <MenuSettingsPanel />}
    </div>
  );
}
