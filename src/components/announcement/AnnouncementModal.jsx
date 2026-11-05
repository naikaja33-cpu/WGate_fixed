import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { themeOf } from '@/components/announcement/themes';

/**
 * The festival / welcome pop-up. Used for real (WelcomeBanner) and for the
 * super admin's Preview button.
 *  - announcement: { theme, title, message }
 */
export default function AnnouncementModal({ announcement, onClose }) {
  const theme = themeOf(announcement.theme);

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center p-6"
      role="dialog"
      aria-modal="true"
      aria-label={announcement.title}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm rounded-3xl overflow-hidden bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`bg-gradient-to-br ${theme.gradient} text-white px-6 pt-10 pb-8 text-center`}>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-3 right-3 rounded-full bg-black/20 p-1.5 text-white"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="text-6xl animate-bounce" aria-hidden="true">{theme.emoji}</div>
          <div className="mt-3 text-xl tracking-widest opacity-90" aria-hidden="true">✨ {theme.emoji} ✨</div>
          <h2 className="mt-3 text-2xl font-bold break-words">{announcement.title}</h2>
        </div>
        <div className="px-6 py-5 space-y-4 text-center">
          {announcement.message && (
            <p className="text-sm text-muted-foreground whitespace-pre-line break-words">{announcement.message}</p>
          )}
          <Button className="w-full rounded-xl" onClick={onClose}>Thank you</Button>
        </div>
      </div>
    </div>
  );
}