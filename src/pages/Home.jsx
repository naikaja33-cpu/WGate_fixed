import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';

const REASONS = ['New Society', 'Switching from another provider', 'Just exploring'];

export default function Home() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [reason, setReason] = useState('');

  const handleEnroll = (e) => {
    e.preventDefault();
    // Hands off to the real signup form, pre-filled with what they typed here.
    navigate('/signup', { state: { full_name: name, phone, reason } });
  };

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Shield className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-bold text-lg text-foreground">WGate</span>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/login">
            <Button variant="outline">Society Login</Button>
          </Link>
          <Link to="/signup">
            <Button>Trail Enroll-Society</Button>
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-16 grid md:grid-cols-2 gap-12 items-center">
        <div>
          <h1 className="text-4xl md:text-5xl font-bold text-foreground leading-tight">
            Simplified Gate Management — For Society
          </h1>
          <p className="text-muted-foreground mt-4 text-lg">
        
            **NO UNNECESSART CLUMSY ADVERTISEMENTS** — just a clean, simple, and fast interface for your society's gate management.
          </p>

          <form onSubmit={handleEnroll} className="mt-8 bg-card border border-border rounded-2xl p-5 space-y-3 max-w-md">
            <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
            <Input
              type="tel"
              placeholder="Phone number"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 15))}
              required
            />
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue placeholder="Select Reason" />
              </SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" className="w-full">Enroll your society →</Button>
          </form>
        </div>

        <div className="hidden md:flex items-center justify-center">
          <div className="w-full aspect-square max-w-sm rounded-3xl bg-primary/5 flex items-center justify-center">
            <Shield className="w-32 h-32 text-primary/30" />
          </div>
        </div>
      </main>
    </div>
  );
}