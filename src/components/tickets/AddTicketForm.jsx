import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { X } from 'lucide-react';

export default function AddTicketForm({ onSubmit, onClose, isSubmitting, userFlat, userEmail }) {
  const [form, setForm] = useState({
    title: '',
    description: '',
    category: 'plumber',
    priority: 'medium',
    flat_number: userFlat || '',
    resident_email: userEmail || '',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({ ...form, status: 'open' });
  };

  const update = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
      <div className="bg-card w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom duration-300">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">New Service Request</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Title *</Label>
            <Input placeholder="e.g. Leaking tap in kitchen" value={form.title} onChange={e => update('title', e.target.value)} required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Category *</Label>
              <Select value={form.category} onValueChange={v => update('category', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="plumber">🔧 Plumber</SelectItem>
                  <SelectItem value="electrician">⚡ Electrician</SelectItem>
                  <SelectItem value="carpenter">🪚 Carpenter</SelectItem>
                  <SelectItem value="cleaning">🧹 Cleaning</SelectItem>
                  <SelectItem value="pest_control">🐛 Pest Control</SelectItem>
                  <SelectItem value="security">🔒 Security</SelectItem>
                  <SelectItem value="other">📋 Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={v => update('priority', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Flat Number *</Label>
            <Input placeholder="e.g. A-101" value={form.flat_number} onChange={e => update('flat_number', e.target.value)} required />
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea placeholder="Describe the issue in detail..." value={form.description} onChange={e => update('description', e.target.value)} rows={3} />
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Submitting...' : 'Submit Request'}
          </Button>
        </form>
      </div>
    </div>
  );
}
