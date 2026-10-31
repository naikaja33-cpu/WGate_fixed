import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { X, Camera } from 'lucide-react';
import { wgate } from '@/api/wgateClient';

const OTHER_FLAT = '__other__';

// Shrinks a camera photo to a small JPEG data URL so it stays cheap to store.
function compressImage(file, maxSide = 400, quality = 0.55) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read the photo'));
    };
    img.src = url;
  });
}

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
  const [photo, setPhoto] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    wgate.flats.list()
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

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // lets the same photo be retaken
    if (!file) return;
    setPhotoError('');
    setPhotoBusy(true);
    try {
      setPhoto(await compressImage(file));
    } catch (err) {
      setPhotoError(err?.message || 'Could not process the photo');
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.flat_number.trim()) {
      setFlatError('Please select or enter a flat number');
      return;
    }
    // To make the photo compulsory, uncomment the next 4 lines:
    // if (!photo) {
    //   setPhotoError('Please take a photo of the visitor');
    //   return;
    // }
    setFlatError('');
    onSubmit({
      ...form,
      ...(photo ? { photo } : {}),
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
            <Label>Visitor Photo</Label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhoto}
              className="hidden"
            />
            {photo ? (
              <div className="flex items-center gap-3">
                <img src={photo} alt="Visitor" className="w-20 h-20 rounded-xl object-cover border border-border" />
                <div className="flex flex-col gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={photoBusy}>
                    <Camera className="w-4 h-4 mr-1.5" /> Retake
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setPhoto('')}>
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <Button type="button" variant="outline" className="w-full" onClick={() => fileRef.current?.click()} disabled={photoBusy}>
                <Camera className="w-4 h-4 mr-1.5" />
                {photoBusy ? 'Processing…' : 'Take Photo'}
              </Button>
            )}
            {photoError && <p className="text-xs text-destructive">{photoError}</p>}
          </div>

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

          <Button type="submit" className="w-full" disabled={isSubmitting || photoBusy}>
            {isSubmitting ? 'Adding...' : 'Check In Visitor'}
          </Button>
        </form>
      </div>
    </div>
  );
}