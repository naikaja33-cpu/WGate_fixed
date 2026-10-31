import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { Download, X } from 'lucide-react';

const SITE = 'https://wwgate.in';

export default function UpdateBanner() {
  const [update, setUpdate] = useState(null);
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
        if (!cancelled && Number(latest.versionCode) > installed) setUpdate(latest);
      } catch {
        // Offline or file missing: stay silent, never block the app.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!update || dismissed) return null;

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
          href={`${SITE}/wgate.apk`}
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