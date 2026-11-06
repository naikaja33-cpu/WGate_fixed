import { useState } from 'react';
import { X, Loader2, Smartphone, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { amountDue, buildUpiLink } from '@/lib/billing';

/**
 * A member pays a bill:
 *   1. "Pay" opens GPay / PhonePe / Paytm (any UPI app) with the amount filled in.
 *   2. They come back and enter the UPI transaction ID (UTR) shown in that app.
 *   3. The admin checks it against the bank statement and closes the bill.
 *  - config:    { upi_id, payee_name }
 *  - onSubmit(utr): async; throw to show the message under the form
 */
export default function PayBillModal({ bill, config, onSubmit, onClose }) {
  const [utr, setUtr] = useState('');
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const amount = amountDue(bill);
  const upiLink = buildUpiLink({
    upiId: config.upi_id,
    payeeName: config.payee_name,
    amount,
    note: `Maintenance ${bill.month_label || bill.month || ''} Flat ${bill.flat_number}`,
  });

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(config.upi_id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard not available: the ID is shown on screen to copy by hand.
    }
  };

  const handleSubmit = async () => {
    setError('');
    const id = utr.replace(/\s+/g, '');
    if (!/^[A-Za-z0-9]{8,30}$/.test(id)) {
      setError('Enter the UPI transaction ID (UTR) from your payment app. It is usually 12 digits.');
      return;
    }
    setSaving(true);
    try {
      await onSubmit(id);
    } catch (e) {
      setError(e?.message || 'Could not submit. Please try again.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
      <div className="bg-card w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Pay Maintenance</h2>
          <button onClick={onClose} aria-label="Close"><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>

        <div className="bg-muted rounded-xl p-3 text-sm">
          <p className="font-medium">{bill.month_label || bill.month} · Flat {bill.flat_number}</p>
          <p className="text-2xl font-bold text-foreground mt-1">₹{amount.toLocaleString('en-IN')}</p>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Step 1: Pay</p>
          <Button asChild className="w-full">
            <a href={upiLink}><Smartphone className="w-4 h-4 mr-2" /> Pay with GPay, PhonePe or any UPI app</a>
          </Button>
          <div className="flex items-center gap-2 text-xs text-muted-foreground border border-border rounded-xl px-3 py-2">
            <div className="flex-1 min-w-0">
              <p className="truncate">{config.payee_name}</p>
              <p className="font-mono text-foreground truncate">{config.upi_id}</p>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={handleCopy}>
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            The button does not work on a computer or if no UPI app opens. Copy the UPI ID and pay ₹{amount.toLocaleString('en-IN')} from your phone.
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Step 2: Tell us you paid</p>
          <div className="space-y-1.5">
            <Label className="text-xs">UPI transaction ID (UTR)</Label>
            <Input value={utr} maxLength={30} placeholder="e.g. 412345678901" inputMode="text" autoCapitalize="characters"
              onChange={(e) => setUtr(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">
            Find it in your payment app under the payment details. Your bill is closed once the admin confirms the payment in the bank statement.
          </p>
        </div>

        {error && <p className="text-xs text-destructive" role="alert">{error}</p>}

        <Button onClick={handleSubmit} disabled={saving} variant="outline" className="w-full border-emerald-200 text-emerald-700 hover:bg-emerald-50">
          {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting...</> : 'I have paid'}
        </Button>
      </div>
    </div>
  );
}