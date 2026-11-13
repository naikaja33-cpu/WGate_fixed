import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, UserCheck, KeyRound, Wrench, CalendarClock, Bell, Store, IndianRupee, User, UserCog, Wallet, ChevronRight } from 'lucide-react';

const STORAGE_KEY = 'wgate_home_tab';
const ALL = ['admin', 'owner', 'tenant', 'family', 'guard'];
const MEMBERS = ['admin', 'owner', 'tenant'];

// One colour family per tab: `icon` colours the tab icon, `chip` the round icon behind each tile,
// `strip` the tinted line under the tiles. All of these are written out in full on purpose,
// because Tailwind only creates the classes it can find as whole words in the code.
const COLORS = {
  amber: {
    icon: 'text-amber-500',
    chip: 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
    strip: 'bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200',
  },
  sky: {
    icon: 'text-sky-500',
    chip: 'bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400',
    strip: 'bg-sky-50 text-sky-900 dark:bg-sky-500/10 dark:text-sky-200',
  },
  violet: {
    icon: 'text-violet-500',
    chip: 'bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400',
    strip: 'bg-violet-50 text-violet-900 dark:bg-violet-500/10 dark:text-violet-200',
  },
  emerald: {
    icon: 'text-emerald-500',
    chip: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
    strip: 'bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200',
  },
};

// The home screen groups every page into four tabs. A tile is hidden when the super admin switched
// its menu off, or when the signed-in role does not use that page.
// `menu` is the super admin menu key, `count` names the number shown on the tile,
// `hint` is the tinted line under the tiles (it opens the page named by its `to`).
const TABS = [
  {
    id: 'visitors', label: 'Visitors', icon: Users, color: 'amber',
    hint: { text: 'Expecting someone? Pre-approve them so they walk right in', to: '/PreApprovals' },
    tiles: [
      { to: '/Visitors', icon: Users, title: 'Visitors', sub: 'Who came', menu: 'Visitors', count: 'visitors' },
      { to: '/PreApprovals', icon: UserCheck, title: 'Pre-Approve', sub: 'Guest, maid, cook', menu: 'PreApprovals' },
      { to: '/GatePasses', icon: KeyRound, title: 'Gate Pass', sub: 'Entry code', menu: 'GatePasses' },
    ],
  },
  {
    id: 'services', label: 'Services', icon: Wrench, color: 'sky',
    hint: { text: 'Something broken? Raise a ticket and track it here', to: '/ServiceTickets' },
    tiles: [
      { to: '/ServiceTickets', icon: Wrench, title: 'Tickets', sub: 'Report a problem', menu: 'ServiceTickets', count: 'tickets', roles: [...MEMBERS, 'guard'] },
      { to: '/Amenities', icon: CalendarClock, title: 'Amenities', sub: 'Book a slot', menu: 'Amenities' },
    ],
  },
  {
    id: 'community', label: 'Community', icon: Store, color: 'violet',
    hint: { text: 'Selling or renting? Post it for your neighbours', to: '/Community' },
    tiles: [
      { to: '/NoticeBoard', icon: Bell, title: 'Notices', sub: 'Announcements', menu: 'NoticeBoard' },
      { to: '/Community', icon: Store, title: 'Community', sub: 'Buy, sell, rent', menu: 'Community', roles: MEMBERS },
    ],
  },
  {
    id: 'account', label: 'Account', icon: Wallet, color: 'emerald',
    hint: { text: 'Pay maintenance by UPI and download your receipt', to: '/Billing' },
    tiles: [
      {
        to: '/Billing', icon: IndianRupee, title: 'Billing', sub: 'Bills, receipts', menu: 'Billing', count: 'bills', roles: MEMBERS,
        countSub: (n, role) => (role === 'admin' ? `${n} to confirm` : `${n} due`),
      },
      { to: '/Profile', icon: User, title: 'Profile', sub: 'You and family' },
      { to: '/Members', icon: UserCog, title: 'Members', sub: 'Residents', roles: ['admin'] },
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
  const touch = useRef(null);

  if (tabs.length === 0) return null;
  const activeIndex = Math.max(0, tabs.findIndex((t) => t.id === saved));
  const active = tabs[activeIndex];
  const color = COLORS[active.color];
  const first = activeIndex === 0;
  const last = activeIndex === tabs.length - 1;

  const choose = (id) => {
    setSaved(id);
    try { window.localStorage.setItem(STORAGE_KEY, id); } catch { /* storage unavailable */ }
  };

  // Swipe the tiles left or right to move to the next or the previous tab.
  const onTouchStart = (e) => {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e) => {
    if (!touch.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touch.current.x;
    const dy = t.clientY - touch.current.y;
    touch.current = null;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const next = tabs[activeIndex + (dx < 0 ? 1 : -1)];
    if (next) choose(next.id);
  };

  const hint = active.hint && active.tiles.some((x) => x.to === active.hint.to) ? active.hint : null;

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-muted shadow-sm">
      <div role="tablist" className="flex items-end">
        {tabs.map((t, i) => {
          const isActive = i === activeIndex;
          const total = t.tiles.reduce((sum, x) => sum + x.n, 0);
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => choose(t.id)}
              className={`relative z-10 flex flex-1 flex-col items-center gap-1 px-1 pb-2 pt-3 transition-colors duration-200 ${
                isActive ? 'rounded-t-3xl bg-card' : ''
              }`}
            >
              {/* The two small curves that make the active tab flow into the panel below it. */}
              {isActive && !first && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute -left-4 bottom-0 h-4 w-4"
                  style={{ background: 'radial-gradient(circle at 0 0, transparent 15.5px, hsl(var(--card)) 16px)' }}
                />
              )}
              {isActive && !last && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute -right-4 bottom-0 h-4 w-4"
                  style={{ background: 'radial-gradient(circle at 100% 0, transparent 15.5px, hsl(var(--card)) 16px)' }}
                />
              )}
              <span className="relative">
                <t.icon className={`h-7 w-7 ${COLORS[t.color].icon} ${isActive ? '' : 'opacity-70'}`} strokeWidth={isActive ? 2.25 : 1.75} />
                {total > 0 && (
                  <span className="absolute -right-2.5 -top-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                    {total}
                  </span>
                )}
              </span>
              <span className={`text-[13px] leading-none ${isActive ? 'font-bold text-foreground' : 'font-medium text-muted-foreground'}`}>
                {t.label}
              </span>
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className={`-mt-px bg-card px-3 pb-5 pt-5 ${first ? 'rounded-tr-3xl' : last ? 'rounded-tl-3xl' : 'rounded-t-3xl'}`}
      >
        <div
          key={active.id}
          className="grid gap-x-2 gap-y-5 animate-in fade-in-0 slide-in-from-bottom-2 duration-300"
          style={{ gridTemplateColumns: `repeat(${Math.min(active.tiles.length, 3)}, minmax(0, 1fr))` }}
        >
          {active.tiles.map((tile) => (
            <Link
              key={tile.to}
              to={tile.to}
              className="flex flex-col items-center gap-2 text-center transition-transform active:scale-95"
            >
              <span className={`relative flex h-16 w-16 items-center justify-center rounded-full ${color.chip}`}>
                <tile.icon className="h-7 w-7" />
                {tile.n > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-6 min-w-[24px] items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-bold text-white ring-2 ring-card">
                    {tile.n}
                  </span>
                )}
              </span>
              <span>
                <span className="block text-sm font-semibold leading-tight text-foreground">{tile.title}</span>
                <span className="mt-0.5 block text-xs leading-tight text-muted-foreground">
                  {tile.n > 0 && tile.countSub ? tile.countSub(tile.n, role) : tile.sub}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </div>

      {hint && (
        <Link
          to={hint.to}
          className={`flex items-center justify-between gap-2 px-4 py-3 text-sm font-medium transition-colors duration-300 ${color.strip}`}
        >
          <span>{hint.text}</span>
          <ChevronRight className="h-4 w-4 shrink-0" />
        </Link>
      )}
    </div>
  );
}