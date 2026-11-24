import { useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { formatDay } from '@/lib/ist';
import { QrCode, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { saveFile } from '@/lib/saveFile';

// What the QR holds. The guard's scanner reads this and checks the code with the server.
export const qrValueFor = (code) => `WGATE:${code}`;

// Draws a clean picture (QR + name + date + code) that can be sent on WhatsApp or saved.
function buildShareImage(qrCanvas, pass) {
  const W = 640;
  const H = 840;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#111827';
  ctx.font = 'bold 40px sans-serif';
  ctx.fillText('WGate Gate Pass', W / 2, 70);
  ctx.fillStyle = '#6b7280';
  ctx.font = '26px sans-serif';
  ctx.fillText('Show this QR to security at the gate', W / 2, 112);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qrCanvas, 80, 150, 480, 480);
  ctx.fillStyle = '#111827';
  ctx.font = 'bold 44px monospace';
  ctx.fillText(pass.code, W / 2, 690);
  ctx.font = 'bold 32px sans-serif';
  ctx.fillText(String(pass.visitor_name || ''), W / 2, 745);
  ctx.fillStyle = '#6b7280';
  ctx.font = '26px sans-serif';
  const multi = pass.valid_until && pass.valid_until !== pass.valid_date;
  const when = pass.valid_date ? formatDay(pass.valid_date, 'd MMM yyyy') : '';
  const until = multi ? formatDay(pass.valid_until, 'd MMM yyyy') : '';
  ctx.fillText(multi ? `Valid ${when} to ${until} · one use` : `Valid on ${when} only · one use`, W / 2, 790);
  return c.toDataURL('image/png').split(',')[1];
}

// Shows the QR for one gate pass. With `collapsible`, it hides behind a "Show QR" button.
export default function PassQR({ pass, collapsible = false }) {
  const [open, setOpen] = useState(!collapsible);
  const wrapRef = useRef(null);

  const share = async () => {
    try {
      const qrCanvas = wrapRef.current?.querySelector('canvas');
      if (!qrCanvas) return;
      const data = buildShareImage(qrCanvas, pass);
      await saveFile({ filename: `WGate-pass-${pass.code}.png`, mime: 'image/png', data });
    } catch {
      toast.error('Could not share the QR. Please try again.');
    }
  };

  if (!open) {
    return (
      <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => setOpen(true)}>
        <QrCode className="w-4 h-4 mr-1" /> Show QR
      </Button>
    );
  }

  return (
    <div className="mt-3 flex flex-col items-start gap-2">
      <div ref={wrapRef} className="bg-white p-2 rounded-xl border border-border inline-block">
        <QRCodeCanvas value={qrValueFor(pass.code)} size={200} level="M" marginSize={2} />
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" onClick={share}>
          <Share2 className="w-4 h-4 mr-1" /> Share QR
        </Button>
        {collapsible && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Hide
          </Button>
        )}
      </div>
    </div>
  );
}