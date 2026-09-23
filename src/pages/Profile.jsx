import { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { User, Phone, Home, Mail, Shield, LogOut } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';

export default function Profile() {
  const { user,logout, refreshUser } = useAuth();
  const [flat, setFlat] = useState(user?.flat_number || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [saved, setSaved] = useState(false);

  const saveMutation = useMutation({
    mutationFn: (data) => base44.auth.updateMe(data),
    onSuccess: () => {
      setSaved(true);
      if (refreshUser) refreshUser();
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const handleSave = () => {
    saveMutation.mutate({ flat_number: flat, phone });
  };

  return (
    <div className="p-4 space-y-4 max-w-md mx-auto">
      <h1 className="text-xl font-bold text-foreground">Profile</h1>

      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <User className="w-7 h-7 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">{user?.full_name || 'User'}</CardTitle>
              <p className="text-sm text-muted-foreground capitalize flex items-center gap-1">
                <Shield className="w-3 h-3" /> {user?.role || 'resident'}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Mail className="w-3 h-3" /> Email
            </Label>
            <Input value={user?.email || ''} disabled className="bg-muted" />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Home className="w-3 h-3" /> Flat Number
            </Label>
            <Input placeholder="e.g. A-101" value={flat} onChange={e => setFlat(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Phone className="w-3 h-3" /> Phone
            </Label>
            <Input placeholder="Phone number" value={phone} onChange={e => setPhone(e.target.value)} />
          </div>

          <Button onClick={handleSave} className="w-full" disabled={saveMutation.isPending}>
            {saved ? '✓ Saved' : saveMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </CardContent>
      </Card>

      <Button
        variant="outline"
        className="w-full text-destructive border-destructive/20 hover:bg-destructive/5"
        onClick={() => logout()}
      >
        <LogOut className="w-4 h-4 mr-2" /> Sign Out
      </Button>
    </div>
  );
}
