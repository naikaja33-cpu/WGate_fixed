import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, UserCheck, KeyRound, Wrench, CalendarClock, Bell, Store, IndianRupee, User, UserCog } from 'lucide-react';

const STORAGE_KEY = 'wgate_home_tab';
const ALL = ['admin', 'owner', 'tenant', 'family', 'guard'];
const MEMBERS = ['admin', 'owner', 'tenant'];

// The home screen groups every page into four tabs. A tile is hidden when the super admin switched
// its menu off, or when the signed-in role does not use that page.
// `menu` is the super admin menu key, `count` names the number shown on the tile.
const TABS = [
  {
    id: 'visitors',
    label: 'Visitors',
    tiles: [
      { to: '/Visitors', icon: Users, title: 'Visitors', sub: 'Who came to the gate', menu: 'Visitors', count: 'visitors' },
      { to: '/PreApprovals', icon: UserCheck, title: 'Pre-Approve', sub: 'Guest, maid, cook', menu: 'PreApprovals' },
      { to: '/GatePasses', icon: KeyRound, title: 'Gate Pass', sub: 'One-time entry code', menu: 'GatePasses' },
    ],
  },
  {
    id: 'services',
    label: 'Services',
    tiles: [
      { to: '/ServiceTickets', icon: Wrench, title: 'Tickets', sub: 'Report a problem', menu: 'ServiceTickets', count: 'tickets', roles: [...MEMBERS, 'guard'] },
      { to: '/Amenities', icon: CalendarClock, title: 'Amenities', sub: 'Book a slot', menu: 'Amenities' },
    ],
  },
  {
    id: 'community',
    label: 'Community',
    tiles: [
      { to: '/NoticeBoard', icon: Bell, title: 'Notices', sub: 'Society announcements', menu: 'NoticeBoard' },
      { to: '/Community', icon: Store, title: 'Community', sub: 'Buy, sell, rent', menu: 'Community', roles: MEMBERS },
    ],
  },
  {
    id: 'account',
    label: 'Account',
    tiles: [
      {
        to: '/Billing', icon: IndianRupee, title: 'Billing', sub: 'Bills and receipts', menu: 'Billing', count: 'bills', roles: MEMBERS,
        countSub: (n, role) => (role === 'admin' ? `${n} to confirm` : `${n} due`),
      },
      { to: '/Profile', icon: User, title: 'Profile', sub: 'Your details and family' },
      { to: '/Members', icon: UserCog, title: 'Members', sub: 'Manage residents', roles: ['admin'] },
    ],
  },
];

export default function HomeTabs({ role, isEnabled, counts = {} }) {
  const tabs = TABS
    .map((t) => ({
      ...t,
      tiles: t.tiles
        .filter((x) => (x.roles || ALL).includes(role) && (!x.menu || isEnabled(x.menu)))
        .map((x) => ({ ...x, n: x.count ? Number(counts[x.count]) || 0 : 0 })),
    }))
    .filter((t) => t.tiles.length > 0);

  const [saved, setSaved] = useState(() => {
    try { return window.localStorage.getItem(STORAGE_KEY); } catch { return null; }
  });

  if (tabs.length === 0) return null;
  const active = tabs.find((t) => t.id === saved) || tabs[0];

  const choose = (id) => {
    setSaved(id);
    try { window.localStorage.setItem(STORAGE_KEY, id); } catch { /* storage unavailable */ }
  };

  return (
    <div className="space-y-3">
      <div
        role="tablist"
        className="grid gap-1 rounded-2xl bg-muted p-1"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map((t) => {
          const total = t.tiles.reduce((sum, x) => sum + x.n, 0);
          const isActive = t.id === active.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => choose(t.id)}
              className={`flex h-11 items-center justify-center gap-1 rounded-xl text-sm font-semibold transition-colors ${
                isActive ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              {t.label}
              {total > 0 && (
                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white">
                  {total}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" className="grid grid-cols-2 gap-3">
        {active.tiles.map((tile) => (
          <Link
            key={tile.to}
            to={tile.to}
            className="relative flex min-h-[112px] flex-col justify-between rounded-2xl border border-border bg-card p-4 shadow-sm transition-transform active:scale-[0.98]"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
              <tile.icon className="h-6 w-6 text-primary" />
            </div>
            <div className="mt-3">
              <p className="text-base font-semibold leading-tight text-foreground">{tile.title}</p>
              <p className="text-sm leading-snug text-muted-foreground">
                {tile.n > 0 && tile.countSub ? tile.countSub(tile.n, role) : tile.sub}
              </p>
            </div>
            {tile.n > 0 && (
              <span className="absolute right-3 top-3 flex h-6 min-w-[24px] items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-bold text-white">
                {tile.n}
              </span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}