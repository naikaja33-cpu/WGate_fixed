import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Phone, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import { wgate } from '@/api/wgateClient';
import { Button } from '@/components/ui/button';

const ago = (iso) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return mins < 1 ? 'just now' : `${mins} min ago`;
};

// For guards and admins: a red banner at the top while an emergency alert is waiting.
export default function EmergencyAlerts() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isStaff = user?.role === 'guard' || user?.role === 'admin';
  const seen = useRef(null);

  const { data: alerts = [] } = useQuery({
    queryKey: ['emergency-active'],
    queryFn: () => wgate.emergency.active(),
    enabled: !!isStaff,
    refetchInterval: 10000,
    staleTime: 0,
  });

  const open = alerts.filter((a) => !a.ack_at);

  // Vibrate the phone when a new alert arrives while the app is open.
  useEffect(() => {
    if (!isStaff) return;
    const ids = new Set(open.map((a) => a.id));
    if (seen.current && open.some((a) => !seen.current.has(a.id))) {
      try { navigator.vibrate?.([500, 200, 500, 200, 500]); } catch { /* not supported */ }
    }
    seen.current = ids;
  }, [open, isStaff]);

  if (!isStaff || open.length === 0) return null;

  const acknowledge = async (id) => {
    try {
      await wgate.emergency.acknowledge(id);
      queryClient.invalidateQueries({ queryKey: ['emergency-active'] });
    } catch (err) {
      toast.error(err?.message || 'Could not update the alert');
    }
  };

  return (
    <div className="fixed left-0 right-0 top-0 z-50 space-y-2 p-2" style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}>
      {open.map((a) => (
        <div key={a.id} className="rounded-xl bg-red-600 p-3 text-white shadow-xl">
          <div className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-bold">EMERGENCY: {a.label}</p>
              <p className="text-sm">
                Flat {a.flat_number || '-'} - {a.user_name || 'Resident'} - {ago(a.created_at)}
              </p>
              {a.note && <p className="mt-1 text-sm italic">"{a.note}"</p>}
            </div>
          </div>
          <div className="mt-2 flex gap-2">
            {a.user_phone && (
              <Button asChild size="sm" variant="secondary" className="flex-1">
                <a href={`tel:${a.user_phone}`}><Phone className="mr-1 h-4 w-4" /> Call {a.user_phone}</a>
              </Button>
            )}
            <Button size="sm" variant="secondary" className="flex-1" onClick={() => acknowledge(a.id)}>
              I am handling this
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}