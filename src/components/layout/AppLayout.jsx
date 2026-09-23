import { Outlet, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, Wrench, User, Shield, LogOut, IndianRupee, Bell } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import NotificationBell from '@/components/notifications/NotificationBell';
import { useState, useEffect } from 'react';

const navItems = {
  admin: [
    { path: '/Dashboard', icon: LayoutDashboard, label: 'Home' },
    { path: '/Visitors', icon: Users, label: 'Visitors' },
    { path: '/ServiceTickets', icon: Wrench, label: 'Tickets' },
    { path: '/NoticeBoard', icon: Bell, label: 'Notices' },
    { path: '/Billing', icon: IndianRupee, label: 'Billing' },
    { path: '/Profile', icon: User, label: 'Profile' },
  ],
  tenant: [
    { path: '/Dashboard', icon: LayoutDashboard, label: 'Home' },
    { path: '/Visitors', icon: Users, label: 'Visitors' },
    { path: '/ServiceTickets', icon: Wrench, label: 'Tickets' },
    { path: '/NoticeBoard', icon: Bell, label: 'Notices' },
    { path: '/Billing', icon: IndianRupee, label: 'Billing' },
    { path: '/Profile', icon: User, label: 'Profile' },
  ],
  owner: [
    { path: '/Dashboard', icon: LayoutDashboard, label: 'Home' },
    { path: '/Visitors', icon: Users, label: 'Visitors' },
    { path: '/ServiceTickets', icon: Wrench, label: 'Tickets' },
    { path: '/NoticeBoard', icon: Bell, label: 'Notices' },
    { path: '/Billing', icon: IndianRupee, label: 'Billing' },
    { path: '/Profile', icon: User, label: 'Profile' },
  ],
  tenant: [
    { path: '/Dashboard', icon: LayoutDashboard, label: 'Home' },
    { path: '/Visitors', icon: Users, label: 'Visitors' },
    { path: '/ServiceTickets', icon: Wrench, label: 'Tickets' },
    { path: '/NoticeBoard', icon: Bell, label: 'Notices' },
    { path: '/Billing', icon: IndianRupee, label: 'Billing' },
    { path: '/Profile', icon: User, label: 'Profile' },
  ],
  guard: [
    { path: '/Visitors', icon: Shield, label: 'Gate' },
    { path: '/ServiceTickets', icon: Wrench, label: 'Tickets' },
    { path: '/NoticeBoard', icon: Bell, label: 'Notices' },
    { path: '/Profile', icon: User, label: 'Profile' },
  ],
};

export default function AppLayout() {
  const location = useLocation();
  const { user,logout } = useAuth();
  const role = user?.role || 'resident';
  const [enabledMenus, setEnabledMenus] = useState(null);

  useEffect(() => {
    if (!user?.society_id || role === 'admin') return;
    base44.entities.SocietySettings.filter({ society_id: user.society_id }).then(results => {
      if (results.length > 0 && results[0].enabled_menus) {
        setEnabledMenus(results[0].enabled_menus);
      }
    });
  }, [user?.society_id, role]);

  const baseItems = navItems[role] || navItems.tenant;
  // Admin always sees all menus; others respect enabled_menus if set
  const items = (role === 'admin' || !enabledMenus)
    ? baseItems
    : baseItems.filter(item => item.path === '/Dashboard' || item.path === '/Profile' || enabledMenus.includes(item.path.replace('/', '')));

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="bg-card border-b border-border px-4 py-3 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Shield className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-foreground text-lg">MySociety</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded-full capitalize">{role}</span>
          <NotificationBell />
          <button onClick={() =>logout()} className="text-muted-foreground hover:text-foreground transition-colors">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-20">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-30 safe-area-bottom">
        <div className="flex items-center justify-around px-2 py-2">
          {items.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all ${
                  isActive
                    ? 'text-primary bg-accent'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <item.icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
