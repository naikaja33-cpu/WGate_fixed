// ---- EDIT THESE before you publish ----
export const SITE = {
  name: 'WGate',
  tagline: 'Simplified gate and society management',
  whatsapp: '918073939280',          // country code + number, digits only, e.g. 919876543210
  whatsappMessage: 'Hi WGate, I would like to know more about WGate for our society.',
  email: 'support@your-domain.com',  // a mailbox you read
  phone: '+91 8073939280',          // shown on the Contact page
  hours: 'Mon to Sun, 10 AM to 7 PM IST',
  address: 'Bangalore, Karnataka, India',
  // Used on the Privacy Policy, Terms and Delete Account pages. Replace these before you publish.
  // legalName: 'YOUR NAME OR COMPANY NAME',
  // grievanceOfficer: 'YOUR NAME',
  // privacyEmail: 'privacy@your-domain.com', // a mailbox you read
  // fullAddress: 'Your full address, Bangalore, Karnataka, PIN, India',
};
// ---------------------------------------

export const whatsappLink = (text) =>
  `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(text || SITE.whatsappMessage)}`;