import { Link, useNavigate } from 'react-router-dom';
import { FileText, ArrowLeft } from 'lucide-react';
import { SITE } from '@/lib/siteInfo';

const UPDATED = '19 November 2026';

const SECTIONS = [
  {
    title: '1. About these terms',
    body: [
      `These terms are between you and ${SITE.legalName} ("we", "us"), who run WGate, an app that helps housing societies manage their gate, visitors, notices, service requests, bookings, maintenance billing and community board. By creating an account or using WGate you agree to these terms and to our Privacy Policy. If you do not agree, please do not use WGate.`,
    ],
  },
  {
    title: '2. Who can use WGate',
    list: [
      'You must be 18 or older to create an account. A parent or guardian may add a family member under 18 under their own account.',
      'You must belong to a society that has registered with WGate, as an admin, owner, tenant, family member or security guard.',
      'A society is registered by its admin. The admin confirms that they are allowed to act for the society.',
    ],
  },
  {
    title: '3. Your account',
    list: [
      'Give correct information and keep it up to date.',
      'Keep your password private. You are responsible for what is done with your account. Tell us at once if you think someone else has used it.',
      'Do not share your account. Each person should have their own, and family members can be added from the Profile page.',
      'An account can be signed in on up to three devices at a time. Signing in on a fourth device signs out the oldest one.',
    ],
  },
  {
    title: '4. Society admins',
    body: [
      'A society admin decides who joins the society, what is shared with whom, and how the society uses WGate. The admin is responsible for the accuracy of the society\'s records, including bills, notices and visitor entries, and for using residents\' and visitors\' information only for running the society.',
    ],
  },
  {
    title: '5. Visitors and security guards',
    body: [
      'Security guards enter visitor details and photos only to keep the society safe. Do not use visitor information for anything else, and do not share it outside the society. Residents should tell their guests that their details may be recorded at the gate.',
    ],
  },
  {
    title: '6. How you may use WGate',
    body: ['You agree not to:'],
    list: [
      'break any law, or post anything unlawful, abusive, threatening, false or misleading;',
      'post another person\'s private information without their permission;',
      'use the community board for anything other than genuine rent, sale, household item or society posts;',
      'try to get into another society\'s information, or into accounts that are not yours;',
      'try to break, overload, copy or reverse-engineer WGate, or send it viruses or automated requests;',
      'send emergency alerts when there is no emergency.',
    ],
    after: 'We may remove content, or block an account, that breaks these terms or puts others at risk.',
  },
  {
    title: '7. Plans and access',
    body: [
      'A society may start on a free trial, after which the society\'s plan decides whether it keeps access. When a plan ends, access for the society\'s members may be paused until the plan is renewed. Plans, prices and renewals are agreed between the society and us, outside the app.',
    ],
  },
  {
    title: '8. Maintenance bills and payments',
    body: [
      'WGate shows bills and records payments that a society\'s admin sets up. WGate does not collect or hold money. You pay your society directly, for example through your own UPI app. A payment is confirmed by the society\'s admin, and any dispute about an amount is between you and your society.',
    ],
  },
  {
    title: '9. Your content',
    body: [
      'You keep ownership of what you post (notices, tickets, community posts, photos). You allow us to store and show it to the people it is meant for in your society so the app can work. Make sure you have the right to post it.',
    ],
  },
  {
    title: '10. Our service',
    body: [
      'We work to keep WGate running and your information safe, but we cannot promise that it will always be available or free of errors. WGate is not an emergency service. Do not depend on it alone for your safety. In an emergency, call the police (100 or 112), fire (101) or an ambulance (108) as well. Push notifications and emails depend on your phone, your network and other companies, and may be delayed or fail.',
      'We may change or improve WGate, or stop a feature, from time to time.',
    ],
  },
  {
    title: '11. Ending your use',
    body: [
      'You can stop using WGate at any time and delete your account from the Profile page (see the Privacy Policy for what is deleted and what is kept). We may suspend or end an account that breaks these terms. A society that leaves WGate can ask us to delete its information.',
    ],
  },
  {
    title: '12. Limits on our responsibility',
    body: [
      'WGate is provided "as is". As far as the law allows, we are not responsible for losses that come from the use of WGate, including a visitor admitted or refused, a delayed notification, a mistake in a bill, a payment dispute inside a society, or content posted by other members. Our total responsibility to you for any claim is limited to the amount you paid us for WGate in the last 12 months, or Rs 1,000 if you paid nothing. Nothing in these terms limits a right you have by law that cannot be limited.',
    ],
  },
  {
    title: '13. Changes to these terms',
    body: [
      'We may update these terms. When we make an important change, we will tell you in the app. If you keep using WGate after a change, you accept the new terms. The date at the top shows when they were last updated.',
    ],
  },
  {
    title: '14. Law and contact',
    body: [
      'These terms are governed by the laws of India. Courts in Bangalore, Karnataka have the right to decide disputes, unless the law gives you the right to go to another court.',
      `Questions about these terms: ${SITE.privacyEmail}.`,
    ],
  },
];

export default function Terms() {
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
            <FileText className="w-5 h-5 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Terms of Use</h1>
        </div>
        <p className="text-xs text-muted-foreground mb-6">Last updated: {UPDATED}</p>

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
              {s.after && <p className="text-sm text-muted-foreground leading-relaxed">{s.after}</p>}
            </section>
          ))}
        </div>

        <p className="text-xs text-muted-foreground mt-10 text-center">
          <Link to="/" className="underline">WGate</Link> · <Link to="/privacy" className="underline">Privacy Policy</Link> · Terms of Use
        </p>
      </div>
    </div>
  );
}