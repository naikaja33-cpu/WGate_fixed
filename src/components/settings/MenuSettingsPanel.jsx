import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const ALL_MENUS = [
  { key: 'Visitors', label: 'Visitors' },
  { key: 'ServiceTickets', label: 'Service Tickets' },
  { key: 'NoticeBoard', label: 'Notice Board' },
  { key: 'Billing', label: 'Billing' },
];

export default function MenuSettingsPanel() {
  const { user } = useAuth();
  const [settingsId, setSettingsId] = useState(null);
  const [enabled, setEnabled] = useState(ALL_MENUS.map(m => m.key));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.society_id) return;
    base44.entities.SocietySettings.filter({ society_id: user.society_id }).then(results => {
      if (results.length > 0) {
        setSettingsId(results[0].id);
        setEnabled(results[0].enabled_menus ?? ALL_MENUS.map(m => m.key));
      }
    });
  }, [user?.society_id]);

  const toggle = async (key) => {
    const next = enabled.includes(key) ? enabled.filter(k => k !== key) : [...enabled, key];
    setEnabled(next);
    setSaving(true);
    if (settingsId) {
      await base44.entities.SocietySettings.update(settingsId, { enabled_menus: next });
    } else {
      const created = await base44.entities.SocietySettings.create({ society_id: user.society_id, enabled_menus: next });
      setSettingsId(created.id);
    }
    setSaving(false);
    toast.success('Menu settings saved');
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-4 space-y-4">
      <h2 className="font-semibold text-foreground">Menu Visibility</h2>
      <p className="text-xs text-muted-foreground">Toggle which menu items are visible to all users.</p>
      <div className="space-y-3">
        {ALL_MENUS.map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between">
            <Label className="text-sm font-medium">{label}</Label>
            <Switch
              checked={enabled.includes(key)}
              onCheckedChange={() => toggle(key)}
              disabled={saving}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
