import { Capacitor } from '@capacitor/core';

// Gives the person a file the server made ({ filename, mime, data: base64 }).
// In the Android app it opens the share sheet (save to Files or Drive, send on WhatsApp, open).
// On the website it downloads straight away.
export async function saveFile({ filename, mime, data }) {
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const written = await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache });
    await Share.share({ title: filename, url: written.uri, dialogTitle: filename });
    return;
  }
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}