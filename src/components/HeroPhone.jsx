import { Shield, Plus, Phone, Clock, Package, User, Check, LayoutDashboard, Users, Wrench, IndianRupee, Bell } from 'lucide-react';

// A drawn copy of the real Visitors screen. Pure code: no image file to download.
// The names, flat numbers, numbers and times below are made-up samples. Change them freely.
const VISITORS = [
  { name: 'Ravi Kumar', flat: 'Flat 126', status: 'Approved', purpose: 'Delivery', Icon: Package, phone: '98XXXXXX21', time: 'Today, 10:19 AM' },
  { name: 'Anita Verma', flat: 'Flat 204', status: 'Pending', purpose: 'Guest', Icon: User, phone: '97XXXXXX45', time: 'Today, 10:32 AM' },
  { name: 'Suresh Nair', flat: 'Flat 311', status: 'Approved', purpose: 'Service', Icon: Wrench, phone: '99XXXXXX08', time: 'Today, 9:48 AM' },
];

const TABS = ['All', 'Pending', 'Approved', 'Rejected'];
const NAV = [
  { label: 'Home', Icon: LayoutDashboard },
  { label: 'Visitors', Icon: Users, active: true },
  { label: 'Services', Icon: Wrench },
  { label: 'Billing', Icon: IndianRupee },
  { label: 'Profile', Icon: User },
];

export default function HeroPhone() {
  return (
    <div className="relative mx-auto w-full max-w-md" style={{ zoom: 0.8 }}>
      {/* soft background shapes */}
      <div className="absolute inset-0 -z-10 rounded-[2.5rem] bg-gradient-to-br from-primary/10 via-sky-100/60 to-emerald-100/70" />
      <div className="absolute -left-6 top-10 -z-10 h-28 w-28 rounded-full bg-amber-200/60 blur-2xl" />
      <div className="absolute -right-4 bottom-8 -z-10 h-32 w-32 rounded-full bg-emerald-300/40 blur-2xl" />

      <div className="flex items-center justify-center px-6 py-10">
        {/* the phone */}
        <div className="relative w-[15.5rem] overflow-hidden rounded-[2.4rem] border-[7px] border-slate-900 bg-slate-50 shadow-2xl">
          <div className="mx-auto mt-2 h-1.5 w-14 rounded-full bg-slate-900/80" />

          {/* top bar */}
          <div className="mt-2 flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary">
              <Shield className="h-3 w-3 text-primary-foreground" />
            </div>
            <span className="text-xs font-semibold text-slate-900">MySociety</span>
            <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">Admin</span>
            <Bell className="h-3.5 w-3.5 text-slate-400" />
          </div>

          <div className="space-y-2.5 px-3 pb-2 pt-3">
            {/* title row */}
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-slate-900">Visitors</p>
              <span className="flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-[10px] font-semibold text-primary-foreground">
                <Plus className="h-3 w-3" /> Check In
              </span>
            </div>

            {/* tabs */}
            <div className="grid grid-cols-4 gap-0.5 rounded-lg bg-slate-200/70 p-0.5">
              {TABS.map((t, i) => (
                <span
                  key={t}
                  className={`rounded-md py-1 text-center text-[9px] font-medium ${i === 0 ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                >
                  {t}
                </span>
              ))}
            </div>

            {/* visitor cards */}
            {VISITORS.map((v) => (
              <div key={v.name} className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-900">{v.name}</p>
                    <p className="text-[10px] text-slate-500">{v.flat}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold ${v.status === 'Approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                    {v.status === 'Approved' && <Check className="mr-0.5 inline h-2.5 w-2.5" />}{v.status}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <span className="flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-600"><v.Icon className="h-2.5 w-2.5" />{v.purpose}</span>
                  <span className="flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-600"><Phone className="h-2.5 w-2.5" />{v.phone}</span>
                  <span className="flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-600"><Clock className="h-2.5 w-2.5" />{v.time}</span>
                </div>
              </div>
            ))}
          </div>

          {/* bottom bar */}
          <div className="grid grid-cols-5 border-t border-slate-200 bg-white px-1 py-1.5">
            {NAV.map(({ label, Icon, active }) => (
              <span
                key={label}
                className={`flex flex-col items-center gap-0.5 rounded-lg py-1 text-[8px] font-medium ${active ? 'bg-primary/10 text-primary' : 'text-slate-500'}`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* floating chips */}
      <div className="absolute left-0 top-12 flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-lg">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500"><Check className="h-3 w-3 text-white" /></span>
        Visitor approved
      </div>
      <div className="absolute right-0 top-1/2 flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-lg">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-500"><IndianRupee className="h-3 w-3 text-white" /></span>
        Bill paid
      </div>
      <div className="absolute bottom-6 left-4 flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-lg">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500"><Bell className="h-3 w-3 text-white" /></span>
        New notice
      </div>
    </div>
  );
}