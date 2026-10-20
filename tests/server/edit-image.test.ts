import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { createEditImageService } from '../../src/server/edit-image.ts';

const validInput = {
  operationId: 'op-abc', sourceId: 'source-v4', imageRef: 'asset:source-v4', instruction: '去掉选中范围里的口罩',
};
const sourceImage = { bytes: Buffer.from('source-image'), mimeType: 'image/png' };

test('loads only the fixed reference and sends exactly one image to provider', async () => {
  const calls: string[] = [];
  const service = createEditImageService({
    loadImage: async (imageRef, principal) => { calls.push(`load:${imageRef}:${principal}`); return sourceImage; },
    inspectImage: async () => ({ width: 20, height: 10, format: 'png' }),
    provider: { generate: async (input) => { calls.push(`provider:${input.images.length}`); return { imageUrl: 'https://cdn.example.test/out.png', provider: 'apimart', model: input.model }; } },
    principal: 'user-1',
  });
  const result = await service(validInput);
  assert.deepEqual(calls, ['load:asset:source-v4:user-1', 'provider:1']);
  assert.equal(result.operationId, validInput.operationId);
  assert.equal(result.sourceId, validInput.sourceId);
  assert.equal(result.promptUsed, '去掉选中范围里的口罩\n\n保持原图其他区域的细节不变，保持原图的色彩不变');
});

test('validates before loading and composes one image when markings are present', async () => {
  let loadCount = 0;
  let providerImageCount = 0;
  const service = createEditImageService({
    loadImage: async () => { loadCount += 1; return sourceImage; },
    inspectImage: async () => ({ width: 20, height: 10, format: 'png' }),
    composeMarkedImage: async () => ({ bytes: Buffer.from('composed'), mimeType: 'image/png' }),
    provider: { generate: async ({ images }) => { providerImageCount = images.length; return { imageUrl: 'https://cdn.example.test/out.png', provider: 'apimart', model: 'gemini-nano-banana-2.1' }; } },
    principal: {},
  });
  await assert.rejects(service({ ...validInput, instruction: ' ' }), /编辑要求/);
  assert.equal(loadCount, 0);
  const overlay = await sharp({ create: { width: 20, height: 10, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.5 } } }).png().toBuffer();
  await service({ ...validInput, markedOverlayPngDataUrl: `data:image/png;base64,${overlay.toString('base64')}` });
  assert.equal(providerImageCount, 1);
});

test('rejects sources above configured bytes and decoded-pixel limits', async () => {
  const byteLimited = createEditImageService({
    loadImage: async () => ({ bytes: Buffer.alloc(33), mimeType: 'image/png' }),
    inspectImage: async () => ({ width: 2, height: 2, format: 'png' }),
    provider: { generate: async () => { throw new Error('must not call'); } }, principal: {}, limits: { maxSourceBytes: 32, maxPixels: 10 },
  });
  await assert.rejects(byteLimited(validInput), /原图大小/);
  const pixelLimited = createEditImageService({
    loadImage: async () => sourceImage,
    inspectImage: async () => ({ width: 4, height: 4, format: 'png' }),
    provider: { generate: async () => { throw new Error('must not call'); } }, principal: {}, limits: { maxSourceBytes: 32, maxPixels: 10 },
  });
  await assert.rejects(pixelLimited(validInput), /像素/);
});

test('rejects a composed image that exceeds the provider upload size cap', async () => {
  const overlay = await sharp({ create: { width: 20, height: 10, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.5 } } }).png().toBuffer();
  let providerCalled = false;
  const service = createEditImageService({
    loadImage: async () => ({ bytes: Buffer.from('source'), mimeType: 'image/png' }),
    inspectImage: async () => ({ width: 20, height: 10, format: 'png' }),
    composeMarkedImage: async () => ({ bytes: Buffer.alloc(40), mimeType: 'image/png' }),
    provider: { generate: async () => { providerCalled = true; throw new Error('must not call'); } },
    principal: {}, limits: { maxSourceBytes: 32, maxPixels: 1000 },
  });
  await assert.rejects(service({ ...validInput, markedOverlayPngDataUrl: `data:image/png;base64,${overlay.toString('base64')}` }), /合成图片/);
  assert.equal(providerCalled, false);
});
