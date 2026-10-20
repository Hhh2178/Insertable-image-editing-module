import sharp from 'sharp';
import { ImageEditFailureError, imageEditFailure } from '../core/errors.js';

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface DecodedOverlay {
  bytes: Buffer;
  dimensions: ImageDimensions;
}

const DATA_URL_PATTERN = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/;

export async function decodeOverlayDataUrl(
  dataUrl: string,
  expected: ImageDimensions,
  limits: { maxBytes?: number; maxPixels?: number } = {},
): Promise<DecodedOverlay> {
  const maxBytes = limits.maxBytes ?? 20 * 1024 * 1024;
  const match = DATA_URL_PATTERN.exec(dataUrl);
  if (!match) throw new ImageEditFailureError(imageEditFailure('overlay_invalid', 'compose', '标注图片格式无效。'));
  const base64 = match[1];
  if (base64.length % 4 !== 0) throw new ImageEditFailureError(imageEditFailure('overlay_invalid', 'compose', '标注图片格式无效。'));
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length === 0 || bytes.length > maxBytes || bytes.toString('base64') !== base64) {
    throw new ImageEditFailureError(imageEditFailure('overlay_size_invalid', 'compose', '标注图片大小或编码无效。'));
  }
  try {
    const metadata = await sharp(bytes, { limitInputPixels: limits.maxPixels ?? 24_000_000, failOn: 'error' }).metadata();
    if (metadata.format !== 'png' || !metadata.width || !metadata.height) {
      throw new Error('Unsupported overlay image.');
    }
    if (metadata.width !== expected.width || metadata.height !== expected.height) {
      throw new ImageEditFailureError(imageEditFailure('overlay_dimensions_mismatch', 'compose', '标注图尺寸与原图不一致。'));
    }
    return { bytes, dimensions: { width: metadata.width, height: metadata.height } };
  } catch (cause) {
    if (cause instanceof ImageEditFailureError) throw cause;
    throw new ImageEditFailureError(imageEditFailure('overlay_decode_failed', 'compose', '无法读取标注图。'), cause);
  }
}
