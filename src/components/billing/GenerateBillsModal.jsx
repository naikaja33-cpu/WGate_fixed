import { useEffect, useMemo, useState } from 'react';
import { X, Plus, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { format, addDays } from 'date-fns';
import { wgate } from '@/api/wgateClient';
import { buildBillRows, formatMoney, formatSqft } from '@/lib/billing';

/**
 * Generate monthly bills: each flat pays  area (sq ft) x rate per sq ft  (+ optional fixed charges).
 *  - areas:         { 'A-101': 1200, ... }
 *  - existingBills: bills already created, so a flat is never billed twice for the same month
 *  - defaultRate:   the rate used last time (pre-filled)
 */
export default function GenerateBillsModal({ onGenerate, onClose, isGenerating, areas, existingBills, defaultRate, defaultLateFine }) {
  const now = new Date();
  const [month, setMonth] = useState(format(now, 'yyyy-MM'));
  const [monthLabel, setMonthLabel] = useState(format(now, 'MMMM yyyy'));
  const [dueDate, setDueDate] = useState(format(addDays(now, 15), 'yyyy-MM-dd'));
    const [rate, setRate] = useState(defaultRate ? String(defaultRate) : '');
  const [lateFine, setLateFine] = useState(defaultLateFine ? String(defaultLateFine) : '');
  const [extraItems, setExtraItems] = useState([]); // optional fixed charges, e.g. Water, Sinking Fund

  const [flats, setFlats] = useState([]);
  const [flatsLoading, setFlatsLoading] = useState(true);
  const [flatsError, setFlatsError] = useState('');
  const [excluded, setExcluded] = useState(() => new Set()); // flats the admin unticked

  useEffect(() => {
    let cancelled = false;
    wgate.flats.list()
      .then((list) => {
        if (cancelled) return;
        setFlats([...list].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })));
      })
      .catch(() => {
        if (!cancelled) setFlatsError('Could not load flats. Please close this window and try again.');
      })
      .finally(() => {
        if (!cancelled) setFlatsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const rows = useMemo(
    () => buildBillRows({ flats, areas, rate, extraItems, existingBills, month, excluded }),
    [flats, areas, rate, extraItems, existingBills, month, excluded]
  );
  const selectedRows = rows.filter((r) => r.selected);
  const grandTotal = selectedRows.reduce((sum, r) => sum + r.total, 0);
  const noSizeCount = rows.filter((r) => r.reason === 'no_size').length;
  const billedCount = rows.filter((r) => r.reason === 'already_billed').length;
  const hasRate = Number(rate) > 0;

  const updateItem = (idx, key, val) =>
    setExtraItems((prev) => prev.map((item, i) => (i === idx ? { ...item, [key]: val } : item)));
  const addItem = () => setExtraItems((prev) => [...prev, { label: '', amount: '' }]);
  const removeItem = (idx) => setExtraItems((prev) => prev.filter((_, i) => i !== idx));

  const toggleFlat = (flat) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(flat)) next.delete(flat);
      else next.add(flat);
      return next;
    });
  };

  const handleGenerate = () => {
        onGenerate({
      month, monthLabel, dueDate, rate: Number(rate), rows: selectedRows,
      lateFine: Math.max(0, Math.round(Number(lateFine) || 0)),
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
      <div className="bg-card w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Generate Monthly Bills</h2>
          <button onClick={onClose} aria-label="Close"><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Month</Label>
            <Input type="month" value={month} onChange={(e) => {
              setMonth(e.target.value);
              if (e.target.value) setMonthLabel(format(new Date(e.target.value + '-01'), 'MMMM yyyy'));
            }} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Due Date</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Maintenance rate (₹ per sq ft, per month)</Label>
          <Input type="number" inputMode="decimal" min="0" step="0.01" placeholder="e.g. 3.50"
            value={rate} onChange={(e) => setRate(e.target.value)} />
                    <p className="text-xs text-muted-foreground">Each flat's bill = its size in sq ft × this rate.</p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Late fine (₹, one-time, optional)</Label>
          <Input type="number" inputMode="numeric" min="0" step="1" placeholder="e.g. 100 (leave empty for no fine)"
            value={lateFine} onChange={(e) => setLateFine(e.target.value)} />
          <p className="text-xs text-muted-foreground">
            Added once if the bill is paid after the due date. You can waive it when marking a bill as paid.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Other fixed charges (optional, same for every flat)</Label>
            <button onClick={addItem} className="text-xs text-primary flex items-center gap-1">
              <Plus className="w-3 h-3" /> Add charge
            </button>
          </div>
          {extraItems.map((item, idx) => (
            <div key={idx} className="flex gap-2 items-center">
              <Input className="flex-1 h-8 text-sm" placeholder="e.g. Water charge" value={item.label}
                onChange={(e) => updateItem(idx, 'label', e.target.value)} />
              <Input className="w-24 h-8 text-sm" type="number" placeholder="₹" value={item.amount}
                onChange={(e) => updateItem(idx, 'amount', e.target.value)} />
              <button onClick={() => removeItem(idx)} className="text-muted-foreground hover:text-destructive" aria-label="Remove charge">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Flats ({selectedRows.length} selected)</Label>

          {flatsLoading && <p className="text-xs text-muted-foreground py-2">Loading flats...</p>}
          {flatsError && <p className="text-xs text-destructive py-2">{flatsError}</p>}
          {!flatsLoading && !flatsError && flats.length === 0 && (
            <p className="text-xs text-muted-foreground py-2">
              No flats found. Add tenants or owners with a flat number in Members first.
            </p>
          )}
          {noSizeCount > 0 && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {noSizeCount} flat{noSizeCount === 1 ? ' has' : 's have'} no size yet and will not be billed.
              Close this window and use <strong>Flat Sizes</strong> to add {noSizeCount === 1 ? 'it' : 'them'}.
            </p>
          )}
          {billedCount > 0 && (
            <p className="text-xs text-muted-foreground">
              {billedCount} flat{billedCount === 1 ? ' is' : 's are'} already billed for {monthLabel} and left out.
            </p>
          )}

          {rows.length > 0 && (
            <div className="max-h-56 overflow-y-auto border border-border rounded-xl divide-y divide-border">
              {rows.map((r) => (
                <label key={r.flat} className={`flex items-center gap-3 px-3 py-2 text-sm ${r.reason ? 'opacity-60' : ''}`}>
                  <input type="checkbox" checked={r.selected} disabled={!!r.reason || !hasRate}
                    onChange={() => toggleFlat(r.flat)} />
                  <span className="flex-1 font-medium">{r.flat}</span>
                  <span className="text-xs text-muted-foreground w-24 text-right">
                    {r.area > 0 ? `${formatSqft(r.area)} sq ft` : 'No size'}
                  </span>
                  <span className="w-24 text-right">
                    {r.reason === 'no_size' ? 'Set size' : r.reason === 'already_billed' ? 'Billed' : hasRate ? `₹${formatMoney(r.total)}` : '—'}
                  </span>
                </label>
              ))}
            </div>
          )}

          <div className="flex justify-end text-sm font-semibold text-foreground pt-1">
            {selectedRows.length} bills · Total ₹{formatMoney(grandTotal)}
          </div>
        </div>

        <Button onClick={handleGenerate}
          disabled={isGenerating || flatsLoading || selectedRows.length === 0 || !hasRate} className="w-full">
          {isGenerating
            ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</>
            : `Generate ${selectedRows.length} Bills`}
        </Button>
      </div>
    </div>
  );
}