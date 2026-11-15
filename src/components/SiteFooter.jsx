import { Link } from 'react-router-dom';
import { SITE } from '@/lib/siteInfo';

const LINKS = [
  { to: '/about', label: 'About Us' },
  { to: '/contact', label: 'Contact Us' },
  { to: '/faq', label: 'FAQ' },
  { to: '/privacy', label: 'Privacy Policy' },
];

export default function SiteFooter() {
  return (
    <footer className="border-t border-border bg-muted/30 px-6 py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 text-center sm:flex-row sm:justify-between sm:text-left">
        <div>
          <p className="font-bold text-foreground">{SITE.name}</p>
          <p className="text-xs text-muted-foreground">{SITE.tagline}</p>
        </div>
        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm">
          {LINKS.map((l) => (
            <Link key={l.to} to={l.to} className="text-muted-foreground hover:text-foreground hover:underline">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
      <p className="mt-5 text-center text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} {SITE.name}. All rights reserved.
      </p>
    </footer>
  );
}