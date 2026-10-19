import sharp from 'sharp';
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export async function preparePhoto(bytes: Buffer): Promise<Buffer> {
  if (bytes.length > MAX_PHOTO_BYTES) throw new Error('Photo too large');
  const instance = sharp(bytes, { limitInputPixels: 20_000_000, animated: false });
  const metadata = await instance.metadata();
  if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? ''))
    throw new Error('Unsupported photo format');
  // Re-encoding strips EXIF (including GPS), rejects malformed data and bounds decoded output.
  return instance
    .rotate()
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
}
