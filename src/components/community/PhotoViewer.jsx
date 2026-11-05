import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { wgate } from '@/api/wgateClient';

/**
 * Full-screen photo viewer for a forum post. The list only carries small
 * thumbnails, so the full photos are loaded here, when a thumbnail is tapped.
 */
export default function PhotoViewer({ post, startIndex = 0, onClose }) {
  const [index, setIndex] = useState(startIndex);
  const thumbs = post.thumbs || [];
  const total = thumbs.length;

  const { data } = useQuery({
    queryKey: ['community-post-photos', post.id],
    queryFn: () => wgate.entities.ClassifiedPost.get(post.id),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const fullPhoto = data?.photos?.[index];
  const src = fullPhoto || thumbs[index];
  const go = (step) => (e) => {
    e.stopPropagation();
    setIndex((i) => (i + step + total) % total);
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/85 flex items-center justify-center p-4" onClick={onClose}>
      <button type="button" className="absolute top-4 right-4 text-white" onClick={onClose} aria-label="Close">
        <X className="w-6 h-6" />
      </button>

      {src && (
        <img
          src={src}
          alt={post.title}
          className={`max-w-full max-h-[80vh] rounded-2xl ${fullPhoto ? '' : 'opacity-70'}`}
          onClick={(e) => e.stopPropagation()}
        />
      )}

      {total > 1 && (
        <>
          <button type="button" className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full p-2"
            onClick={go(-1)} aria-label="Previous photo">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full p-2"
            onClick={go(1)} aria-label="Next photo">
            <ChevronRight className="w-5 h-5" />
          </button>
          <p className="absolute bottom-5 text-xs text-white/80">{index + 1} / {total}</p>
        </>
      )}
    </div>
  );
}