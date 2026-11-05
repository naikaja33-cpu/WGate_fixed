import { useEffect, useRef, useState } from 'react';
import { X, Loader2, ImagePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { wgate } from '@/api/wgateClient';
import { compressToJpeg } from '@/lib/imageTools';
import { CATEGORIES, categoryOf } from '@/components/community/categories';

const MAX_PHOTOS = 2;
const FULL_PHOTO = { maxSide: 900, maxChars: 330000 }; // opened when a photo is tapped
const THUMBNAIL = { maxSide: 320, maxChars: 60000 }; // shown in the list

/**
 * Add or edit a forum post.
 *  - post:         the post being edited, or null for a new one
 *  - defaultPhone: the poster's own phone number, pre-filled for new posts
 *  - onSubmit(data): async; throw to show the message under the form
 */
export default function PostFormModal({ post, defaultPhone, onSubmit, onClose }) {
  const [category, setCategory] = useState(post?.category || 'flat_rent');
  const [title, setTitle] = useState(post?.title || '');
  const [description, setDescription] = useState(post?.description || '');
  const [price, setPrice] = useState(post?.price !== null && post?.price !== undefined ? String(post.price) : '');
  const [phone, setPhone] = useState(post ? post.contact_phone || '' : defaultPhone || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Photos: the list only carries thumbnails, so when editing, the full photos are loaded first.
  const [photos, setPhotos] = useState([]);
  const [thumbs, setThumbs] = useState(post?.thumbs || []);
  const [photoStatus, setPhotoStatus] = useState(post?.thumbs?.length ? 'loading' : 'ready'); // loading | ready | failed
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!post?.thumbs?.length) return undefined;
    let cancelled = false;
    wgate.entities.ClassifiedPost.get(post.id)
      .then((full) => {
        if (cancelled) return;
        setPhotos(full.photos || []);
        setThumbs(full.thumbs || []);
        setPhotoStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setPhotoStatus('failed');
      });
    return () => { cancelled = true; };
  }, [post]);

  const handlePickPhotos = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // lets the same photo be picked again
    if (files.length === 0) return;
    setError('');
    setPhotoBusy(true);
    try {
      const nextPhotos = [...photos];
      const nextThumbs = [...thumbs];
      for (const file of files) {
        if (nextPhotos.length >= MAX_PHOTOS) break;
        nextPhotos.push(await compressToJpeg(file, FULL_PHOTO));
        nextThumbs.push(await compressToJpeg(file, THUMBNAIL));
      }
      setPhotos(nextPhotos);
      setThumbs(nextThumbs);
    } catch (err) {
      setError(err?.message || 'Could not add the photo.');
    }
    setPhotoBusy(false);
  };

  const removePhoto = (i) => {
    setPhotos((prev) => prev.filter((_, idx) => idx !== i));
    setThumbs((prev) => prev.filter((_, idx) => idx !== i));
  };

  const handleSave = async () => {
    setError('');
    if (!title.trim()) {
      setError('Please enter a title.');
      return;
    }
    if (price.trim() !== '' && (!Number.isFinite(Number(price)) || Number(price) < 0)) {
      setError('Price must be a number, or leave it empty.');
      return;
    }
    const digitCount = phone.replace(/\D/g, '').length;
    if (phone.trim() !== '' && (digitCount < 7 || digitCount > 15)) {
      setError('Enter a valid phone number, or leave it empty.');
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        category,
        title: title.trim(),
        description: description.trim(),
        price: price.trim() === '' ? null : Number(price),
        contact_phone: phone.trim(),
        // If the existing photos could not be loaded, leave them as they are.
        ...(photoStatus === 'ready' ? { photos, thumbs } : {}),
      });
    } catch (e) {
      setError(e?.message || 'Could not save your post. Please try again.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
      <div className="bg-card w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{post ? 'Edit Post' : 'New Post'}</h2>
          <button onClick={onClose} aria-label="Close"><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">What are you posting?</Label>
          <div className="grid grid-cols-2 gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setCategory(c.key)}
                className={`rounded-xl border px-3 py-2 text-sm font-medium text-left transition-colors ${
                  category === c.key ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-accent'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Title *</Label>
          <Input value={title} maxLength={100} placeholder="e.g. 2 BHK for rent, near the park"
            onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Details</Label>
          <Textarea value={description} maxLength={1000} rows={4}
            placeholder="Size, condition, floor, available from, anything a buyer should know"
            onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Photos (optional, up to {MAX_PHOTOS})</Label>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePickPhotos} />
          <div className="flex gap-2 flex-wrap">
            {thumbs.map((src, i) => (
              <div key={i} className="relative">
                <img src={src} alt={`Photo ${i + 1}`} className="w-20 h-20 rounded-xl object-cover border border-border" />
                {photoStatus === 'ready' && (
                  <button type="button" onClick={() => removePhoto(i)} aria-label={`Remove photo ${i + 1}`}
                    className="absolute -top-1.5 -right-1.5 bg-destructive text-white rounded-full p-0.5">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
            {thumbs.length < MAX_PHOTOS && photoStatus === 'ready' && (
              <Button type="button" variant="outline" className="w-20 h-20 rounded-xl flex-col gap-1 text-xs"
                onClick={() => fileRef.current?.click()} disabled={photoBusy}>
                {photoBusy ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImagePlus className="w-5 h-5" />}
                {photoBusy ? 'Adding' : 'Add'}
              </Button>
            )}
          </div>
          {photoStatus === 'loading' && <p className="text-xs text-muted-foreground">Loading your photos...</p>}
          {photoStatus === 'failed' && (
            <p className="text-xs text-amber-700">Could not load the existing photos. You can still edit the text; the photos stay as they are.</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{categoryOf(category).priceLabel}</Label>
            <Input type="number" inputMode="numeric" min="0" value={price} placeholder="e.g. 15000"
              onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Phone (optional)</Label>
            <Input type="tel" inputMode="tel" value={phone} maxLength={20} placeholder="Shown to neighbours"
              onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Your name and flat number are shown on the post. Deals are between residents; the society is not part of them.
        </p>

        {error && <p className="text-xs text-destructive" role="alert">{error}</p>}

        <Button onClick={handleSave} disabled={saving || photoBusy || photoStatus === 'loading'} className="w-full">
          {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : post ? 'Save Changes' : 'Post'}
        </Button>
      </div>
    </div>
  );
}