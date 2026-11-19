import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import jsQR from 'jsqr';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Full-screen camera that reads a QR code. Calls onScan(text) once, then the parent closes it.
export default function QRScanner({ onScan, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const onScanRef = useRef(onScan);
  const [error, setError] = useState('');

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    let stream = null;
    let raf = 0;
    let stopped = false;
    let lastTry = 0;

    const stop = () => {
      stopped = true;
      cancelAnimationFrame(raf);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setError('This device cannot open the camera here. Type the 6-character code instead.');
          return;
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        await video.play();

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        const tick = (now) => {
          if (stopped) return;
          if (now - lastTry > 120 && video.readyState >= 2 && video.videoWidth) {
            lastTry = now;
            const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
            canvas.width = Math.round(video.videoWidth * scale);
            canvas.height = Math.round(video.videoHeight * scale);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const found = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
            if (found && found.data) {
              stop();
              onScanRef.current(found.data);
              return;
            }
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        setError('Camera permission is needed to scan. Allow the camera, or type the 6-character code instead.');
      }
    })();

    return stop;
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      <div
        className="flex items-center justify-between px-4 py-3 text-white"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}
      >
        <p className="font-semibold">Scan the gate pass QR</p>
        <button type="button" onClick={onClose} className="p-2 rounded-full bg-white/20" aria-label="Close scanner">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" muted playsInline />
        <canvas ref={canvasRef} className="hidden" />
        {!error && (
          <div className="relative w-64 h-64 rounded-2xl border-4 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
        )}
        {error && (
          <div className="relative mx-6 rounded-2xl bg-white p-4 text-center space-y-3">
            <p className="text-sm text-red-600">{error}</p>
            <Button type="button" onClick={onClose} className="w-full">Close</Button>
          </div>
        )}
      </div>

      <p className="text-center text-white/80 text-sm py-4">Hold the visitor's QR inside the box</p>
    </div>,
    document.body
  );
}