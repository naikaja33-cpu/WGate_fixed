import { useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { wgate } from '@/api/wgateClient';

/**
 * Admin screen: set the built-up area (sq ft) of every flat.
 * Bills are calculated from these sizes. Props:
 *  - areaRecords: the saved FlatArea records
 *  - onSaved():   called after a successful save
 */
export default function FlatSizesModal({ areaRecords, onClose, onSaved }) {
  // Saved sizes as they were when the window opened (so typing is never overwritten by a refresh).
  const [saved] = useState(() => Object.fromEntries(areaRecords.map((r) => [r.flat_number, r])));
  const [flats, setFlats] = useState([]);
  const [values, setValues] = useState({}); // flat -> text in the box
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [fillValue, setFillValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    wgate.flats.list()
      .then((list) => {
        if (cancelled) return;
        const sorted = [...list].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        setFlats(sorted);
        setValues(
          Object.fromEntries(
            sorted.map((f) => [f, saved[f]?.area_sqft != null ? String(saved[f].area_sqft) : ''])
          )
        );
      })
      .catch(() => {
        if (!cancelled) setLoadError('Could not load flats. Please close this window and try again.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [saved]);

  const filled = flats.filter((f) => String(values[f] ?? '').trim() !== '').length;
  const visible = flats.filter((f) => f.toLowerCase().includes(search.trim().toLowerCase()));

  const applyFill = () => {
    const size = Number(fillValue);
    if (!Number.isFinite(size) || size <= 0) {
      setError('Enter a size in sq ft to fill the empty flats with.');
      return;
    }
    setError('');
    setValues((prev) => {
      const next = { ...prev };
      for (const f of flats) if (String(next[f] ?? '').trim() === '') next[f] = String(size);
      return next;
    });
  };

  const handleSave = async () => {
    setError('');
    const toCreate = [];
    const toUpdate = [];
    for (const flat of flats) {
      const text = String(values[flat] ?? '').trim();
      if (text === '') continue;
      const area = Number(text);
      if (!Number.isFinite(area) || area <= 0 || area > 100000) {
        setError(`Flat ${flat}: enter a size between 1 and 100000 sq ft.`);
        return;
      }
      const existing = saved[flat];
      if (!existing) toCreate.push({ flat_number: flat, area_sqft: area });
      else if (Number(existing.area_sqft) !== area) toUpdate.push({ id: existing.id, area_sqft: area });
    }
    if (toCreate.length === 0 && toUpdate.length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      if (toCreate.length) await wgate.entities.FlatArea.bulkCreate(toCreate);
      for (const item of toUpdate) await wgate.entities.FlatArea.update(item.id, { area_sqft: item.area_sqft });
      onSaved();
    } catch (e) {
      setError(`${e?.message || 'Could not save sizes.'} Some sizes may have been saved: close this window, open it again and check.`);
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
      <div className="bg-card w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-6 space-y-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Flat Sizes</h2>
          <button onClick={onClose} aria-label="Close"><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <p className="text-xs text-muted-foreground">
          Enter each flat's built-up area in square feet. Monthly bills are calculated as area × rate.
          {!loading && flats.length > 0 && ` ${filled} of ${flats.length} flats have a size.`}
        </p>

        {loading && <p className="text-sm text-muted-foreground py-4">Loading flats...</p>}
        {loadError && <p className="text-sm text-destructive">{loadError}</p>}
        {!loading && !loadError && flats.length === 0 && (
          <p className="text-sm text-muted-foreground py-2">
            No flats found. Add tenants or owners with a flat number in Members first.
          </p>
        )}

        {flats.length > 0 && (
          <>
            <div className="flex gap-2 items-end">
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs">Same size for all empty flats (sq ft)</Label>
                <Input type="number" inputMode="decimal" min="0" placeholder="e.g. 1200" value={fillValue}
                  onChange={(e) => setFillValue(e.target.value)} />
              </div>
              <Button type="button" variant="outline" onClick={applyFill}>Fill</Button>
            </div>

            <Input placeholder="Search flat..." value={search} onChange={(e) => setSearch(e.target.value)} />

            <div className="overflow-y-auto border border-border rounded-xl divide-y divide-border min-h-[8rem]">
              {visible.map((flat) => (
                <div key={flat} className="flex items-center gap-3 px-3 py-2">
                  <span className="flex-1 text-sm font-medium">{flat}</span>
                  <Input
                    className="w-28 h-8 text-sm text-right"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    placeholder="sq ft"
                    value={values[flat] ?? ''}
                    onChange={(e) => setValues((prev) => ({ ...prev, [flat]: e.target.value }))}
                  />
                  <span className="text-xs text-muted-foreground w-8">sq ft</span>
                </div>
              ))}
              {visible.length === 0 && (
                <p className="text-xs text-muted-foreground p-3">No flat matches your search.</p>
              )}
            </div>
          </>
        )}

        {error && <p className="text-xs text-destructive" role="alert">{error}</p>}

        <Button onClick={handleSave} disabled={saving || loading || flats.length === 0} className="w-full">
          {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : 'Save Sizes'}
        </Button>
      </div>
    </div>
  );
}