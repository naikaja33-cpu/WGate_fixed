import { useState, useEffect } from 'react';
import { Shield, ChevronRight, ArrowLeft, ShieldCheck } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';

export default function Login() {
  const { login } = useAuth();

  const [step, setStep] = useState('society'); // 'society' | 'credentials'
  const [societies, setSocieties] = useState([]);
  const [societiesLoading, setSocietiesLoading] = useState(true);
  const [societiesError, setSocietiesError] = useState('');
  const [selectedSociety, setSelectedSociety] = useState(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    base44.publicApi.societies.list()
      .then((list) => {
        if (cancelled) return;
        setSocieties([...list].sort((a, b) => a.name.localeCompare(b.name)));
      })
      .catch(() => {
        if (!cancelled) setSocietiesError('Could not load societies. Please refresh and try again.');
      })
      .finally(() => !cancelled && setSocietiesLoading(false));
    return () => { cancelled = true; };
  }, []);

  const chooseSociety = (society) => {
    setSelectedSociety(society);
    setIsSuperAdmin(false);
    setStep('credentials');
  };

  const chooseSuperAdmin = () => {
    setSelectedSociety(null);
    setIsSuperAdmin(true);
    setStep('credentials');
  };

  const goBack = () => {
    setStep('society');
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      await login(email.trim(), password, isSuperAdmin ? undefined : selectedSociety?.id);
    } catch (err) {
      setError(err?.message || 'Invalid email or password');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (step === 'society') {
    return (
      <AuthLayout
        icon={Shield}
        title="WGATE"
        subtitle="Select your society to sign in"
      >
        <div className="space-y-3">
          {societiesLoading && (
            <p className="text-sm text-muted-foreground text-center py-4">Loading societies...</p>
          )}

          {societiesError && (
            <p className="text-sm text-destructive text-center py-2">{societiesError}</p>
          )}

          {!societiesLoading && !societiesError && societies.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No societies have been set up yet. Contact your super admin.
            </p>
          )}

          {!societiesLoading && societies.map((society) => (
            <button
              key={society.id}
              type="button"
              onClick={() => chooseSociety(society)}
              className="w-full flex items-center justify-between p-4 rounded-xl border border-border hover:bg-accent hover:border-accent-foreground/20 transition-colors text-left"
            >
              <div>
                <p className="font-medium">{society.name}</p>
                {society.city && <p className="text-sm text-muted-foreground">{society.city}</p>}
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
            </button>
          ))}

          <div className="pt-4 border-t border-border mt-4">
            <button
              type="button"
              onClick={chooseSuperAdmin}
              className="w-full flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground py-2"
            >
              <ShieldCheck className="w-4 h-4" />
              Super Admin Login
            </button>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      icon={isSuperAdmin ? ShieldCheck : Shield}
      title={isSuperAdmin ? 'Super Admin' : 'WGATE'}
      subtitle={isSuperAdmin ? 'Sign in to manage societies' : selectedSociety?.name}
    >
      <button
        type="button"
        onClick={goBack}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        {isSuperAdmin ? 'Choose a society instead' : 'Change society'}
      </button>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="login-email">Email</Label>
          <Input
            id="login-email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="login-password">Password</Label>
          <Input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error && (
          <p className="text-sm text-destructive" role="alert">{error}</p>
        )}

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in...' : 'Sign In'}
        </Button>
      </form>
    </AuthLayout>
  );
}
