import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { preparePhoto, MAX_PHOTO_BYTES } from '../server/uploads.js';
describe('real image processing without a database', () => {
  it('decodes, bounds and re-encodes an image while stripping metadata', async () => {
    const original = await sharp({
      create: { width: 2000, height: 20, channels: 3, background: '#437257' },
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    const clean = await preparePhoto(original),
      metadata = await sharp(clean).metadata();
    expect(metadata.format).toBe('jpeg');
    expect(Math.max(metadata.width!, metadata.height!)).toBe(1600);
    expect(metadata.exif).toBeUndefined();
    expect(metadata.orientation).toBeUndefined();
  });
  it('rejects SVG regardless of a claimed image MIME type', async () => {
    await expect(
      preparePhoto(
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
        ),
      ),
    ).rejects.toThrow();
  });
  it('rejects malformed and over-limit image bytes', async () => {
    await expect(preparePhoto(Buffer.from('not an image'))).rejects.toThrow();
    await expect(preparePhoto(Buffer.alloc(MAX_PHOTO_BYTES + 1))).rejects.toThrow(
      'Photo too large',
    );
  });
});
