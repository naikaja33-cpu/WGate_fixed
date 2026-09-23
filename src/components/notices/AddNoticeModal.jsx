import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function AddNoticeModal({ onSubmit, onClose, isSubmitting }) {
  const [form, setForm] = useState({ title: '', content: '', type: 'announcement', event_date: '', is_pinned: false });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
      <div className="bg-card w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Post a Notice</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Title</Label>
            <Input placeholder="Notice title..." value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })} required />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Type</Label>
            <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="announcement">📢 Announcement</SelectItem>
                <SelectItem value="rule">📖 Society Rule</SelectItem>
                <SelectItem value="event">📅 Event</SelectItem>
                <SelectItem value="maintenance">🔧 Maintenance</SelectItem>
                <SelectItem value="other">📋 Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Content</Label>
            <Textarea placeholder="Write the notice details..." value={form.content}
              onChange={e => setForm({ ...form, content: e.target.value })}
              className="h-28 resize-none" required />
          </div>

          {form.type === 'event' && (
            <div className="space-y-1.5">
              <Label className="text-xs">Event Date</Label>
              <Input type="date" value={form.event_date}
                onChange={e => setForm({ ...form, event_date: e.target.value })} />
            </div>
          )}

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_pinned}
              onChange={e => setForm({ ...form, is_pinned: e.target.checked })}
              className="rounded" />
            <span className="text-sm text-muted-foreground">Pin this notice to the top</span>
          </label>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Posting...' : 'Post Notice'}
          </Button>
        </form>
      </div>
    </div>
  );
}
