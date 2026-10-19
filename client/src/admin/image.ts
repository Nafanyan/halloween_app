/** Integer size with the long side capped at `max`; never upscales. */
export function fitSize(w: number, h: number, max: number): { w: number; h: number } {
  const long = Math.max(w, h);
  if (long <= max) return { w, h };
  const k = max / long;
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

/** Decode a picked file, downscale on a canvas and re-encode as JPEG. Rejects if it can't be decoded. */
export async function downscaleImage(file: File, max = 1200, quality = 0.85): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const { w, h } = fitSize(bmp.width, bmp.height, max);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', quality);
  });
}
