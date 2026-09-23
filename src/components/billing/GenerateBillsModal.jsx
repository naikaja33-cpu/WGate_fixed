import { useState } from 'react';
import { X, Plus, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { format, addDays } from 'date-fns';

const DEFAULT_LINE_ITEMS = [
  { label: 'Maintenance Charge', amount: 2000 },
  { label: 'Water Charge', amount: 300 },
  { label: 'Sinking Fund', amount: 200 },
];

const FLATS = ['A-101','A-102','A-103','B-201','B-202','B-203','C-301','C-302','C-303'];

export default function GenerateBillsModal({ onGenerate, onClose, isGenerating }) {
  const now = new Date();
  const defaultMonth = format(now, 'yyyy-MM');
  const defaultLabel = format(now, 'MMMM yyyy');
  const defaultDue = format(addDays(now, 15), 'yyyy-MM-dd');

  const [month, setMonth] = useState(defaultMonth);
  const [monthLabel, setMonthLabel] = useState(defaultLabel);
  const [dueDate, setDueDate] = useState(defaultDue);
  const [lineItems, setLineItems] = useState(DEFAULT_LINE_ITEMS);
  const [selectedFlats, setSelectedFlats] = useState(FLATS);

  const total = lineItems.reduce((s, i) => s + (Number(i.amount) || 0), 0);

  const updateItem = (idx, key, val) => {
    setLineItems(prev => prev.map((item, i) => i === idx ? { ...item, [key]: val } : item));
  };
  const addItem = () => setLineItems(prev => [...prev, { label: '', amount: 0 }]);
  const removeItem = (idx) => setLineItems(prev => prev.filter((_, i) => i !== idx));

  const toggleFlat = (flat) => {
    setSelectedFlats(prev => prev.includes(flat) ? prev.filter(f => f !== flat) : [...prev, flat]);
  };

  const handleGenerate = () => {
    onGenerate({ month, monthLabel, dueDate, lineItems, selectedFlats, total });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
      <div className="bg-card w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Generate Monthly Bills</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Month</Label>
            <Input type="month" value={month} onChange={e => {
              setMonth(e.target.value);
              if (e.target.value) {
                const d = new Date(e.target.value + '-01');
                setMonthLabel(format(d, 'MMMM yyyy'));
              }
            }} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Due Date</Label>
            <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Charge Breakdown</Label>
            <button onClick={addItem} className="text-xs text-primary flex items-center gap-1">
              <Plus className="w-3 h-3" /> Add Item
            </button>
          </div>
          <div className="space-y-2">
            {lineItems.map((item, idx) => (
              <div key={idx} className="flex gap-2 items-center">
                <Input className="flex-1 h-8 text-sm" placeholder="Label" value={item.label}
                  onChange={e => updateItem(idx, 'label', e.target.value)} />
                <Input className="w-24 h-8 text-sm" type="number" placeholder="₹" value={item.amount}
                  onChange={e => updateItem(idx, 'amount', e.target.value)} />
                <button onClick={() => removeItem(idx)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex justify-end text-sm font-semibold text-foreground pt-1">
            Total: ₹{total.toLocaleString()}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Select Flats ({selectedFlats.length} selected)</Label>
          <div className="flex flex-wrap gap-2">
            {FLATS.map(flat => (
              <button key={flat} onClick={() => toggleFlat(flat)}
                className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                  selectedFlats.includes(flat)
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-muted-foreground hover:border-primary'
                }`}>
                {flat}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setSelectedFlats(FLATS)} className="text-xs text-primary">Select All</button>
            <span className="text-muted-foreground text-xs">·</span>
            <button onClick={() => setSelectedFlats([])} className="text-xs text-muted-foreground">Clear</button>
          </div>
        </div>

        <Button onClick={handleGenerate} disabled={isGenerating || selectedFlats.length === 0} className="w-full">
          {isGenerating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</> : `Generate ${selectedFlats.length} Bills`}
        </Button>
      </div>
    </div>
  );
}
