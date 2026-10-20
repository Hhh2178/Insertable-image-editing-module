import sharp from 'sharp';
import { ImageEditFailureError, imageEditFailure } from '../core/errors.js';

export async function composeMarkedImage(
  sourceBytes: Uint8Array,
  overlayBytes: Uint8Array,
  maxPixels = 24_000_000,
): Promise<{ bytes: Buffer; mimeType: 'image/png' }> {
  try {
    const source = Buffer.from(sourceBytes);
    const overlay = Buffer.from(overlayBytes);
    const options = { limitInputPixels: maxPixels, failOn: 'error' as const, animated: false };
    const sourceMeta = await sharp(source, options).metadata();
    const overlayMeta = await sharp(overlay, options).metadata();
    if (!sourceMeta.width || !sourceMeta.height || !['png', 'jpeg', 'webp'].includes(sourceMeta.format ?? '')) {
      throw new Error('Unsupported source image.');
    }
    if (overlayMeta.format !== 'png' || sourceMeta.width !== overlayMeta.width || sourceMeta.height !== overlayMeta.height) {
      throw new ImageEditFailureError(imageEditFailure('overlay_dimensions_mismatch', 'compose', '标注图尺寸与原图不一致。'));
    }
    const bytes = await sharp(source, options).composite([{ input: overlay, blend: 'over' }]).png().toBuffer();
    return { bytes, mimeType: 'image/png' };
  } catch (cause) {
    if (cause instanceof ImageEditFailureError) throw cause;
    throw new ImageEditFailureError(imageEditFailure('image_compose_failed', 'compose', '无法合成标注图，请检查图片格式。'), cause);
  }
}
