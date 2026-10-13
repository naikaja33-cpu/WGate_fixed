import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Shield, ArrowLeft, CheckCircle2 } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { wgate } from '@/api/wgateClient';

const initialForm = {
  society_name: '',
  city: '',
  address: '',
  total_flats: '',
  full_name: '',
  email: '',
  phone: '',
  password: '',
};

export default function Signup() {
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null); // { society } once signed up

  const setField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.society_name.trim()) return setError('Society name is required');
    if (!form.email.trim()) return setError('Email is required');
    if (!form.password || form.password.length < 6) return setError('Password must be at least 6 characters');

    setIsSubmitting(true);
    try {
      const result = await wgate.auth.signup({
        society_name: form.society_name.trim(),
        city: form.city.trim(),
        address: form.address.trim(),
        total_flats: form.total_flats ? Number(form.total_flats) : null,
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        password: form.password,
      });
      setSubmitted(result);
    } catch (err) {
      setError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <AuthLayout icon={Shield} title="WGATE" subtitle="Signup received">
        <div className="text-center space-y-4">
          <CheckCircle2 className="w-12 h-12 text-primary mx-auto" />
          <p className="text-sm text-foreground">
            Thanks! <span className="font-medium">{submitted.society?.name}</span> has been created.
          </p>
          <p className="text-sm text-muted-foreground">
            {submitted.message || 'A super admin will review and approve your society before you can sign in. You\u2019ll get your 14-day trial as soon as it\u2019s approved.'}
          </p>
          <Link to="/" className="inline-block">
            <Button className="w-full mt-2">Back to Sign In</Button>
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout icon={Shield} title="WGATE" subtitle="Set up your society">
      <Link
        to="/"
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to sign in
      </Link>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Society</p>
          <div className="space-y-1.5">
            <Label htmlFor="signup-society-name">Society Name *</Label>
            <Input id="signup-society-name" value={form.society_name} onChange={setField('society_name')} required autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="signup-city">City</Label>
              <Input id="signup-city" value={form.city} onChange={setField('city')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="signup-flats">Total Flats</Label>
              <Input id="signup-flats" type="number" min="0" value={form.total_flats} onChange={setField('total_flats')} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="signup-address">Address</Label>
            <Input id="signup-address" value={form.address} onChange={setField('address')} />
          </div>
        </div>

        <div className="space-y-3 pt-2 border-t border-border">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide pt-3">Your admin account</p>
          <div className="space-y-1.5">
            <Label htmlFor="signup-name">Full Name</Label>
            <Input id="signup-name" value={form.full_name} onChange={setField('full_name')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="signup-email">Email *</Label>
            <Input id="signup-email" type="email" autoComplete="username" value={form.email} onChange={setField('email')} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="signup-phone">Phone</Label>
            <Input id="signup-phone" value={form.phone} onChange={setField('phone')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="signup-password">Password *</Label>
            <Input
              id="signup-password"
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={setField('password')}
              required
              minLength={6}
            />
          </div>
        </div>

        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

        <p className="text-xs text-muted-foreground">
          Your society starts on a 14-day trial, which begins once a super admin approves your signup. You won&apos;t be able to sign in until then.
        </p>

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Submitting...' : 'Create Society'}
        </Button>
      </form>
    </AuthLayout>
  );
}