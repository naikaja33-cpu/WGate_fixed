import { useState, useEffect } from 'react';
import { Shield, ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import AuthLayout from '@/components/AuthLayout';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/AuthContext';
import { wgate } from '@/api/wgateClient';

// The society this phone or browser signed in to last time, so the member does not have to enter the code again.
const SAVED_KEY = 'wgate_society';
const readSavedSociety = () => {
  try {
    const s = JSON.parse(localStorage.getItem(SAVED_KEY) || 'null');
    return s?.id && s?.name ? s : null;
  } catch {
    return null;
  }
};
const saveSociety = (s) => {
  try { localStorage.setItem(SAVED_KEY, JSON.stringify({ id: s.id, name: s.name, city: s.city || '' })); } catch { /* ignore */ }
};
const forgetSociety = () => {
  try { localStorage.removeItem(SAVED_KEY); } catch { /* ignore */ }
};

export default function Login() {
  const { login } = useAuth();
  const { code: codeFromLink } = useParams(); // set when the page is opened from a /s/<code> link

  const [saved] = useState(readSavedSociety);
  const [step, setStep] = useState(saved && !codeFromLink ? 'credentials' : 'society'); // 'society' | 'credentials' | 'forgot'
  const [selectedSociety, setSelectedSociety] = useState(saved);

  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [codeLoading, setCodeLoading] = useState(!!codeFromLink);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [forgotMessage, setForgotMessage] = useState('');
  const [forgotError, setForgotError] = useState('');

  const chooseSociety = (society) => {
    saveSociety(society);
    setSelectedSociety(society);
    setStep('credentials');
  };

  // Opened from the society's own link: look the society up by the code in the link.
  useEffect(() => {
    if (!codeFromLink) return undefined;
    let cancelled = false;
    setCodeLoading(true);
    setCodeError('');
    wgate.publicApi.societies.byCode(codeFromLink)
      .then((society) => { if (!cancelled) chooseSociety(society); })
      .catch((err) => { if (!cancelled) setCodeError(err?.message || 'Could not check the code. Please try again.'); })
      .finally(() => { if (!cancelled) setCodeLoading(false); });
    return () => { cancelled = true; };
  }, [codeFromLink]);

  const handleCodeSubmit = async (e) => {
    e.preventDefault();
    setCodeError('');
    const clean = code.replace(/[^a-zA-Z0-9]/g, '');
    if (clean.length < 6) {
      setCodeError('Enter the society code your admin gave you.');
      return;
    }
    setCodeLoading(true);
    try {
      chooseSociety(await wgate.publicApi.societies.byCode(clean));
    } catch (err) {
      setCodeError(err?.message || 'Could not check the code. Please try again.');
    } finally {
      setCodeLoading(false);
    }
  };

  const goBack = () => {
    forgetSociety();
    setSelectedSociety(null);
    setCode('');
    setCodeError('');
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
        subtitle="Enter your society code to sign in"
      >
        <form onSubmit={handleCodeSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="society-code">Society code</Label>
            <Input
              id="society-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. GV7K-9QXM"
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
              maxLength={14}
              className="font-mono tracking-wider"
              autoFocus={!codeFromLink}
            />
            <p className="text-xs text-muted-foreground">
              Ask your society admin for the code, or open the sign-in link they shared.
            </p>
          </div>

          {codeError && <p className="text-sm text-destructive" role="alert">{codeError}</p>}

          <Button type="submit" className="w-full" disabled={codeLoading}>
            {codeLoading ? 'Checking...' : 'Continue'}
          </Button>

          <p className="text-center text-sm text-muted-foreground pt-2">
            New society?{' '}
            <Link to="/signup" className="text-primary font-medium hover:underline">
              Sign up
            </Link>
          </p>
          <p className="text-center text-sm text-muted-foreground">
            <Link to="/home" className="text-primary font-medium hover:underline">
              Back to Home
            </Link>
          </p>
        </form>
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
        Not your society? Change
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