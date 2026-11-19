import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Trash2, ArrowLeft, Loader2 } from 'lucide-react';
import { wgate } from '@/api/wgateClient';
import { SITE } from '@/lib/siteInfo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

// Public page (no sign-in needed). Google Play asks for a web link where people can request deletion.
export default function DeleteAccount() {
  const navigate = useNavigate();
  const goBack = () => (window.history.length > 1 ? navigate(-1) : navigate('/'));
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError('Enter the email address you use for WGate');
      return;
    }
    setBusy(true);
    try {
      await wgate.publicApi.requestDeletion({ email: email.trim(), society_code: code.trim(), note: note.trim() });
      setSent(true);
    } catch (err) {
      setError(err?.message || 'Could not send your request. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <button type="button" onClick={goBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <Trash2 className="w-5 h-5 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Delete your WGate account</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          You can delete your {SITE.name} account and the personal data tied to it. Choose the way that suits you.
        </p>

        <div className="space-y-6">
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">Option 1: delete it in the app (instant)</h2>
            <ol className="list-decimal pl-5 space-y-1.5 text-sm text-muted-foreground">
              <li>Open WGate and sign in.</li>
              <li>Go to <span className="font-medium text-foreground">Profile</span>.</li>
              <li>Tap <span className="font-medium text-foreground">Delete my account</span>, enter your password and confirm.</li>
            </ol>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">Option 2: ask us to delete it</h2>
            <p className="text-sm text-muted-foreground">
              Use this if you cannot sign in or have removed the app. We check that the request is genuine, then delete the account within 30 days.
            </p>
            {sent ? (
              <div className="rounded-xl border border-border bg-card p-4 text-sm text-foreground">
                Thank you. We have received your request and will contact you at <span className="font-medium">{email}</span> if we need anything else. The account will be deleted within 30 days.
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="del-email">Email address you use for WGate *</Label>
                  <Input id="del-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="del-code">Society code (optional)</Label>
                  <Input id="del-code" placeholder="XXXX-XXXX" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={20} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="del-note">Anything we should know (optional)</Label>
                  <Textarea id="del-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" disabled={busy} className="w-full">
                  {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Send deletion request
                </Button>
              </form>
            )}
            <p className="text-xs text-muted-foreground">
              Or email us at <a className="text-primary underline" href={`mailto:${SITE.privacyEmail}`}>{SITE.privacyEmail}</a> from the address you use for WGate.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">What is deleted</h2>
            <ul className="list-disc pl-5 space-y-1.5 text-sm text-muted-foreground">
              <li>Your account: name, email, phone number, flat number and password.</li>
              <li>Your sign-in sessions and your phone&apos;s notification token.</li>
              <li>Posts you made on the community board.</li>
              <li>If you are an owner or tenant, the family members you added.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">What is kept, and for how long</h2>
            <p className="text-sm text-muted-foreground">
              Some records belong to your society&apos;s own books and gate log, so they stay with the society for a limited time and are then deleted automatically: visitor records for 365 days, resolved and closed service tickets for 365 days, gate passes and pre-approvals for 90 days, and amenity bookings for 180 days. Maintenance bills stay as long as the society needs them for its accounts and legal reasons. Backups kept by our database provider may hold deleted data for up to 30 days.
            </p>
            <p className="text-sm text-muted-foreground">
              An admin who is the only admin of a society must first make another member an admin. To close a whole society, the admin should write to us.
            </p>
          </section>
        </div>

        <p className="text-xs text-muted-foreground mt-10 text-center">
          <Link to="/" className="underline">WGate</Link> · <Link to="/privacy" className="underline">Privacy Policy</Link> · <Link to="/terms" className="underline">Terms of Use</Link>
        </p>
      </div>
    </div>
  );
}