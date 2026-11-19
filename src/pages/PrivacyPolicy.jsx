import { Link, useNavigate } from 'react-router-dom';
import { Shield, ArrowLeft } from 'lucide-react';
import { SITE } from '@/lib/siteInfo';

// The business details come from src/lib/siteInfo.js. Edit them there.
const CONTACT = {
  business: SITE.legalName,
  officer: `Grievance Officer: ${SITE.grievanceOfficer}`,
  email: SITE.privacyEmail,
  address: SITE.fullAddress,
};
const UPDATED = '19 November 2026';

const SECTIONS = [
  {
    title: '1. Who we are, and who decides what',
    body: [
      `WGate ("we", "us") is an app that helps housing societies run their gate, visitors, notices, service requests, amenity bookings, maintenance billing and community board. It is run by ${CONTACT.business}.`,
      'This policy follows India\'s Digital Personal Data Protection Act, 2023 (DPDP Act) and its Rules, and also meets the main requirements of the EU and UK GDPR.',
      'Two parties are involved. Your housing society (through its admin or committee) decides why information about its residents and visitors is collected and how it is used. WGate stores and processes that information for the society and keeps it secure. For sign-up details, platform security and running the service, WGate decides. Where this policy says "we", it means WGate acting in that role.',
    ],
  },
  {
    title: '2. What information we collect',
    list: [
      'Society details: society name, state, address and number of flats.',
      'Account details: your name, email address, phone number, flat number and role (admin, owner, tenant, family member or security guard). Passwords are stored only in scrambled (hashed) form. We cannot see your password.',
      'Family members you add: name, relationship, phone number and email.',
      'Visitors and deliveries: the visitor\'s name, phone number, purpose of visit, vehicle number, flat visited, check-in and check-out times, and a small photo if security takes one. This is entered by security or by you. Also gate passes and pre-approvals you create, and the QR codes made from them.',
      'Society activity: service requests, notices, amenity bookings and the messages and details you enter in them.',
      'Billing: your flat size, maintenance bills, payment status, and the UPI transaction ID you give us when you report a payment.',
      'Community board posts: the text, price, phone number and up to two photos you choose to post.',
      'Technical information: a sign-in token, the devices you are signed in on (up to three at a time), a notification token for your phone, your IP address (used for security and to stop misuse), and basic server logs.',
    ],
    after: 'The app asks for the camera only to take a visitor photo or to scan a gate pass QR code. A scanned QR code is read on your phone and no picture of it is saved. The app asks for notification permission to alert you about visitors and society news. We do not collect your location, contacts, call history, messages, microphone or bank, card or UPI PIN details. We do not use advertising or tracking tools.',
  },
  {
    title: '3. Why we use it',
    list: [
      'To create your account and let you sign in to your society.',
      'To manage the gate: tell you when a visitor or delivery is waiting and record your approval or rejection, and to check gate pass codes.',
      'To run society features: notices, tickets, bookings, billing and the community board.',
      'To send you messages about your account and dues, such as an invitation, an approval or a payment reminder by email.',
      'To send push notifications to your phone, such as a visitor waiting at the gate.',
      'To let you send an emergency alert to your society\'s security and admin. The alert includes your name, flat number and phone number.',
      'To keep the service secure, prevent misuse and fix faults.',
      'To meet legal obligations.',
    ],
    after: 'We use your information only for these purposes. We do not sell it, rent it, or use it for advertising.',
  },
  {
    title: '4. Our basis for using your information',
    body: [
      'Under the DPDP Act we rely on your consent, which you give when you sign up or when your society admin creates your account and you accept it. We also rely on the "legitimate uses" the Act allows, such as a service you asked for, and meeting legal duties. You can withdraw your consent at any time (see section 9). Withdrawing does not affect what was done before, but we may then be unable to provide the service to you.',
      'Under the GDPR our bases are: performing the service you or your society asked for, our legitimate interest in keeping the service secure, your consent where we ask for it, and legal obligations.',
    ],
  },
  {
    title: '5. Who can see your information inside your society',
    list: [
      'Society admin: can see members, visitors, service requests, bookings, bills and payment reports for the society.',
      'Security guards: can see visitor and gate information. When a visitor is waiting for your flat, security can see the phone number of your flat\'s residents so they can call or WhatsApp you.',
      'You (owner or tenant): see your own flat\'s bills and details, and your family members.',
      'Family members: see the gate features and notices, not your bills.',
      'Neighbours: see the notices and community posts you publish, with your name, flat number and the phone number you enter on the post. Do not put anything in a post you do not want your neighbours to see.',
    ],
    after: 'Each society\'s information is kept separate from every other society\'s. People in one society cannot see another society\'s information.',
  },
  {
    title: '6. Who else we share it with',
    body: ['We use trusted service providers to run WGate. They may process your information only for us, and only to provide their service:'],
    list: [
      'Database and server hosting providers: store your information and run the WGate server.',
      'A push notification service from Google: delivers notifications to your phone. It receives your phone\'s notification token and the text of the notification.',
      'An email service from Google: sends emails such as invitations, approvals and reminders.',
      'A website hosting provider: hosts the WGate website and app screens. It does not store your account information.',
    ],
    after: 'The Call and WhatsApp buttons in the app open your own phone or WhatsApp. Messages sent that way are covered by WhatsApp\'s own terms. We may also share information when the law requires it, for example by a court or government order, and to protect people\'s safety. We do not sell your information.',
  },
  {
    title: '7. Where it is stored',
    body: [
      'Our service providers\' servers may be located outside India. We choose providers that protect information to recognised security standards, and we do not transfer information to any country the Government of India has restricted. If you are in the EU or UK, we rely on the safeguards our providers offer for transfers, such as standard contractual clauses.',
    ],
  },
  {
    title: '8. How long we keep it',
    list: [
      'Account details: as long as your account is active. If you delete your account, it is removed straight away (see section 10).',
      'Visitor records: 365 days, then they are deleted automatically.',
      'Gate passes and pre-approvals: 90 days. Amenity bookings: 180 days.',
      'Service tickets: resolved and closed tickets are deleted after 365 days.',
      'Billing records: as long as the society needs them for its accounts and legal reasons.',
      'If a society leaves WGate, we delete that society\'s information within 30 days of its request.',
      'Backups: deleted information may remain in our providers\' backups for a short time (up to 30 days) before it is overwritten.',
    ],
  },
  {
    title: '9. Your rights',
    body: ['You have the right to:'],
    list: [
      'Know what information we hold about you and how it is used, and get a summary of it.',
      'Correct wrong or out-of-date information. You can fix most of it yourself on your Profile page, or ask your admin.',
      'Ask us to delete your information (see section 10).',
      'Withdraw your consent at any time.',
      'Make a complaint and get a reply (see section 14).',
      'Nominate another person to exercise your rights if you die or cannot do so yourself (India).',
      'If you are in the EU or UK: also ask us to restrict how we use your information, to give you a copy in a common format (portability), and to object to certain uses.',
    ],
    after: 'To use any of these rights, write to the Grievance Officer in section 14. We will reply within 30 days. If you are not satisfied, you may complain to the Data Protection Board of India, or if you are in the EU or UK, to your local data protection authority.',
  },
  {
    title: '10. Deleting your account and your data',
    body: [
      'You can delete your account yourself in the app: open Profile, choose "Delete my account" and enter your password. It takes effect straight away.',
      'If you cannot sign in, or you have removed the app, you can ask for deletion on our Delete Account page. We check that the request is genuine and finish it within 30 days.',
    ],
    list: [
      'What is deleted: your account (name, email, phone, flat number, password), your sign-in sessions and notification tokens, and the posts you made on the community board. If you are an owner or tenant, the family members you added are deleted with you.',
      'What stays: records that belong to the society\'s own books and gate log, such as maintenance bills, visitor records, tickets and bookings that mention your name or flat. They are kept only for the periods in section 8 and are then deleted.',
      'An admin cannot delete their account while they are the only admin of a society. Make another member an admin first.',
    ],
    link: { to: '/delete-account', label: 'Go to the Delete Account page' },
  },
  {
    title: '11. Children',
    body: [
      'WGate is not meant for people under 18 to use on their own, and we do not track children or show them advertising. An owner or tenant may add a family member under 18 only as their parent or legal guardian, and by doing so confirms that they give consent for that child. A parent or guardian can ask us to correct or delete a child\'s information at any time.',
    ],
  },
  {
    title: '12. Security',
    body: [
      'We protect your information with HTTPS (encrypted connections), hashed passwords, role-based access so people only see what their role needs, a separate data space for each society, and limits on repeated sign-in attempts. No system is perfectly secure, so please keep your password private and sign out on shared devices.',
      'If a data breach affects you, we will tell you and the Data Protection Board of India as the law requires.',
    ],
  },
  {
    title: '13. Payments, and information on your device',
    body: [
      'WGate does not process payments. When you pay a bill, you pay through your own UPI app (such as GPay or PhonePe) to your society\'s UPI ID. We never see your UPI PIN or bank details. We store only the transaction ID you enter to report the payment, and whether the admin confirmed it.',
      'WGate keeps a sign-in token on your device so you stay signed in. We do not use advertising or analytics cookies. You can clear this by signing out or clearing the app or browser data.',
    ],
  },
  {
    title: '14. Contact, grievance officer and changes',
    body: ['For any question, request or complaint about your information, contact:'],
    contact: true,
    after: 'Changes: we may update this policy. When we make an important change, we will tell you in the app. The date at the top shows when it was last updated.',
  },
];

export default function PrivacyPolicy() {
  const navigate = useNavigate();
  const goBack = () => (window.history.length > 1 ? navigate(-1) : navigate('/'));

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <button type="button" onClick={goBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <Shield className="w-5 h-5 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Privacy Policy</h1>
        </div>
        <p className="text-xs text-muted-foreground mb-6">Last updated: {UPDATED}</p>

        <p className="text-sm text-foreground mb-6">
          This policy explains what information WGate collects, why, who can see it, and the choices you have. We have written it in plain language. Please read it before you use the app.
        </p>

        <div className="space-y-6">
          {SECTIONS.map((s) => (
            <section key={s.title} className="space-y-2">
              <h2 className="text-base font-semibold text-foreground">{s.title}</h2>
              {s.body?.map((p, i) => (
                <p key={i} className="text-sm text-muted-foreground leading-relaxed">{p}</p>
              ))}
              {s.list && (
                <ul className="list-disc pl-5 space-y-1.5">
                  {s.list.map((item, i) => (
                    <li key={i} className="text-sm text-muted-foreground leading-relaxed">{item}</li>
                  ))}
                </ul>
              )}
              {s.contact && (
                <div className="rounded-xl border border-border bg-card p-3 text-sm text-foreground space-y-0.5">
                  <p className="font-medium">{CONTACT.officer}</p>
                  <p>{CONTACT.business}</p>
                  <p>{CONTACT.address}</p>
                  <p>Email: <a className="text-primary underline" href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a></p>
                </div>
              )}
              {s.link && (
                <p className="text-sm">
                  <Link to={s.link.to} className="text-primary underline">{s.link.label}</Link>
                </p>
              )}
              {s.after && <p className="text-sm text-muted-foreground leading-relaxed">{s.after}</p>}
            </section>
          ))}
        </div>

        <p className="text-xs text-muted-foreground mt-10 text-center">
          <Link to="/" className="underline">WGate</Link> · Privacy Policy · <Link to="/terms" className="underline">Terms of Use</Link>
        </p>
      </div>
    </div>
  );
}