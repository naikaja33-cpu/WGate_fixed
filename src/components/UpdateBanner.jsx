import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

const SITE = 'https://wwgate.in';

export default function UpdateBanner() {
  const [update, setUpdate] = useState(null);
  const [forced, setForced] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Only the installed Android app checks; the website is always current.
    if (!Capacitor.isNativePlatform()) return;
    let cancelled = false;
    (async () => {
      try {
        const info = await CapApp.getInfo();
        const installed = Number(info.build);
        const res = await fetch(`${SITE}/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const latest = await res.json();
        if (cancelled) return;
        if (Number(latest.versionCode) > installed) {
          setUpdate(latest);
          setForced(installed < Number(latest.minVersionCode || 0));
        }
      } catch {
        // Offline or file missing: stay silent, never block the app.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!update) return null;

  const apkUrl = `${SITE}/wgate.apk`;

  if (forced) {
    return (
      <div className="fixed inset-0 z-[100] bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-sm text-center space-y-4">
          <Download className="w-10 h-10 text-primary mx-auto" />
          <h2 className="text-lg font-semibold">Update required</h2>
          <p className="text-sm text-muted-foreground">
            This version of WGate is no longer supported. Please install the latest version to continue.
            {update.versionName ? ` (v${update.versionName})` : ''}
          </p>
          {update.notes && <p className="text-xs text-muted-foreground">{update.notes}</p>}
          <a href={apkUrl} target="_blank" rel="noopener noreferrer" className="block">
            <Button className="w-full">Download update</Button>
          </a>
        </div>
      </div>
    );
  }

  if (dismissed) return null;

  return (
    <div
      className="fixed top-0 inset-x-0 z-[60] bg-primary text-primary-foreground shadow-md"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="max-w-4xl mx-auto px-4 py-2.5 flex items-center gap-3">
        <Download className="w-4 h-4 shrink-0" />
        <div className="flex-1 min-w-0 text-sm">
          <p className="font-medium">Update available{update.versionName ? ` (v${update.versionName})` : ''}</p>
          {update.notes && <p className="text-xs opacity-90 truncate">{update.notes}</p>}
        </div>
        <a
          href={apkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-xs font-semibold bg-white/20 hover:bg-white/30 rounded-full px-3 py-1.5"
        >
          Update
        </a>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="shrink-0 p-1 rounded-md hover:bg-white/20"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}