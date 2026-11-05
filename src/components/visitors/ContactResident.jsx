import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Phone, MessageCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { wgate } from '@/api/wgateClient';
import { Button } from '@/components/ui/button';

const ROLE_LABELS = { owner: 'Owner', tenant: 'Tenant', family: 'Family' };

/**
 * For the guard and admin: call or WhatsApp the residents of the flat while a
 * visitor waits at the gate. The numbers are fetched only when this is opened.
 */
export default function ContactResident({ visitor }) {
  const [open, setOpen] = useState(false);

  const { data: contacts = [], isLoading, isError } = useQuery({
    queryKey: ['flat-contacts', visitor.flat_number, visitor.id],
    queryFn: () => wgate.flats.contacts(visitor.flat_number),
    enabled: open,
    staleTime: 60_000,
    retry: false,
  });

  const message =
    `Hello, ${visitor.visitor_name}${visitor.purpose ? ` (${visitor.purpose})` : ''} is waiting at the gate ` +
    `for Flat ${visitor.flat_number}. Please approve or reject in the WGate app.`;

  return (
    <div className="space-y-2">
      <Button size="sm" variant="outline" className="w-full" onClick={() => setOpen((o) => !o)}>
        <Phone className="w-4 h-4 mr-1" /> Contact resident
        {open ? <ChevronUp className="w-4 h-4 ml-auto" /> : <ChevronDown className="w-4 h-4 ml-auto" />}
      </Button>

      {open && (
        <div className="rounded-xl border border-border divide-y divide-border">
          {isLoading && <p className="text-xs text-muted-foreground p-3">Loading numbers...</p>}
          {isError && <p className="text-xs text-destructive p-3">This visitor is no longer waiting, or the numbers could not be loaded.</p>}
          {!isLoading && !isError && contacts.length === 0 && (
            <p className="text-xs text-muted-foreground p-3">
              No phone number is saved for Flat {visitor.flat_number}. Ask the admin to add it in Members.
            </p>
          )}
          {contacts.map((c, i) => {
            const digits = String(c.phone || '').replace(/\D/g, '');
            // A 10-digit number is treated as an Indian mobile number for WhatsApp.
            const whatsappNumber = digits.length === 10 ? `91${digits}` : digits;
            return (
              <div key={`${digits}-${i}`} className="flex items-center gap-2 p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{c.name || 'Resident'}</p>
                  <p className="text-xs text-muted-foreground">{ROLE_LABELS[c.role] || c.role} · {c.phone}</p>
                </div>
                <Button asChild size="sm" variant="outline">
                  <a href={`tel:${digits}`} aria-label={`Call ${c.name || 'resident'}`}><Phone className="w-4 h-4" /></a>
                </Button>
                <Button asChild size="sm" variant="outline" className="border-emerald-200 text-emerald-700 hover:bg-emerald-50">
                  <a href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer"
                    aria-label={`WhatsApp ${c.name || 'resident'}`}>
                    <MessageCircle className="w-4 h-4" />
                  </a>
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}