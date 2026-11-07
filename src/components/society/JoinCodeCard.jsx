import { useQuery } from '@tanstack/react-query';
import { Copy, MessageCircle, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { wgate } from '@/api/wgateClient';

const SITE = 'https://wwgate.in';
const formatCode = (c) => (c ? `${c.slice(0, 4)}-${c.slice(4)}` : '');

// Admin: the code and sign-in link members use to reach this society's login. Share it in the residents' group.
export default function JoinCodeCard() {
  const { data } = useQuery({
    queryKey: ['join-code'],
    queryFn: () => wgate.admin.joinCode(),
    staleTime: 5 * 60 * 1000,
  });
  const code = data?.join_code || '';
  if (!code) return null;

  const link = `${SITE}/#/s/${code}`;
  const message = `Sign in to ${data?.name || 'our society'} on WGate.\nOpen this link: ${link}\nSociety code: ${formatCode(code)}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Sign-in link copied');
    } catch {
      toast.error('Could not copy. Please copy the link by hand.');
    }
  };

  return (
    <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <KeyRound className="w-5 h-5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Your society code</p>
          <p className="font-mono text-lg font-semibold tracking-widest">{formatCode(code)}</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Members enter this code (or open the link) to reach your society's sign-in. Only share it with your residents.
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="flex-1" onClick={copyLink}>
          <Copy className="w-4 h-4 mr-1" /> Copy link
        </Button>
        <Button asChild size="sm" variant="outline" className="flex-1 border-emerald-200 text-emerald-700 hover:bg-emerald-50">
          <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">
            <MessageCircle className="w-4 h-4 mr-1" /> Share on WhatsApp
          </a>
        </Button>
      </div>
    </div>
  );
}