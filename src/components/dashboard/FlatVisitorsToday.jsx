import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { DoorOpen, LogOut } from 'lucide-react';
import { wgate } from '@/api/wgateClient';
import { formatIST, istDayOf, istToday } from '@/lib/ist';

// For members: who is inside your flat's visit right now, and who came and left today.
// The visitors come from the dashboard, which already loads them for the member's flat.

function Line({ v, out }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
      <div className="min-w-0">
        <p className="truncate font-semibold text-foreground">{v.visitor_name}</p>
        <p className="text-xs text-muted-foreground">
          {v.gate_pass_id ? '🎫 Gate pass' : v.pre_approval_id ? '✅ Pre-approved' : v.purpose || 'Visitor'}
          {v.visitor_phone ? ` · ${v.visitor_phone}` : ''}
        </p>
      </div>
      <div className="shrink-0 text-right text-xs">
        {v.check_in_time && <p className="text-muted-foreground">In {formatIST(v.check_in_time, 'h:mm a')}</p>}
        {out ? (
          <p className="font-medium text-foreground">Out {formatIST(v.check_out_time, 'h:mm a')}</p>
        ) : (
          <p className="font-semibold text-emerald-700">Inside</p>
        )}
      </div>
    </div>
  );
}

export default function FlatVisitorsToday({ visitors = [] }) {
  const queryClient = useQueryClient();
  const today = istToday();

  // Refresh when the guard checks someone in or out.
  useEffect(() => {
    let stop = null;
    try {
      stop = wgate.entities.Visitor.subscribe(() => queryClient.invalidateQueries({ queryKey: ['visitors-dashboard'] }));
    } catch {
      /* live updates unavailable */
    }
    return () => typeof stop === 'function' && stop();
  }, [queryClient]);

  const inside = visitors.filter((v) => v.status === 'approved' && !v.check_out_time);
  const left = visitors.filter((v) => v.status === 'approved' && v.check_out_time && istDayOf(v.check_out_time) === today);

  return (
    <div className="space-y-2 rounded-2xl border border-border bg-card p-3">
      <div className="flex items-center justify-between px-1">
        <p className="flex items-center gap-2 text-sm font-bold text-foreground">
          <DoorOpen className="h-4 w-4 text-primary" /> Visitors at your flat today
        </p>
        <Link to="/Visitors" className="text-xs font-medium text-primary">All →</Link>
      </div>

      {inside.length === 0 && left.length === 0 && (
        <p className="py-2 text-center text-sm text-muted-foreground">No one has visited today.</p>
      )}

      {inside.length > 0 && (
        <>
          <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Inside now ({inside.length})</p>
          <div className="max-h-64 space-y-2 overflow-y-auto overscroll-contain pr-1">
            {inside.map((v) => <Line key={v.id} v={v} />)}
          </div>
        </>
      )}

      {left.length > 0 && (
        <>
          <p className="flex items-center gap-1 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <LogOut className="h-3 w-3" /> Came and left today ({left.length})
          </p>
          <div className="max-h-64 space-y-2 overflow-y-auto overscroll-contain pr-1">
            {left.map((v) => <Line key={v.id} v={v} out />)}
          </div>
        </>
      )}
    </div>
  );
}