import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Shield, Home } from 'lucide-react';

export default function Onboarding({ onComplete }) {
  const { user } = useAuth();
  const [societyId, setSocietyId] = useState('');
  const [flatNumber, setFlatNumber] = useState('');

  const { data: societies = [], isLoading } = useQuery({
    queryKey: ['societies'],
    queryFn: () => base44.entities.Society.list('name', 100),
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const selected = societies.find(s => s.id === societyId);
      return base44.auth.updateMe({
        society_id: societyId,
        society_name: selected?.name || '',
        flat_number: flatNumber,
      });
    },
    onSuccess: onComplete,
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!societyId || !flatNumber) return;
    saveMutation.mutate();
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mx-auto">
            <Shield className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Welcome to MySociety</h1>
          <p className="text-sm text-muted-foreground">Select your society and flat to get started</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Your Society</Label>
            {isLoading ? (
              <div className="h-9 bg-muted rounded-md animate-pulse" />
            ) : societies.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-2">No societies registered yet. Contact your admin.</p>
            ) : (
              <Select value={societyId} onValueChange={setSocietyId} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select your society..." />
                </SelectTrigger>
                <SelectContent>
                  {societies.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}{s.city ? ` — ${s.city}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <Home className="w-3 h-3" /> Flat Number
            </Label>
            <Input
              placeholder="e.g. A-101"
              value={flatNumber}
              onChange={e => setFlatNumber(e.target.value)}
              required
            />
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={!societyId || !flatNumber || saveMutation.isPending}
          >
            {saveMutation.isPending ? 'Saving...' : 'Continue →'}
          </Button>
        </form>
      </div>
    </div>
  );
}
