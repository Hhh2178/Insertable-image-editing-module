import { ImageEditFailureError, imageEditFailure } from '../core/errors.js';
import { buildImageEditPrompt, type PromptLanguage } from '../core/prompt.js';
import { validateImageEditInput } from '../core/validation.js';
import type { ImageEditInput, ImageEditProvider, ImageEditResult } from '../core/types.js';
import { composeMarkedImage } from './compose-marked-image.js';
import { decodeOverlayDataUrl } from './decode-overlay.js';

export interface LoadedImage {
  bytes: Uint8Array;
  mimeType: string;
}

export interface ImageInspection {
  width: number;
  height: number;
  format: string;
}

export interface EditImageServiceOptions {
  loadImage(imageRef: string, principal: unknown): Promise<LoadedImage>;
  provider: ImageEditProvider;
  principal: unknown;
  inspectImage?(bytes: Uint8Array): Promise<ImageInspection>;
  composeMarkedImage?(source: Uint8Array, overlay: Uint8Array): Promise<LoadedImage>;
  limits?: { maxSourceBytes?: number; maxOverlayBytes?: number; maxPixels?: number };
  language?: PromptLanguage;
}

const FORMAT_MIME: Record<string, string> = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };

async function inspectWithSharp(bytes: Uint8Array): Promise<ImageInspection> {
  const sharp = (await import('sharp')).default;
  const metadata = await sharp(Buffer.from(bytes), { failOn: 'error', limitInputPixels: 24_000_000 }).metadata();
  if (!metadata.width || !metadata.height || !metadata.format) throw new Error('Image metadata is incomplete.');
  return { width: metadata.width, height: metadata.height, format: metadata.format };
}

export function createEditImageService(options: EditImageServiceOptions): (input: ImageEditInput) => Promise<ImageEditResult> {
  const limits = {
    maxSourceBytes: options.limits?.maxSourceBytes ?? 20 * 1024 * 1024,
    maxOverlayBytes: options.limits?.maxOverlayBytes ?? 20 * 1024 * 1024,
    maxPixels: options.limits?.maxPixels ?? 24_000_000,
  };

  return async (input) => {
    const issues = validateImageEditInput(input);
    if (issues.length) {
      const first = issues[0];
      throw new ImageEditFailureError(imageEditFailure(first.code, 'input', first.message));
    }

    let loaded: LoadedImage;
    try {
      loaded = await options.loadImage(input.imageRef, options.principal);
    } catch (cause) {
      throw new ImageEditFailureError(imageEditFailure('image_load_failed', 'load', '无法读取当前选中版本的图片。'), cause);
    }
    if (!(loaded.bytes instanceof Uint8Array) || loaded.bytes.byteLength === 0 || loaded.bytes.byteLength > limits.maxSourceBytes) {
      throw new ImageEditFailureError(imageEditFailure('image_size_invalid', 'load', '原图大小无效或超过限制。'));
    }

    let inspection: ImageInspection;
    try {
      inspection = await (options.inspectImage ?? inspectWithSharp)(loaded.bytes);
    } catch (cause) {
      throw new ImageEditFailureError(imageEditFailure('image_decode_failed', 'load', '无法解码原图。'), cause);
    }
    const expectedMime = FORMAT_MIME[inspection.format];
    if (!expectedMime || loaded.mimeType !== expectedMime || inspection.width <= 0 || inspection.height <= 0 || inspection.width * inspection.height > limits.maxPixels) {
      throw new ImageEditFailureError(imageEditFailure('image_format_or_pixels_invalid', 'load', '原图格式或像素尺寸不受支持。'));
    }

    let finalImage: LoadedImage = { bytes: loaded.bytes, mimeType: expectedMime };
    const marked = Boolean(input.markedOverlayPngDataUrl);
    if (marked) {
      try {
        const overlay = await decodeOverlayDataUrl(input.markedOverlayPngDataUrl!, inspection, { maxBytes: limits.maxOverlayBytes, maxPixels: limits.maxPixels });
        finalImage = await (options.composeMarkedImage ?? ((source, overlayBytes) => composeMarkedImage(source, overlayBytes, limits.maxPixels)))(loaded.bytes, overlay.bytes);
      } catch (cause) {
        if (cause instanceof ImageEditFailureError) throw cause;
        throw new ImageEditFailureError(imageEditFailure('image_compose_failed', 'compose', '无法合成标注图。'), cause);
      }
    }
    if (!(finalImage.bytes instanceof Uint8Array) || finalImage.bytes.byteLength === 0 || finalImage.bytes.byteLength > limits.maxSourceBytes) {
      throw new ImageEditFailureError(imageEditFailure('composed_image_size_invalid', 'compose', '合成图片大小无效或超过上传限制。'));
    }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(finalImage.mimeType)) {
      throw new ImageEditFailureError(imageEditFailure('composed_image_format_invalid', 'compose', '合成图片格式不受支持。'));
    }

    const prompt = buildImageEditPrompt({ instruction: input.instruction, marked, language: options.language ?? 'zh' });
    try {
      const result = await options.provider.generate({
        model: 'gemini-nano-banana-2.1',
        size: 'auto',
        resolution: '1K',
        prompt,
        images: [{ bytes: finalImage.bytes, mimeType: finalImage.mimeType as 'image/png' | 'image/jpeg' | 'image/webp' }],
      });
      const parsedUrl = new URL(result.imageUrl);
      if (!['https:', 'http:'].includes(parsedUrl.protocol) || !parsedUrl.hostname) throw new Error('Invalid result URL.');
      return { operationId: input.operationId, sourceId: input.sourceId, imageUrl: parsedUrl.toString(), promptUsed: prompt, provider: result.provider, model: result.model };
    } catch (cause) {
      if (cause instanceof ImageEditFailureError) throw cause;
      throw new ImageEditFailureError(imageEditFailure('provider_result_invalid', 'result', '图像服务未返回有效结果。', { submissionState: 'submitted' }), cause);
    }
  };
}
