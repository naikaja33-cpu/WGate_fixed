import { useEffect, useState } from 'react';
import { wgate } from '@/api/wgateClient';
import AnnouncementModal from '@/components/announcement/AnnouncementModal';

const STORAGE_KEY = 'wgate_seen_announcement';

/**
 * Shows the super admin's festival / welcome pop-up once per device. It checks
 * when the app opens, even before sign-in. If the super admin saves a new
 * message, it is shown again. Any failure is ignored: it never blocks the app.
 */
export default function WelcomeBanner() {
  const [announcement, setAnnouncement] = useState(null);

  useEffect(() => {
    let cancelled = false;
    wgate.publicApi.announcement()
      .then((a) => {
        if (cancelled || !a?.active) return;
        let seen = null;
        try { seen = localStorage.getItem(STORAGE_KEY); } catch { /* storage unavailable */ }
        if (seen === a.id) return;
        setAnnouncement(a);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const handleClose = () => {
    try { localStorage.setItem(STORAGE_KEY, announcement.id); } catch { /* storage unavailable */ }
    setAnnouncement(null);
  };

  if (!announcement) return null;
  return <AnnouncementModal announcement={announcement} onClose={handleClose} />;
}