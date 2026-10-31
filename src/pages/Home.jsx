import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield,Download ,Smartphone, Apple} from 'lucide-react';
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
            <Button variant="outline" className="bg-emerald-600  text-white">
                Society Login</Button>
          </Link>
          
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-16 grid md:grid-cols-2 gap-12 items-center">
        <div>
          <h1 className="text-4xl md:text-5xl font-bold text-foreground leading-tight">
            Simplified Gate Management — For Society
          </h1>
          

          <form onSubmit={handleEnroll} className="mt-8 bg-card border border-border rounded-2xl p-5 space-y-3 max-w-md">
            <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
            <Input
              type="tel"
              placeholder="Phone number"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              required
            />
            <Select value={reason} onValueChange={setReason} required>
              <SelectTrigger>
                <SelectValue placeholder="Select Reason" />
              </SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" className="w-full">Enroll your society For Free Trail →</Button>
          </form>
           
          <p className="text-muted-foreground mt-4 text-lg">
            
            {/* **NO UNNECESSARY ADVERTISEMENTS** — just a clean, simple, and fast interface for your society's gate management. */}
          </p>
        </div>

        <div className="hidden md:flex items-center justify-center">
          <div className="w-full aspect-square max-w-sm rounded-3xl bg-primary/5 flex items-center justify-center">
            <Shield className="w-32 h-32 text-primary/30" />
          </div>
        </div>
      </main>
            <section className="max-w-3xl mx-auto px-6 pb-16 text-center">
        <h2 className="text-lg font-semibold text-foreground">Download WGate</h2>
        <p className="text-muted-foreground mt-1">Your Society Management App for a Convenient Life</p>
        <div className="flex items-center justify-center gap-3 mt-5">
          <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground cursor-not-allowed">
            <Apple className="w-4 h-4" /> iPhone <span className="text-xs">(coming soon)</span>
          </span>
          <a href={`${import.meta.env.BASE_URL}wgate.apk`} download>
            <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-accent transition-colors cursor-pointer">
              <Smartphone className="w-4 h-4" /> Android
            </span>
          </a>
          
        </div>
        <p className="text-xs text-muted-foreground mt-2">
            
                **Not on the Play Store yet — your phone will ask to allow installs from this source the first time.
        </p>
      </section>
    </div>
  );
}