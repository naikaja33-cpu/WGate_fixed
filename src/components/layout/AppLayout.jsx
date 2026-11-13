import { Suspense } from 'react';
import { Outlet, Link, useLocation, Navigate } from 'react-router-dom';
import { LayoutDashboard, Users, Wrench, User, UserCog, Shield, LogOut, IndianRupee, Bell, CalendarClock, UserCheck, KeyRound, Store } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import NotificationBell from '@/components/notifications/NotificationBell';
import { useEnabledMenus, MENU_KEYS } from '@/lib/useEnabledMenus';
import { useHomeStyle } from '@/lib/homeStyle';

// Residents and the admin get five big buttons. The other pages (Pre-Approve, Gate Pass, Amenities,
// Notices, Community, Members) are reached from the tabs on the Home screen. `match` lists the pages
// that keep a button highlighted, so people always see which area they are in.
const HOME = { path: '/Dashboard', icon: LayoutDashboard, label: 'Home', match: ['/Dashboard', '/NoticeBoard', '/Community', '/Members'] };
const VISITORS = { path: '/Visitors', icon: Users, label: 'Visitors', match: ['/Visitors', '/PreApprovals', '/GatePasses'] };
const SERVICES = { path: '/ServiceTickets', icon: Wrench, label: 'Services', match: ['/ServiceTickets', '/Amenities'] };
const BILLING = { path: '/Billing', icon: IndianRupee, label: 'Billing' };
const PROFILE = { path: '/Profile', icon: User, label: 'Profile' };

const memberItems = [HOME, VISITORS, SERVICES, BILLING, PROFILE];

const navItems = {
  admin: memberItems,
  tenant: memberItems,
  owner: memberItems,
  family: [
    { ...HOME, match: ['/Dashboard'] },
    VISITORS,
    { path: '/NoticeBoard', icon: Bell, label: 'Notices' },
    PROFILE,
  ],
  guard: [
    { path: '/Visitors', icon: Shield, label: 'Gate' },
    { path: '/ServiceTickets', icon: Wrench, label: 'Tickets' },
    { path: '/NoticeBoard', icon: Bell, label: 'Notices' },
    { path: '/PreApprovals', icon: UserCheck, label: 'Pre-Approve' },
    { path: '/GatePasses', icon: KeyRound, label: 'Gate Pass' },
    { path: '/Amenities', icon: CalendarClock, label: 'Amenities' },
    { path: '/Profile', icon: User, label: 'Profile' },
  ],
};

// The classic bar: every page has its own button.
const classicItems = [
  { path: '/Dashboard', icon: LayoutDashboard, label: 'Home' },
  { path: '/Community', icon: Store, label: 'Community' },
  { path: '/Visitors', icon: Users, label: 'Visitors' },
  { path: '/ServiceTickets', icon: Wrench, label: 'Tickets' },
  { path: '/NoticeBoard', icon: Bell, label: 'Notices' },
  { path: '/Billing', icon: IndianRupee, label: 'Billing' },
  { path: '/Profile', icon: User, label: 'Profile' },
];
const classicNavItems = {
  admin: [...classicItems.slice(0, 6), { path: '/Members', icon: UserCog, label: 'Members' }, classicItems[6]],
  tenant: classicItems,
  owner: classicItems,
};

export default function AppLayout() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const role = user?.role || 'resident';
  const { enabledMenus, isLoaded } = useEnabledMenus();

  // People can switch the Home screen between the tabs look and the classic look.
  const [homeStyle] = useHomeStyle();
  const baseItems = (homeStyle === 'classic' && classicNavItems[role]) || navItems[role] || navItems.tenant;
  // The super admin decides which menus a society can use. This applies to
  // everyone in the society, including its admin. Home, Profile and Members
  // are always visible.
  const ALWAYS_VISIBLE = ['/Dashboard', '/Profile', '/Members'];
  const items = !enabledMenus
    ? baseItems
    : baseItems.filter(item => ALWAYS_VISIBLE.includes(item.path) || enabledMenus.includes(item.path.replace('/', '')));

  // A page whose menu is switched off can't be opened by typing its address either.
  const pageKey = location.pathname.replace('/', '');
  const normalizedKey = MENU_KEYS.find((k) => k.toLowerCase() === pageKey.toLowerCase());
  const isBlocked = !!enabledMenus && !!normalizedKey && !enabledMenus.includes(normalizedKey);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="bg-card border-b border-border px-4 py-3 flex items-center justify-between sticky top-0 z-30">
        <Link to="/Dashboard" className="flex items-center gap-2" aria-label="Go to home">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Shield className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-foreground text-lg">MySociety</span>
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded-full capitalize">{role}</span>
          <NotificationBell />
          <button onClick={() => logout()} className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Sign out">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-24">
        {!isLoaded ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : isBlocked ? (
          <Navigate to="/Dashboard" replace />
        ) : (
          <Suspense fallback={<div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
            <Outlet />
          </Suspense>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-30 safe-area-bottom">
        <div className="flex items-stretch justify-around px-1 py-1.5">
          {items.map((item) => {
            const isActive = (item.match || [item.path]).includes(location.pathname);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 transition-all ${
                  isActive
                    ? 'text-primary bg-accent'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <item.icon className={items.length > 5 ? 'w-5 h-5' : 'w-6 h-6'} />
                <span className={`font-medium leading-tight ${items.length > 5 ? 'text-[10px]' : 'text-xs'}`}>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}