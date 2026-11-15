import { Link } from 'react-router-dom';
import InfoShell from '@/components/InfoShell';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

const FAQS = [
  ['What is WGate?', 'WGate is an app for housing societies. It handles visitor entry at the gate, notices, service requests, amenity bookings, maintenance billing and a community board.'],
  ['Who can use it?', 'Society admins, owners, tenants, family members and security guards. Each role sees only what it needs.'],
  ['How does my society join?', 'Tap "Enroll your society" on the home page and fill in the short form. The society admin then gets a society code to share with residents.'],
  ['How do I sign in as a resident?', 'Open the app, enter your society code, then your email and password. Your admin approves new members.'],
  ['How do visitor approvals work?', 'The guard enters the visitor at the gate and the resident gets an alert on the phone. The resident approves or rejects, and can also pre-approve expected guests.'],
  ['Will I get alerts when the app is closed?', 'Yes. Allow notifications when the app asks, and visitor and emergency alerts arrive as push notifications.'],
  ['How do I pay maintenance?', 'Open Billing, choose the bill and pay through UPI. Your admin confirms the payment, and you can download a PDF receipt.'],
  ['I forgot my password. What now?', 'Ask your society admin to reset it for you. You will be asked to choose a new password the next time you sign in.'],
  ['Is my data safe?', 'Each society\'s data is stored separately, passwords are stored in scrambled form, and only people with the right role can see a record. Read the Privacy Policy for details.'],
  ['Is WGate free?', 'There is a free trial for your society. Contact us to know about plans after the trial.'],
  ['Is there an iPhone app?', 'Not yet. The Android app can be downloaded from the home page, and the website works in any phone browser.'],
];

export default function FAQ() {
  return (
    <InfoShell title="Frequently Asked Questions" intro="Quick answers to common questions.">
      <Accordion type="single" collapsible className="w-full">
        {FAQS.map(([q, a], i) => (
          <AccordionItem key={q} value={`q${i}`}>
            <AccordionTrigger className="text-left">{q}</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">{a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      <p className="mt-8 text-sm text-muted-foreground">
        Still stuck? <Link to="/contact" className="text-primary underline">Contact us</Link> or use the WhatsApp button.
      </p>
    </InfoShell>
  );
}