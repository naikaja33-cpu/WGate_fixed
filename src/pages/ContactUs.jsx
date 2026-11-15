import { Mail, Phone, Clock, MapPin, MessageCircle } from 'lucide-react';
import InfoShell from '@/components/InfoShell';
import { SITE, whatsappLink } from '@/lib/siteInfo';

export default function ContactUs() {
  const rows = [
    { icon: Mail, label: 'Email', value: SITE.email, href: `mailto:${SITE.email}` },
    { icon: Phone, label: 'Phone', value: SITE.phone, href: `tel:${SITE.phone.replace(/[^\d+]/g, '')}` },
    { icon: Clock, label: 'Support hours', value: SITE.hours },
    { icon: MapPin, label: 'Location', value: SITE.address },
  ];
  return (
    <InfoShell title="Contact Us" intro="We are happy to help with a demo for your society, or with any problem you run into.">
      <a
        href={whatsappLink()}
        target="_blank"
        rel="noreferrer"
        className="flex items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-5 py-4 font-semibold text-white shadow hover:bg-[#1ebe5b]"
      >
        <MessageCircle className="h-5 w-5" /> Chat with us on WhatsApp
      </a>
      <div className="mt-6 divide-y divide-border rounded-2xl border border-border bg-card">
        {rows.map(({ icon: Icon, label, value, href }) => (
          <div key={label} className="flex items-start gap-3 p-4">
            <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
              {href ? (
                <a href={href} className="break-words font-medium text-foreground hover:underline">{value}</a>
              ) : (
                <p className="font-medium text-foreground">{value}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </InfoShell>
  );
}