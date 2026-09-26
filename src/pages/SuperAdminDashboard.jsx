import { useState, useEffect } from 'react';
import { ShieldCheck, Plus, Building2, Copy, Check, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';

export default function SuperAdminDashboard() {
  const { logout } = useAuth();
  const [societies, setSocieties] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [showAddSociety, setShowAddSociety] = useState(false);
  const [showAddAdmin, setShowAddAdmin] = useState(null); // society id, or null
  const [createdCredentials, setCreatedCredentials] = useState(null); // { email, password }

  const loadSocieties = async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const list = await base44.superadmin.listSocieties();
      setSocieties(list);
    } catch (err) {
      setLoadError(err?.message || 'Failed to load societies');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSocieties();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <h1 className="font-semibold">Super Admin</h1>
          </div>
          <Button variant="ghost" size="sm" onClick={() => logout()}>
            <LogOut className="w-4 h-4 mr-1.5" />
            Sign out
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Societies</h2>
          <Button size="sm" onClick={() => setShowAddSociety(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            Add Society
          </Button>
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
        {loadError && <p className="text-sm text-destructive">{loadError}</p>}

        {!isLoading && !loadError && societies.length === 0 && (
          <p className="text-sm text-muted-foreground">No societies yet. Add one to get started.</p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {societies.map((society) => (
            <Card key={society.id}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-muted-foreground" />
                  {society.name}
                </CardTitle>
                {society.city && <p className="text-xs text-muted-foreground">{society.city}</p>}
              </CardHeader>
              <CardContent className="space-y-3">
                {society.admins.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No admins yet</p>
                ) : (
                  <ul className="space-y-1">
                    {society.admins.map((a) => (
                      <li key={a.id} className="text-sm">
                        <span className="font-medium">{a.full_name}</span>
                        <span className="text-muted-foreground"> — {a.email}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setShowAddAdmin(society.id)}
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Add Admin
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>

      {showAddSociety && (
        <AddSocietyModal
          onClose={() => setShowAddSociety(false)}
          onCreated={() => {
            setShowAddSociety(false);
            loadSocieties();
          }}
        />
      )}

      {showAddAdmin && (
        <AddAdminModal
          societyId={showAddAdmin}
          onClose={() => setShowAddAdmin(null)}
          onCreated={(creds) => {
            setShowAddAdmin(null);
            setCreatedCredentials(creds);
            loadSocieties();
          }}
        />
      )}

      {createdCredentials && (
        <CredentialsModal
          credentials={createdCredentials}
          onClose={() => setCreatedCredentials(null)}
        />
      )}
    </div>
  );
}

function AddSocietyModal({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [totalFlats, setTotalFlats] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('Society name is required'); return; }
    setIsSubmitting(true);
    try {
      await base44.superadmin.createSociety({
        name: name.trim(),
        city: city.trim(),
        address: address.trim(),
        total_flats: totalFlats ? Number(totalFlats) : null,
      });
      onCreated();
    } catch (err) {
      setError(err?.message || 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
      <div className="bg-card w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl p-6 space-y-4">
        <h2 className="text-lg font-semibold">Add Society</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>City</Label>
            <Input value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Address</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Total Flats</Label>
            <Input type="number" min="0" value={totalFlats} onChange={(e) => setTotalFlats(e.target.value)} />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="flex-1" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddAdminModal({ societyId, onClose, onCreated }) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) { setError('Email is required'); return; }
    setIsSubmitting(true);
    try {
      const created = await base44.superadmin.createAdmin({
        email: email.trim(),
        full_name: fullName.trim() || undefined,
        phone: phone.trim() || undefined,
        society_id: societyId,
      });
      onCreated({ email: created.email, password: created.initial_password });
    } catch (err) {
      setError(err?.message || 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
      <div className="bg-card w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl p-6 space-y-4">
        <h2 className="text-lg font-semibold">Add Admin</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Full Name</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Email *</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="flex-1" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Admin'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CredentialsModal({ credentials, onClose }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`Email: ${credentials.email}\nPassword: ${credentials.password}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — credentials are still shown on screen.
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
      <div className="bg-card w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl p-6 space-y-4">
        <h2 className="text-lg font-semibold">Admin Created</h2>
        <p className="text-sm text-muted-foreground">
          Share these login details with them directly — there's no automatic invite email in this setup.
        </p>
        <div className="bg-muted rounded-xl p-3 space-y-1 text-sm">
          <p><span className="text-muted-foreground">Email:</span> <span className="font-medium">{credentials.email}</span></p>
          <p><span className="text-muted-foreground">Temporary password:</span> <span className="font-medium">{credentials.password}</span></p>
        </div>
        <p className="text-xs text-muted-foreground">They'll be required to change this password on first login.</p>
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
