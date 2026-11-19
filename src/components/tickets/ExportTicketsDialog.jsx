import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { wgate } from '@/api/wgateClient';
import { saveFile } from '@/lib/saveFile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

const STATUSES = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

// A date as 'yyyy-MM-dd' in India time.
const indiaDay = (ms) => new Date(ms + 330 * 60 * 1000).toISOString().slice(0, 10);

// Admin: choose the ticket statuses and a date range, then download the tickets as a CSV file.
export default function ExportTicketsDialog({ open, onOpenChange }) {
  const now = Date.now();
  const [from, setFrom] = useState(indiaDay(now - 364 * 86400000));
  const [to, setTo] = useState(indiaDay(now));
  const [statuses, setStatuses] = useState(STATUSES.map((s) => s.value));
  const [busy, setBusy] = useState(false);

  const toggle = (value, on) =>
    setStatuses((prev) => (on ? [...new Set([...prev, value])] : prev.filter((v) => v !== value)));

  const download = async () => {
    if (!from || !to) return toast.error('Choose both dates');
    if (from > to) return toast.error('The From date must be on or before the To date');
    if (statuses.length === 0) return toast.error('Choose at least one status');
    setBusy(true);
    try {
      await saveFile(await wgate.files.tickets(from, to, statuses));
      onOpenChange(false);
    } catch (err) {
      toast.error(err?.message || 'Could not export the tickets');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Export service tickets</DialogTitle>
          <DialogDescription>Downloads a CSV file you can open in Excel or Google Sheets.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label>Status</Label>
          <div className="grid grid-cols-2 gap-2">
            {STATUSES.map((s) => (
              <label key={s.value} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={statuses.includes(s.value)} onCheckedChange={(on) => toggle(s.value, on === true)} />
                {s.label}
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="tkt-from">Raised from</Label>
            <Input id="tkt-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tkt-to">Raised to</Label>
            <Input id="tkt-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={download} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />} Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}