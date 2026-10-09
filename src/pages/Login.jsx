import { useState, useEffect } from 'react';
import { Shield, ChevronRight, ArrowLeft } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/AuthContext';
import { wgate } from '@/api/wgateClient';

export default function Login() {
  const { login } = useAuth();

  const [step, setStep] = useState('society'); // 'society' | 'credentials' | 'forgot'
  const [societies, setSocieties] = useState([]);
  const [societiesLoading, setSocietiesLoading] = useState(true);
  const [societiesError, setSocietiesError] = useState('');
  const [selectedSociety, setSelectedSociety] = useState(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [forgotMessage, setForgotMessage] = useState('');
  const [forgotError, setForgotError] = useState('');

  useEffect(() => {
    let cancelled = false;
    wgate.publicApi.societies.list()
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
      await login(email.trim(), password, selectedSociety?.id);
    } catch (err) {
      setError(err?.message || 'Invalid email or password');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openForgotPassword = () => {
    setForgotEmail(email);
    setForgotMessage('');
    setForgotError('');
    setStep('forgot');
  };

  const backToCredentials = () => {
    setStep('credentials');
    setForgotMessage('');
    setForgotError('');
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    setForgotError('');
    setForgotSubmitting(true);
    try {
      const result = await wgate.auth.forgotPassword(forgotEmail.trim(), selectedSociety?.id);
      setForgotMessage(result?.message || 'If that email exists in this society, your admin has been notified.');
    } catch (err) {
      setForgotError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setForgotSubmitting(false);
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
        </div>
      </AuthLayout>
    );
  }

  if (step === 'forgot') {
    return (
      <AuthLayout
        icon={Shield}
        title="WGATE"
        subtitle={selectedSociety?.name}
      >
        <button
          type="button"
          onClick={backToCredentials}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to sign in
        </button>

        {forgotMessage ? (
          <div className="space-y-4">
            <p className="text-sm text-foreground">{forgotMessage}</p>
            <p className="text-sm text-muted-foreground">
              Your society admin will reach out with a new temporary password.
            </p>
            <Button type="button" className="w-full" onClick={backToCredentials}>
              Back to sign in
            </Button>
          </div>
        ) : (
          <form onSubmit={handleForgotSubmit} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enter your account email. Your society admin will be notified to reset your password.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="forgot-email">Email</Label>
              <Input
                id="forgot-email"
                type="email"
                autoComplete="username"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                required
                autoFocus
              />
            </div>

            {forgotError && (
              <p className="text-sm text-destructive" role="alert">{forgotError}</p>
            )}

            <Button type="submit" className="w-full" disabled={forgotSubmitting}>
              {forgotSubmitting ? 'Sending...' : 'Send Request'}
            </Button>
          </form>
        )}
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      icon={Shield}
      title="WGATE"
      subtitle={selectedSociety?.name}
    >
      <button
        type="button"
        onClick={goBack}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Change society
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

        <div className="flex justify-end">
          <button
            type="button"
            onClick={openForgotPassword}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Forgot password?
          </button>
        </div>

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in...' : 'Sign In'}
        </Button>
      </form>
    </AuthLayout>
  );
}