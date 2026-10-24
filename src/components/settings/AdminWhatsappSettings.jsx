import { useState, useEffect } from 'react';
import { wgate } from '@/api/wgateClient';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function AdminWhatsappSettings() {
  const [number, setNumber] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    wgate.admin.getWhatsappNumber()
      .then((res) => setNumber(res.ticket_whatsapp_number || ''))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await wgate.admin.updateWhatsappNumber(number);
      toast.success('WhatsApp number saved');
    } catch (err) {
      toast.error(err?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  return (
    <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
      <Label className="text-sm font-medium">New-ticket WhatsApp alerts</Label>
      <p className="text-xs text-muted-foreground">
        When a resident raises a service ticket, a WhatsApp message goes to this number. Leave blank to turn it off.
      </p>
      <div className="flex gap-2">
        <Input
          value={number}
          onChange={(e) => setNumber(e.target.value.replace(/\D/g, '').slice(0, 15))}
          placeholder="Admin/guard number (with country code if not Indian)"
          inputMode="numeric"
        />
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}