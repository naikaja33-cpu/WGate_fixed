import { useState } from 'react';
import { X, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function PasswordResetModal({ result, memberName, onClose }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`Email: ${result.email}\nPassword: ${result.password}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — the details are still shown on screen.
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
      <div className="bg-card w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Password Reset</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>

        <p className="text-sm text-muted-foreground">
          A new temporary password was set for {memberName}. They were signed out of all devices
          and must choose a new password the next time they sign in.
        </p>

        {result.email_sent ? (
          <p className="text-sm text-emerald-700">
            The new login details were emailed to {result.email}. They are shown below too, in case the email doesn't arrive.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {result.email_error
              ? `The email could not be sent (${result.email_error}). Share these login details with them directly.`
              : 'Share these login details with them directly.'}
          </p>
        )}

        <div className="bg-muted rounded-xl p-3 space-y-1 text-sm">
          <p><span className="text-muted-foreground">Email:</span> <span className="font-medium">{result.email}</span></p>
          <p><span className="text-muted-foreground">Temporary password:</span> <span className="font-medium">{result.password}</span></p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={handleCopy}>
            {copied ? <Check className="w-4 h-4 mr-1.5" /> : <Copy className="w-4 h-4 mr-1.5" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button className="flex-1" onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  );
}