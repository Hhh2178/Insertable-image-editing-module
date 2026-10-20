import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { composeMarkedImage } from '../../src/server/compose-marked-image.ts';
import { decodeOverlayDataUrl } from '../../src/server/decode-overlay.ts';

async function png(width: number, height: number, color: { r: number; g: number; b: number; alpha: number }) {
  return sharp({ create: { width, height, channels: 4, background: color } }).png().toBuffer();
}

test('decodes PNG overlay data URLs and rejects malformed, oversized, and wrong-sized data', async () => {
  const overlay = await png(8, 6, { r: 255, g: 0, b: 0, alpha: 0.5 });
  const decoded = await decodeOverlayDataUrl(`data:image/png;base64,${overlay.toString('base64')}`, { width: 8, height: 6 });
  assert.deepEqual(decoded.dimensions, { width: 8, height: 6 });
  await assert.rejects(decodeOverlayDataUrl('data:image/png;base64,not-valid!', { width: 8, height: 6 }));
  await assert.rejects(decodeOverlayDataUrl(`data:image/png;base64,${overlay.toString('base64')}`, { width: 9, height: 6 }));
  await assert.rejects(decodeOverlayDataUrl(`data:image/png;base64,${overlay.toString('base64')}`, { width: 8, height: 6 }, { maxBytes: 2 }));
});

test('composites to one PNG at the original dimensions without mutating either input', async () => {
  const source = await png(8, 6, { r: 20, g: 40, b: 80, alpha: 1 });
  const overlay = await png(8, 6, { r: 240, g: 0, b: 0, alpha: 0.7 });
  const sourceBefore = Buffer.from(source);
  const overlayBefore = Buffer.from(overlay);
  const result = await composeMarkedImage(source, overlay);
  const meta = await sharp(result.bytes).metadata();
  assert.equal(result.mimeType, 'image/png');
  assert.equal(meta.width, 8);
  assert.equal(meta.height, 6);
  assert.deepEqual(source, sourceBefore);
  assert.deepEqual(overlay, overlayBefore);
});

test('rejects invalid source images and mismatched overlay dimensions', async () => {
  const source = await png(8, 6, { r: 0, g: 0, b: 0, alpha: 1 });
  const wrong = await png(7, 6, { r: 255, g: 0, b: 0, alpha: 1 });
  await assert.rejects(composeMarkedImage(source, wrong), /尺寸/);
  await assert.rejects(composeMarkedImage(Buffer.from('bad image'), wrong));
});
