import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Users, UserCheck, KeyRound, CalendarClock, Wrench, LogIn, LogOut, Search } from 'lucide-react';
import { wgate } from '@/api/wgateClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatIST, formatDay, istDayOf, istToday } from '@/lib/ist';

// Quick gate desk for security and admin: filter by what is arriving, then check in or out in one tap.
// Visitors and tickets come from the dashboard (already loaded); the rest load here.

// What the visitor record should say for each pre-approval category.
const purposeFor = (category) => {
  if (category === 'Guest') return 'guest';
  if (category === 'Delivery') return 'delivery';
  if (category === 'Other') return 'other';
  return 'service';
};

function Row({ title, sub, note, children }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
      <div className="min-w-0">
        <p className="truncate font-semibold text-foreground">{title}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        {note && <p className="mt-0.5 text-xs font-medium text-emerald-700">{note}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Heading({ children }) {
  return <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</p>;
}

function Empty({ children }) {
  return <p className="py-3 text-center text-sm text-muted-foreground">{children}</p>;
}

export default function GateDesk({ isEnabled, visitors = [], tickets: ticketsProp }) {
  const queryClient = useQueryClient();
  const today = istToday();
  const [tab, setTab] = useState('visitors');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');

  const showVisitors = isEnabled('Visitors');
  const showPre = isEnabled('PreApprovals');
  const showPass = isEnabled('GatePasses');
  const showAmenities = isEnabled('Amenities');
  const showTickets = isEnabled('ServiceTickets');

  const { data: preApprovals = [] } = useQuery({
    queryKey: ['desk-preapprovals'],
    queryFn: () => wgate.entities.PreApproval.list('-created_date', 200),
    enabled: showPre,
  });
  const { data: passes = [] } = useQuery({
    queryKey: ['desk-gatepasses'],
    queryFn: () => wgate.entities.GatePass.list('-created_date', 200),
    enabled: showPass,
  });
  const { data: bookings = [] } = useQuery({
    queryKey: ['desk-bookings'],
    queryFn: () => wgate.entities.AmenityBooking.list('-created_date', 200),
    enabled: showAmenities,
  });

  // The dashboard hands over its tickets; on the guard's Gate page there are none, so load them here.
  const { data: ownTickets = [] } = useQuery({
    queryKey: ['desk-tickets'],
    queryFn: () => wgate.entities.ServiceTicket.list('-created_date', 50),
    enabled: showTickets && !ticketsProp,
  });
  const tickets = ticketsProp || ownTickets;

  // Keep the lists fresh when something changes at the gate.
  useEffect(() => {
    const feeds = [
      ['Visitor', 'visitors-dashboard'],
      ['Visitor', 'visitors'],
      ['PreApproval', 'desk-preapprovals'],
      ['GatePass', 'desk-gatepasses'],
      ['AmenityBooking', 'desk-bookings'],
      ['ServiceTicket', 'tickets-dashboard'],
      ['ServiceTicket', 'desk-tickets'],
    ];
    const stops = feeds.map(([entity, key]) => {
      try {
        return wgate.entities[entity].subscribe(() => queryClient.invalidateQueries({ queryKey: [key] }));
      } catch {
        return null;
      }
    });
    return () => stops.forEach((stop) => typeof stop === 'function' && stop());
  }, [queryClient]);

  const refresh = () => {
    ['visitors-dashboard', 'visitors', 'desk-preapprovals', 'desk-gatepasses', 'gate-passes', 'visitors-for-preapprovals'].forEach((key) =>
      queryClient.invalidateQueries({ queryKey: [key] })
    );
  };

  const run = async (id, work, okMessage) => {
    setBusy(id);
    try {
      await work();
      toast.success(okMessage);
      refresh();
    } catch (err) {
      toast.error(err?.message || 'Something went wrong');
    } finally {
      setBusy('');
    }
  };

  const checkOut = (v) =>
    run(v.id, () => wgate.entities.Visitor.update(v.id, { check_out_time: new Date().toISOString() }), `${v.visitor_name} checked out`);

  const checkInPre = (p) =>
    run(
      p.id,
      () =>
        wgate.entities.Visitor.create({
          visitor_name: p.visitor_name,
          visitor_phone: p.visitor_phone,
          flat_number: p.flat_number,
          purpose: purposeFor(p.category),
          notes: String(p.notes || '').slice(0, 300),
          check_in_time: new Date().toISOString(),
          status: 'approved',
          pre_approval_id: p.id,
          pre_approval_category: p.category || '',
        }),
      `${p.visitor_name} checked in`
    );

  const checkInPass = (p) =>
    run(p.id, () => wgate.gatePass.verify(p.code), `${p.visitor_name} checked in`);

  const needle = q.trim().toLowerCase();
  const hit = (...fields) => !needle || fields.join(' ').toLowerCase().includes(needle);

  // Visitors
  const pending = visitors.filter((v) => v.status === 'pending');
  const inside = visitors.filter((v) => v.status === 'approved' && !v.check_out_time);
  const doneToday = visitors.filter((v) => v.status === 'approved' && v.check_out_time && istDayOf(v.check_out_time) === today);

  // Pre-approvals valid today, with today's visit (if any)
  const visitToday = {};
  for (const v of visitors) {
    if (!v.pre_approval_id || !v.check_in_time || istDayOf(v.check_in_time) !== today) continue;
    const seen = visitToday[v.pre_approval_id];
    if (!seen || String(v.check_in_time) > String(seen.check_in_time)) visitToday[v.pre_approval_id] = v;
  }
  const preToday = preApprovals
    .filter((p) => p.status === 'active' && p.valid_from <= today && today <= p.valid_until)
    .sort((a, b) => String(a.visitor_name).localeCompare(String(b.visitor_name)));
  const preWaiting = preToday.filter((p) => !visitToday[p.id]);

  // Gate passes valid today
  const usedToday = (p) =>
    (Array.isArray(p.used_dates) && p.used_dates.includes(today)) ||
    (p.status === 'used' && p.used_at && istDayOf(p.used_at) === today);
  const passToday = passes.filter(
    (p) => p.status !== 'cancelled' && p.valid_date <= today && today <= (p.valid_until || p.valid_date) && (p.status === 'active' || usedToday(p))
  );
  const passWaiting = passToday.filter((p) => !usedToday(p));

  // Amenities today
  const bookingsToday = bookings
    .filter((b) => b.booking_date === today && (b.status === 'confirmed' || b.status === 'pending'))
    .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));

  // Tickets
  const openTickets = tickets.filter((t) => t.status === 'open' || t.status === 'in_progress');

  const chips = [
    showVisitors && { id: 'visitors', label: 'Visitors', icon: Users, n: pending.length + inside.length },
    showPre && { id: 'pre', label: 'Pre-approved', icon: UserCheck, n: preWaiting.length },
    showPass && { id: 'pass', label: 'Gate pass', icon: KeyRound, n: passWaiting.length },
    showAmenities && { id: 'amenities', label: 'Amenities', icon: CalendarClock, n: bookingsToday.length },
    showTickets && { id: 'tickets', label: 'Tickets', icon: Wrench, n: openTickets.length },
  ].filter(Boolean);

  if (chips.length === 0) return null;
  const active = chips.find((c) => c.id === tab) || chips[0];

  const visitorSub = (v) => `Flat ${v.flat_number || '—'}${v.visitor_phone ? ` · ${v.visitor_phone}` : ''}`;

  return (
    <div className="space-y-3 rounded-3xl border border-border bg-muted/40 p-3">
      <div className="flex items-center justify-between px-1">
        <p className="text-sm font-bold text-foreground">Gate desk · today</p>
        <p className="text-xs text-muted-foreground">{formatDay(today, 'EEE d MMM')}</p>
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {chips.map((c) => {
          const on = c.id === active.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setTab(c.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold transition-colors ${
                on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground'
              }`}
            >
              <c.icon className="h-4 w-4" />
              {c.label}
              {c.n > 0 && (
                <span className={`flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[11px] font-bold ${on ? 'bg-white/25 text-white' : 'bg-red-600 text-white'}`}>
                  {c.n}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {active.id !== 'tickets' && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, flat or phone" className="bg-card pl-9" />
        </div>
      )}

      <div className="space-y-2">
        {active.id === 'visitors' && (
          <>
            <Heading>Waiting for resident ({pending.filter((v) => hit(v.visitor_name, v.flat_number, v.visitor_phone)).length})</Heading>
            {pending.filter((v) => hit(v.visitor_name, v.flat_number, v.visitor_phone)).map((v) => (
              <Row key={v.id} title={v.visitor_name} sub={visitorSub(v)}>
                <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-700">Pending</span>
              </Row>
            ))}
            <Heading>Inside now ({inside.filter((v) => hit(v.visitor_name, v.flat_number, v.visitor_phone)).length})</Heading>
            {inside.filter((v) => hit(v.visitor_name, v.flat_number, v.visitor_phone)).length === 0 && <Empty>No one is inside.</Empty>}
            {inside.filter((v) => hit(v.visitor_name, v.flat_number, v.visitor_phone)).map((v) => (
              <Row key={v.id} title={v.visitor_name} sub={visitorSub(v)} note={v.check_in_time ? `In ${formatIST(v.check_in_time, 'd MMM, h:mm a')}` : ''}>
                <Button size="sm" variant="outline" disabled={busy === v.id} onClick={() => checkOut(v)}>
                  <LogOut className="mr-1 h-4 w-4" /> Check out
                </Button>
              </Row>
            ))}
            {doneToday.filter((v) => hit(v.visitor_name, v.flat_number, v.visitor_phone)).length > 0 && (
              <>
                <Heading>Left today</Heading>
                <div className="max-h-64 space-y-2 overflow-y-auto overscroll-contain pr-1">
                  {doneToday.filter((v) => hit(v.visitor_name, v.flat_number, v.visitor_phone)).map((v) => (
                    <Row key={v.id} title={v.visitor_name} sub={visitorSub(v)} note={`Out ${formatIST(v.check_out_time, 'h:mm a')}`} />
                  ))}
                </div>
              </>
            )}
            <Link to="/Visitors" className="block pt-1 text-center text-sm font-medium text-primary">All visitors →</Link>
          </>
        )}

        {active.id === 'pre' && (
          <>
            {preToday.filter((p) => hit(p.visitor_name, p.flat_number, p.visitor_phone)).length === 0 && <Empty>No one is pre-approved for today.</Empty>}
            {preToday.filter((p) => hit(p.visitor_name, p.flat_number, p.visitor_phone)).map((p) => {
              const visit = visitToday[p.id];
              const insideNow = visit && !visit.check_out_time;
              return (
                <Row
                  key={p.id}
                  title={`${p.visitor_name} (${p.category})`}
                  sub={`Flat ${p.flat_number || '—'} · ${p.visitor_phone}`}
                  note={
                    visit
                      ? `In ${formatIST(visit.check_in_time, 'h:mm a')}${visit.check_out_time ? ` · out ${formatIST(visit.check_out_time, 'h:mm a')}` : ' · inside'}`
                      : ''
                  }
                >
                  {insideNow ? (
                    <Button size="sm" variant="outline" disabled={busy === visit.id} onClick={() => checkOut(visit)}>
                      <LogOut className="mr-1 h-4 w-4" /> Check out
                    </Button>
                  ) : (
                    <Button size="sm" disabled={busy === p.id} onClick={() => checkInPre(p)}>
                      <LogIn className="mr-1 h-4 w-4" /> {visit ? 'Check in again' : 'Check in'}
                    </Button>
                  )}
                </Row>
              );
            })}
            <Link to="/PreApprovals" className="block pt-1 text-center text-sm font-medium text-primary">All pre-approvals →</Link>
          </>
        )}

        {active.id === 'pass' && (
          <>
            {passToday.filter((p) => hit(p.visitor_name, p.flat_number, p.visitor_phone)).length === 0 && <Empty>No gate passes for today.</Empty>}
            {passToday.filter((p) => hit(p.visitor_name, p.flat_number, p.visitor_phone)).map((p) => {
              const end = p.valid_until && p.valid_until !== p.valid_date ? p.valid_until : '';
              return (
                <Row
                  key={p.id}
                  title={p.visitor_name}
                  sub={`Flat ${p.flat_number || '—'}${p.visitor_phone ? ` · ${p.visitor_phone}` : ''}${end ? ` · until ${formatDay(end, 'd MMM')}` : ''}`}
                  note={usedToday(p) ? 'Checked in today' : ''}
                >
                  {!usedToday(p) && (
                    <Button size="sm" disabled={busy === p.id} onClick={() => checkInPass(p)}>
                      <LogIn className="mr-1 h-4 w-4" /> Check in
                    </Button>
                  )}
                </Row>
              );
            })}
            <p className="text-center text-xs text-muted-foreground">Checked-in pass holders appear under Visitors, where you can check them out.</p>
            <Link to="/GatePasses" className="block pt-1 text-center text-sm font-medium text-primary">Gate pass page →</Link>
          </>
        )}

        {active.id === 'amenities' && (
          <>
            {bookingsToday.filter((b) => hit(b.amenity, b.flat_number, b.resident_name)).length === 0 && <Empty>No amenity bookings today.</Empty>}
            {bookingsToday.filter((b) => hit(b.amenity, b.flat_number, b.resident_name)).map((b) => (
              <Row key={b.id} title={b.amenity} sub={`${b.start_time}–${b.end_time} · Flat ${b.flat_number || '—'}${b.resident_name ? ` · ${b.resident_name}` : ''}`}>
                <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${b.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  {b.status === 'confirmed' ? 'Confirmed' : 'Pending'}
                </span>
              </Row>
            ))}
            <Link to="/Amenities" className="block pt-1 text-center text-sm font-medium text-primary">Amenities page →</Link>
          </>
        )}

        {active.id === 'tickets' && (
          <>
            {openTickets.length === 0 && <Empty>No open tickets.</Empty>}
            {openTickets.slice(0, 8).map((t) => (
              <Row key={t.id} title={t.title} sub={`Flat ${t.flat_number || '—'} · ${String(t.status).replace('_', ' ')}`} />
            ))}
            <Link to="/ServiceTickets" className="block pt-1 text-center text-sm font-medium text-primary">All tickets →</Link>
          </>
        )}
      </div>
    </div>
  );
}