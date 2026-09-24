import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { X } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const OTHER_FLAT = '__other__';

export default function AddVisitorForm({ onSubmit, onClose, isSubmitting }) {
  const [form, setForm] = useState({
    visitor_name: '',
    visitor_phone: '',
    purpose: 'guest',
    flat_number: '',
    vehicle_number: '',
    notes: '',
  });
  const [knownFlats, setKnownFlats] = useState([]);
  const [flatMode, setFlatMode] = useState(''); // '' (nothing picked yet), a real flat, or OTHER_FLAT
  const [customFlat, setCustomFlat] = useState('');
  const [flatError, setFlatError] = useState('');

  useEffect(() => {
    let cancelled = false;
    base44.flats.list()
      .then((flats) => {
        if (cancelled) return;
        const sorted = [...flats].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        setKnownFlats(sorted);
      })
      .catch(() => {
        // If this fails, Other (type manually) still works below.
      });
    return () => { cancelled = true; };
  }, []);

  const handleFlatSelect = (value) => {
    setFlatMode(value);
    if (value === OTHER_FLAT) {
      update('flat_number', customFlat);
    } else {
      update('flat_number', value);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.flat_number.trim()) {
      setFlatError('Please select or enter a flat number');
      return;
    }
    setFlatError('');
    onSubmit({
      ...form,
      check_in_time: new Date().toISOString(),
      status: 'pending',
    });
  };

  const update = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
      <div className="bg-card w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom duration-300">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">New Visitor</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Visitor Name *</Label>
            <Input placeholder="Full name" value={form.visitor_name} onChange={e => update('visitor_name', e.target.value)} required />
          </div>

          <div className="space-y-2">
            <Label>Phone</Label>
            <Input placeholder="Phone number" value={form.visitor_phone} onChange={e => update('visitor_phone', e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Flat Number *</Label>
              <Select value={flatMode} onValueChange={handleFlatSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Select flat" />
                </SelectTrigger>
                <SelectContent className="z-[100]">
                  {knownFlats.map((flat) => (
                    <SelectItem key={flat} value={flat}>{flat}</SelectItem>
                  ))}
                  <SelectItem value={OTHER_FLAT}>Other (type manually)</SelectItem>
                </SelectContent>
              </Select>
              {flatMode === OTHER_FLAT && (
                <Input
                  placeholder="e.g. A-101"
                  value={customFlat}
                  onChange={(e) => {
                    setCustomFlat(e.target.value);
                    update('flat_number', e.target.value);
                  }}
                  className="mt-2"
                  autoFocus
                />
              )}
              {flatError && <p className="text-xs text-destructive">{flatError}</p>}
            </div>
            <div className="space-y-2">
              <Label>Purpose *</Label>
              <Select value={form.purpose} onValueChange={v => update('purpose', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="guest">Guest</SelectItem>
                  <SelectItem value="delivery">Delivery</SelectItem>
                  <SelectItem value="cab">Cab</SelectItem>
                  <SelectItem value="service">Service</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Vehicle Number</Label>
            <Input placeholder="Optional" value={form.vehicle_number} onChange={e => update('vehicle_number', e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea placeholder="Any additional notes..." value={form.notes} onChange={e => update('notes', e.target.value)} rows={2} />
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Adding...' : 'Check In Visitor'}
          </Button>
        </form>
      </div>
    </div>
  );
}