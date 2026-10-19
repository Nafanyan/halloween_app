const OUT = 256;

/** Centered square of side min(w,h), integer offsets. */
export function squareCrop(w: number, h: number): { sx: number; sy: number; size: number } {
  const size = Math.min(w, h);
  return { sx: Math.floor((w - size) / 2), sy: Math.floor((h - size) / 2), size };
}

/** Decode a picked file, center-crop to a square, scale to 256x256 and encode as JPEG. Rejects if it can't be decoded. */
export async function avatarBlob(file: File, quality = 0.85): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const { sx, sy, size } = squareCrop(bmp.width, bmp.height);
  const canvas = document.createElement('canvas');
  canvas.width = OUT;
  canvas.height = OUT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  ctx.drawImage(bmp, sx, sy, size, size, 0, 0, OUT, OUT);
  bmp.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', quality);
  });
}
