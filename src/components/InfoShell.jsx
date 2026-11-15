import { Link, useNavigate } from 'react-router-dom';
import { Shield, ArrowLeft } from 'lucide-react';
import SiteFooter from '@/components/SiteFooter';
import WhatsAppChat from '@/components/WhatsAppChat';
import { useAuth } from '@/lib/AuthContext';

// Shared frame for the About, Contact and FAQ pages.
export default function InfoShell({ title, intro, children }) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const goBack = () => (window.history.length > 1 ? navigate(-1) : navigate(isAuthenticated ? '/Dashboard' : '/'));
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between border-b border-border px-6 py-4">
        <Link to={isAuthenticated ? '/Dashboard' : '/'} className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Shield className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold text-foreground">WGate</span>
        </Link>
        <button onClick={goBack} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <h1 className="text-3xl font-bold text-foreground">{title}</h1>
        {intro && <p className="mt-2 text-muted-foreground">{intro}</p>}
        <div className="mt-8">{children}</div>
      </main>
      <SiteFooter />
      <WhatsAppChat />
    </div>
  );
}