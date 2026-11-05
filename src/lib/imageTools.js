// Shrinks a photo file to a JPEG data URL, lowering the quality until it fits in maxChars.
export function compressToJpeg(file, { maxSide, maxChars, qualities = [0.7, 0.55, 0.4, 0.3] }) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; // transparent PNGs get a white background instead of black
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      for (const quality of qualities) {
        const result = canvas.toDataURL('image/jpeg', quality);
        if (result.length <= maxChars) return resolve(result);
      }
      reject(new Error('This photo is too detailed. Please try another one.'));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read this photo. Please try another one.'));
    };
    img.src = url;
  });
}