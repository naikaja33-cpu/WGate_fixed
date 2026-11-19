import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import { wgate } from '@/api/wgateClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

// "Delete my account" on the Profile page. Needs the member's password. Google Play requires this in the app.
export default function DeleteAccountSection() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const hasFamily = user?.role === 'owner' || user?.role === 'tenant';

  const close = (v) => {
    if (busy) return;
    setOpen(v);
    if (!v) { setPassword(''); setError(''); }
  };

  const submit = async () => {
    if (!password) { setError('Enter your password'); return; }
    setBusy(true);
    setError('');
    try {
      await wgate.auth.deleteAccount(password);
      toast.success('Your account has been deleted');
      logout();
    } catch (err) {
      setError(err?.message || 'Could not delete the account. Please try again.');
      setBusy(false);
    }
  };

  return (
    <>
      <div className="pt-2 text-center">
        <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 text-sm text-destructive underline underline-offset-2 py-2 px-3">
          <Trash2 className="w-3.5 h-3.5" /> Delete my account
        </button>
        <p className="text-xs text-muted-foreground mt-1">
          <Link to="/privacy" className="underline hover:text-foreground">Privacy Policy</Link>
          {' · '}
          <Link to="/terms" className="underline hover:text-foreground">Terms of Use</Link>
        </p>
      </div>

      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              This cannot be undone. Your name, email, phone, password and sign-ins are removed{hasFamily ? ', along with the family members you added' : ''}, and so are your community board posts. Records that belong to the society, such as bills and the visitor log, stay with the society for the periods in the Privacy Policy.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="del-pass">Enter your password to confirm</Label>
            <Input id="del-pass" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => close(false)} disabled={busy}>Cancel</Button>
            <Button variant="destructive" onClick={submit} disabled={busy}>
              {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Delete my account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}