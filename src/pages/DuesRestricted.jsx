import { useEffect, useState } from 'react';
import { Lock, LogOut, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/AuthContext';
import { wgate } from '@/api/wgateClient';
import Billing from '@/pages/Billing';

// Shown instead of the app while a flat has a bill that is overdue by more than the society's limit.
// Billing is the only working screen, so the member can pay and report the payment from here.
export default function DuesRestricted() {
  const { user, logout, refreshUser } = useAuth();
  const [checking, setChecking] = useState(false);
  const [stillLocked, setStillLocked] = useState(false);
  const canPay = user?.role === 'owner' || user?.role === 'tenant';

  const check = async () => {
    const me = await wgate.auth.me();
    if (!me.dues_blocked) refreshUser(); // access is back
    return !!me.dues_blocked;
  };

  const handleCheck = async () => {
    setChecking(true);
    setStillLocked(false);
    try {
      setStillLocked(await check());
    } catch {
      setStillLocked(true);
    } finally {
      setChecking(false);
    }
  };

  // Look again every 20 seconds, so access returns on its own once the dues are cleared.
  useEffect(() => {
    const timer = setInterval(() => { check().catch(() => {}); }, 20000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto p-4 space-y-3">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 space-y-2">
          <div className="flex items-center gap-2 text-red-700 font-semibold">
            <Lock className="w-5 h-5" /> App access is paused
          </div>
          <p className="text-sm text-red-800">
            Flat {user?.flat_number} has a maintenance bill that is overdue by more than the allowed time.
            {canPay
              ? ' Please pay the bill below and submit your transaction ID. The app opens again once the admin confirms your payment.'
              : ' Please ask the owner or tenant of your flat to pay the bill.'}
          </p>
          <p className="text-xs text-red-700">
            If a visitor is waiting at the gate, the security guard will call or WhatsApp you.
          </p>
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={handleCheck} disabled={checking} className="bg-white">
              <RefreshCw className={`w-4 h-4 mr-1 ${checking ? 'animate-spin' : ''}`} /> Check again
            </Button>
            <Button size="sm" variant="outline" onClick={() => logout()} className="bg-white">
              <LogOut className="w-4 h-4 mr-1" /> Sign out
            </Button>
          </div>
          {stillLocked && <p className="text-xs text-red-700">Access is still paused. Please pay or submit your transaction ID first.</p>}
        </div>
      </div>
      <Billing />
    </div>
  );
}