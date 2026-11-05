import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CATEGORIES, categoryOf } from '@/components/community/categories';

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

        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : post ? 'Save Changes' : 'Post'}
        </Button>
      </div>
    </div>
  );
}