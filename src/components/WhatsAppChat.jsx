import { MessageCircle } from 'lucide-react';
import { whatsappLink } from '@/lib/siteInfo';

// Floating "Chat with us" button, bottom-right of the screen.
export default function WhatsAppChat() {
  return (
    <a
      href={whatsappLink()}
      target="_blank"
      rel="noreferrer"
      aria-label="Chat with us on WhatsApp"
      className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-[#1ebe5b] active:scale-95"
    >
      <MessageCircle className="h-5 w-5" />
      <span className="hidden sm:inline">Chat with us</span>
    </a>
  );
}