import { Phone, MessageCircle, Pencil, Trash2, CheckCircle2, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { categoryOf } from '@/components/community/categories';

/**
 * One forum post.
 *  - isMine:  the signed-in person posted it (can edit, close, delete)
 *  - isAdmin: the society admin (can close/reopen and remove any post)
 */
export default function PostCard({ post, isMine, isAdmin, onEdit, onToggleStatus, onDelete }) {
  const cat = categoryOf(post.category);
  const closed = post.status === 'closed';
  const digits = String(post.contact_phone || '').replace(/\D/g, '');
  // A 10-digit number is treated as an Indian mobile number for WhatsApp.
  const whatsappNumber = digits.length === 10 ? `91${digits}` : digits;
  const hasPrice = post.price !== null && post.price !== undefined && post.price !== '';

  return (
    <div className={`bg-card rounded-2xl border border-border p-4 space-y-3 ${closed ? 'opacity-70' : ''}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <Badge className={`text-xs border ${cat.style}`}>{cat.label}</Badge>
        {closed && <Badge className="text-xs border bg-gray-100 text-gray-700 border-gray-200">{cat.closedLabel}</Badge>}
      </div>

      <div>
        <h3 className="font-semibold text-foreground">{post.title}</h3>
        {hasPrice && (
          <p className="text-lg font-bold text-foreground mt-0.5">
            ₹{Number(post.price).toLocaleString('en-IN')}{cat.priceSuffix}
          </p>
        )}
      </div>

      {post.description && (
        <p className="text-sm text-muted-foreground whitespace-pre-line break-words">{post.description}</p>
      )}

      <p className="text-xs text-muted-foreground">
        {post.resident_name || 'Resident'}{post.flat_number ? ` · Flat ${post.flat_number}` : ''}
        {post.created_date ? ` · ${format(new Date(post.created_date), 'MMM d')}` : ''}
      </p>

      {!isMine && !closed && (
        digits ? (
          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline" className="flex-1">
              <a href={`tel:${digits}`}><Phone className="w-4 h-4 mr-1" /> Call</a>
            </Button>
            <Button asChild size="sm" variant="outline" className="flex-1 border-emerald-200 text-emerald-700 hover:bg-emerald-50">
              <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noreferrer">
                <MessageCircle className="w-4 h-4 mr-1" /> WhatsApp
              </a>
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            No phone number given. Contact the owner at {post.flat_number ? `Flat ${post.flat_number}` : 'their flat'}.
          </p>
        )
      )}

      {isMine && (
        <div className="flex gap-2 flex-wrap">
          {isMine && (
            <Button size="sm" variant="outline" onClick={() => onEdit(post)}>
              <Pencil className="w-4 h-4 mr-1" /> Edit
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => onToggleStatus(post)}>
            {closed
              ? <><RotateCcw className="w-4 h-4 mr-1" /> Reopen</>
              : <><CheckCircle2 className="w-4 h-4 mr-1" /> Mark as {cat.closedLabel}</>}
          </Button>
          <Button size="sm" variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10"
            onClick={() => onDelete(post)}>
            <Trash2 className="w-4 h-4 mr-1" /> {isMine ? 'Delete' : 'Remove'}
          </Button>
        </div>
            )}

      {isAdmin && !isMine && (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10"
            onClick={() => onDelete(post)}>
            <Trash2 className="w-4 h-4 mr-1" /> Remove post (admin)
          </Button>
        </div>
      )}
    </div>
  );
}