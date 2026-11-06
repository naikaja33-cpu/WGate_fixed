import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { wgate } from '@/api/wgateClient';

const UPI_PATTERN = /^[a-zA-Z0-9.\-_]{2,100}@[a-zA-Z][a-zA-Z0-9]{1,63}$/;

/**
 * Admin: the society's UPI ID. Members pay to this ID from GPay, PhonePe, Paytm or any UPI app.
 *  - config: the saved record, or null the first time
 */
export default function PaymentSettingsModal({ config, onClose, onSaved }) {
  const [upiId, setUpiId] = useState(config?.upi_id || '');
  const [payeeName, setPayeeName] = useState(config?.payee_name || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setError('');
    const id = upiId.trim();
    const name = payeeName.trim();
    if (!UPI_PATTERN.test(id)) {
      setError('Enter a valid UPI ID, like mysociety@okhdfcbank');
      return;
    }
    if (!name || name.length > 60) {
      setError('Enter the society name to show on the payment screen (max 60 characters).');
      return;
    }
    setSaving(true);
    try {
      if (config) await wgate.entities.PaymentConfig.update(config.id, { upi_id: id, payee_name: name });
      else await wgate.entities.PaymentConfig.create({ upi_id: id, payee_name: name });
      onSaved();
    } catch (e) {
      setError(e?.message || 'Could not save. Please try again.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
      <div className="bg-card w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Online Payment Setup</h2>
          <button onClick={onClose} aria-label="Close"><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>

        <p className="text-xs text-muted-foreground">
          Members will pay their maintenance bill to this UPI ID using GPay, PhonePe, Paytm or any UPI app.
          Use your society's bank account UPI ID.
        </p>

        <div className="space-y-1.5">
          <Label className="text-xs">Society UPI ID</Label>
          <Input value={upiId} placeholder="e.g. mysociety@okhdfcbank" autoCapitalize="none" autoCorrect="off"
            onChange={(e) => setUpiId(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Name shown on the payment screen</Label>
          <Input value={payeeName} maxLength={60} placeholder="e.g. Green Valley Residents Association"
            onChange={(e) => setPayeeName(e.target.value)} />
        </div>

        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
          <p>Before you save, check the ID is correct. Members' money goes straight to it.</p>
          <p>Try a ₹1 test payment yourself first. A business or current-account UPI ID works best, because some apps limit payments to personal IDs.</p>
        </div>

        {error && <p className="text-xs text-destructive" role="alert">{error}</p>}

        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : 'Save'}
        </Button>
      </div>
    </div>
  );
}