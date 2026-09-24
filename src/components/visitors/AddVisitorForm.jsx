import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { X, ChevronsUpDown, Check } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { cn } from '@/lib/utils';

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
  const [flatPopoverOpen, setFlatPopoverOpen] = useState(false);
  const [flatSearch, setFlatSearch] = useState('');
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
        // If this fails, the guard can still type the flat number manually below.
      });
    return () => { cancelled = true; };
  }, []);

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
              <Popover open={flatPopoverOpen} onOpenChange={setFlatPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={flatPopoverOpen}
                    className="w-full justify-between font-normal"
                  >
                    <span className={cn(!form.flat_number && 'text-muted-foreground')}>
                      {form.flat_number || 'Select flat'}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
                  <Command>
                    <CommandInput
                      placeholder="Search or type flat..."
                      value={flatSearch}
                      onValueChange={setFlatSearch}
                    />
                    <CommandList>
                      <CommandEmpty>
                        {flatSearch.trim() && (
                          <button
                            type="button"
                            className="w-full px-2 py-1.5 text-sm text-left hover:bg-accent rounded-sm"
                            onClick={() => {
                              update('flat_number', flatSearch.trim());
                              setFlatPopoverOpen(false);
                            }}
                          >
                            Use "{flatSearch.trim()}"
                          </button>
                        )}
                      </CommandEmpty>
                      <CommandGroup>
                        {knownFlats.map((flat) => (
                          <CommandItem
                            key={flat}
                            value={flat}
                            onSelect={(val) => {
                              update('flat_number', val);
                              setFlatSearch('');
                              setFlatPopoverOpen(false);
                            }}
                          >
                            <Check className={cn('mr-2 h-4 w-4', form.flat_number === flat ? 'opacity-100' : 'opacity-0')} />
                            {flat}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
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