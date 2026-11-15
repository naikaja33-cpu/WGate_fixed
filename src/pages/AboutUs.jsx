import { Link } from 'react-router-dom';
import { ShieldCheck, Bell, Receipt, Users } from 'lucide-react';
import InfoShell from '@/components/InfoShell';

const POINTS = [
  { icon: ShieldCheck, title: 'Safer gates', text: 'Guards log every visitor, and residents approve or reject them from their phone before they come in.' },
  { icon: Bell, title: 'Everyone informed', text: 'Notices, emergency alerts and push notifications reach residents the moment they are sent.' },
  { icon: Receipt, title: 'Simple billing', text: 'Maintenance bills, UPI payments, receipts and reminders, without chasing people on paper.' },
  { icon: Users, title: 'One community', text: 'Service requests, amenity bookings and a community board in one clean app.' },
];

export default function AboutUs() {
  return (
    <InfoShell title="About Us" intro="WGate helps housing societies run their gate, their dues and their community from one simple app.">
      <div className="space-y-4 text-foreground/90 leading-relaxed">
        <p>
          Running a society usually means paper registers at the gate, notices on a wall and bills in a spreadsheet.
          WGate puts all of that on the phones your residents, guards and committee already carry.
        </p>
        <p>
          We built WGate to be fast, clean and free of unnecessary advertisements. Each society's information is kept
          separate from every other society's, and only the people who need to see something can see it.
        </p>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {POINTS.map(({ icon: Icon, title, text }) => (
          <div key={title} className="rounded-2xl border border-border bg-card p-5">
            <Icon className="h-6 w-6 text-primary" />
            <h2 className="mt-3 font-semibold text-foreground">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{text}</p>
          </div>
        ))}
      </div>
      <p className="mt-8 text-sm text-muted-foreground">
        Questions? Visit <Link to="/contact" className="text-primary underline">Contact Us</Link> or read the{' '}
        <Link to="/faq" className="text-primary underline">FAQ</Link>.
      </p>
    </InfoShell>
  );
}