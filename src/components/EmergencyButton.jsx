import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import { wgate } from '@/api/wgateClient';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';

const KINDS = [
  { id: 'medical', label: 'Medical' },
  { id: 'fire', label: 'Fire' },
  { id: 'security', label: 'Security / theft' },
  { id: 'other', label: 'Other' },
];

// A floating SOS button for residents. It asks first, so it cannot be pressed by accident.
export default function EmergencyButton() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState('medical');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  const isResident = ['owner', 'tenant', 'family'].includes(user?.role);
  if (!user || !isResident) return null;

  const send = async () => {
    setSending(true);
    try {
      await wgate.emergency.send(kind, note.trim());
      toast.success('Alert sent. Security and the admin have been notified.');
      setOpen(false);
      setNote('');
      setKind('medical');
    } catch (err) {
      toast.error(err?.message || 'Could not send the alert. Please call security directly.');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Emergency alert"
        className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-sm font-bold text-white shadow-lg ring-4 ring-red-600/25 active:scale-95"
      >
        SOS
      </button>

      <Dialog open={open} onOpenChange={(v) => !sending && setOpen(v)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <ShieldAlert className="h-5 w-5" /> Send emergency alert
            </DialogTitle>
            <DialogDescription>
              This alerts the security guards and the admin of your society with your name, flat and phone number.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-2">
            {KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => setKind(k.id)}
                className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                  kind === k.id ? 'border-red-600 bg-red-50 text-red-700' : 'border-border bg-card text-foreground'
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>

          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 200))}
            placeholder="Short note (optional), for example: Father fainted, please bring help"
            rows={2}
          />

          <p className="text-xs text-muted-foreground">
            This does not call the police or an ambulance. In a life-threatening emergency, call <b>112</b> first.
          </p>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={sending}>Cancel</Button>
            <Button className="bg-red-600 text-white hover:bg-red-700" onClick={send} disabled={sending}>
              {sending ? 'Sending...' : 'Send alert'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}