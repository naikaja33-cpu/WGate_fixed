import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { wgate } from '@/api/wgateClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

const PLANS = [
  { id: 'starter', name: 'Starter', blurb: 'For smaller societies getting started.' },
  { id: 'pro', name: 'Pro', blurb: 'For larger societies that need everything.' },
];

export default function Signup() {
  const navigate = useNavigate();
  const [societyName, setSocietyName] = useState('');
  const [city, setCity] = useState('');
  const [totalFlats, setTotalFlats] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPhone, setAdminPhone] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [plan, setPlan] = useState('starter');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!societyName.trim()) return setError('Society name is required');
    if (!adminName.trim()) return setError('Your name is required');
    if (!adminEmail.trim()) return setError('Email is required');
    if (!adminPhone.trim() || adminPhone.length !== 10) return setError('Phone number must be exactly 10 digits');
    if (!adminPassword || adminPassword.length < 6) return setError('Password must be at least 6 characters');

    setIsLoading(true);
    try {
      await wgate.auth.signup({
        societyName: societyName.trim(),
        city: city.trim(),
        totalFlats: totalFlats ? Number(totalFlats) : undefined,
        adminName: adminName.trim(),
        adminEmail: adminEmail.trim(),
        adminPhone,
        adminPassword,
        plan,
      });
      // Token is now stored (wgate.auth.signup sets it like login does).
      // Reloading lets the app's normal auth bootstrap pick up the session.
      window.location.href = import.meta.env.BASE_URL;
    } catch (err) {
      setError(err?.message || 'Something went wrong');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md bg-card rounded-2xl p-6 space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Start your free trial</h1>
          <p className="text-sm text-muted-foreground">14 days, no card required.</p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Society Name</Label>
          <Input placeholder="e.g. Green Valley Residency" value={societyName} onChange={e => setSocietyName(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">City</Label>
            <Input placeholder="e.g. Bengaluru" value={city} onChange={e => setCity(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Total Flats</Label>
            <Input type="number" placeholder="e.g. 120" value={totalFlats} onChange={e => setTotalFlats(e.target.value)} />
          </div>
        </div>

        <hr className="border-border" />

        <div className="space-y-1.5">
          <Label className="text-xs">Your Name</Label>
          <Input placeholder="e.g. Rahul Sharma" value={adminName} onChange={e => setAdminName(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Your Email</Label>
          <Input type="email" placeholder="you@email.com" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Contact Number</Label>
          <Input
            type="tel"
            inputMode="numeric"
            placeholder="e.g. 9876543210"
            value={adminPhone}
            onChange={e => setAdminPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
            maxLength={10}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Password</Label>
          <Input type="password" placeholder="At least 6 characters" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Plan</Label>
          <RadioGroup value={plan} onValueChange={setPlan} className="space-y-2">
            {PLANS.map(p => (
              <label key={p.id} className="flex items-start gap-2 border rounded-xl p-3 cursor-pointer">
                <RadioGroupItem value={p.id} className="mt-0.5" />
                <span>
                  <span className="block text-sm font-medium">{p.name}</span>
                  <span className="block text-xs text-muted-foreground">{p.blurb}</span>
                </span>
              </label>
            ))}
          </RadioGroup>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? 'Creating your account...' : 'Start free trial'}
        </Button>

        <p className="text-xs text-center text-muted-foreground">
          Already have an account? <Link to="/login" className="underline">Log in</Link>
        </p>
      </form>
    </div>
  );
}