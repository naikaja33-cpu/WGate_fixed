import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { wgate } from '@/api/wgateClient';
import { saveFile } from '@/lib/saveFile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

const dayString = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

// Admin: choose a date range and download the visitor log as a CSV file.
export default function ExportVisitorsDialog({ open, onOpenChange }) {
  const today = new Date();
  const monthAgo = new Date(today.getTime() - 29 * 86400000);
  const [from, setFrom] = useState(dayString(monthAgo));
  const [to, setTo] = useState(dayString(today));
  const [busy, setBusy] = useState(false);

  const download = async () => {
    if (!from || !to) return toast.error('Choose both dates');
    if (from > to) return toast.error('The From date must be on or before the To date');
    setBusy(true);
    try {
      await saveFile(await wgate.files.visitors(from, to));
      onOpenChange(false);
    } catch (err) {
      toast.error(err?.message || 'Could not export the visitors');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Export visitors</DialogTitle>
          <DialogDescription>Downloads a CSV file you can open in Excel or Google Sheets.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="exp-from">From</Label>
            <Input id="exp-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="exp-to">To</Label>
            <Input id="exp-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
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