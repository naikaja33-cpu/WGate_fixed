import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { wgate } from '@/api/wgateClient';
import AnnouncementModal from '@/components/announcement/AnnouncementModal';
import { THEMES, THEME_KEYS } from '@/components/announcement/themes';

/** Super admin: switch the welcome / festival pop-up on or off for every society. */
export default function AnnouncementCard() {
  const [form, setForm] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    let cancelled = false;
    wgate.superadmin.getAnnouncement()
      .then((a) => { if (!cancelled) setForm(a); })
      .catch((e) => { if (!cancelled) setLoadError(e?.message || 'Could not load the banner settings'); });
    return () => { cancelled = true; };
  }, []);

  if (loadError) return <p className="text-sm text-destructive">{loadError}</p>;
  if (!form) return null;

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  // Picking a festival fills in a ready-made greeting, unless you already wrote your own.
  const pickTheme = (key) => {
    setForm((f) => {
      const old = THEMES[f.theme] || THEMES.general;
      return {
        ...f,
        theme: key,
        title: !f.title || f.title === old.title ? THEMES[key].title : f.title,
        message: !f.message || f.message === old.message ? THEMES[key].message : f.message,
      };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await wgate.superadmin.saveAnnouncement({
        enabled: !!form.enabled,
        theme: form.theme,
        title: form.title,
        message: form.message,
        start_date: form.start_date || '',
        end_date: form.end_date || '',
      });
      setForm(saved);
      toast.success(saved.enabled ? 'Saved. Everyone will see it when they next open the app.' : 'Saved. The banner is switched off.');
    } catch (e) {
      toast.error(e?.message || 'Could not save the banner');
    }
    setSaving(false);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">Welcome / Festival Banner</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{form.enabled ? 'On' : 'Off'}</span>
            <Switch checked={!!form.enabled} onCheckedChange={(v) => set('enabled', v)} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          A pop-up shown once to every user of every society when they open the app. Saving a new message shows it again.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Occasion</Label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {THEME_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => pickTheme(key)}
                className={`rounded-xl border px-3 py-2 text-sm text-left transition-colors ${
                  form.theme === key ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border text-muted-foreground hover:bg-accent'
                }`}
              >
                {THEMES[key].emoji} {THEMES[key].label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Title</Label>
          <Input value={form.title || ''} maxLength={60} placeholder="e.g. Happy Diwali!" onChange={(e) => set('title', e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Message</Label>
          <Textarea value={form.message || ''} maxLength={300} rows={3} placeholder="Your greeting"
            onChange={(e) => set('message', e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Show from (optional)</Label>
            <Input type="date" value={form.start_date || ''} onChange={(e) => set('start_date', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Stop showing after (optional)</Label>
            <Input type="date" value={form.end_date || ''} onChange={(e) => set('end_date', e.target.value)} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          With dates set, the banner switches itself on and off (India time). Leave both empty to show it until you turn it off.
        </p>

        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={() => setShowPreview(true)} disabled={!form.title}>
            Preview
          </Button>
          <Button type="button" className="flex-1" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </CardContent>

      {showPreview && <AnnouncementModal announcement={form} onClose={() => setShowPreview(false)} />}
    </Card>
  );
}