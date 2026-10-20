import express, { type Request } from 'express';
import { createServer as createViteServer } from 'vite';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { ImageEditFailureError, imageEditFailure, toSafeImageEditFailure } from '../../src/core/errors.js';
import type { ImageEditInput, ImageEditProvider } from '../../src/core/types.js';
import { createEditImageService, type EditImageServiceOptions, type LoadedImage } from '../../src/server/edit-image.js';

const DEMO_IMAGE_REF = 'demo://sun-hat/version-v2';

export type ExampleAppOptions = Partial<Pick<EditImageServiceOptions, 'loadImage' | 'inspectImage' | 'provider'>>;

async function loadSyntheticProductImage(imageRef: string, _principal: unknown): Promise<LoadedImage> {
  if (imageRef !== DEMO_IMAGE_REF) throw new Error('Demo loader does not permit this image reference.');
  const svg = await readFile(resolve('public/sample-product.svg'));
  const bytes = await sharp(svg).png().toBuffer();
  return { bytes, mimeType: 'image/png' };
}

function mockProvider(request: Request): ImageEditProvider {
  return {
    async generate() {
      if (request.header('x-demo-fail-next') === 'true') {
        throw new ImageEditFailureError(imageEditFailure('mock_provider_failure', 'submit', 'Mock 服务模拟失败；可以重新打开窗口后重试。', { submissionState: 'not_submitted' }));
      }
      return { imageUrl: 'https://example.invalid/mock-image-result.png', provider: 'mock', model: 'mock-image-editor' };
    },
  };
}

export function createExampleApp(options: ExampleAppOptions = {}) {
  const app = express();
  // A 20 MiB overlay grows to about 28 MB when base64-encoded inside JSON.
  app.use(express.json({ limit: '30mb' }));
  app.post('/api/image-edit', async (request, response) => {
    const serviceOptions: EditImageServiceOptions = {
      loadImage: options.loadImage ?? loadSyntheticProductImage,
      inspectImage: options.inspectImage,
      provider: options.provider ?? mockProvider(request),
      principal: { id: 'local-demo-user' },
    };
    try {
      const result = await createEditImageService(serviceOptions)(request.body as ImageEditInput);
      response.status(200).json(result);
    } catch (failure) {
      const safe = toSafeImageEditFailure(failure);
      const status = safe.stage === 'input' ? 400 : safe.stage === 'load' ? 404 : safe.stage === 'compose' ? 422 : 502;
      response.status(status).json({ failure: safe });
    }
  });
  return app;
}

export async function startExampleServer(port = Number(process.env.PORT ?? 3020)) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be an integer from 0 to 65535.');
  const app = createExampleApp();
  const vite = await createViteServer({
    server: { middlewareMode: true, host: '127.0.0.1' },
    appType: 'spa',
  });
  app.use(vite.middlewares);
  const server = app.listen(port, '127.0.0.1');
  server.once('close', () => { void vite.close(); });
  await new Promise<void>((resolveReady, reject) => {
    server.once('listening', resolveReady);
    server.once('error', reject);
  });
  const address = server.address();
  const actualPort = address && typeof address === 'object' ? address.port : port;
  process.stdout.write(`Image editor mock example listening at http://127.0.0.1:${actualPort}\n`);
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void startExampleServer().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Unable to start the local example.'}\n`);
    process.exitCode = 1;
  });
}
