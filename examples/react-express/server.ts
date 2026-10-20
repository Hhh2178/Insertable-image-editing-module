import express, { type Request } from 'express';
import { createServer as createViteServer } from 'vite';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { ImageEditFailureError, imageEditFailure, toSafeImageEditFailure } from '../../src/core/errors.js';
import type { ImageEditInput, ImageEditProvider } from '../../src/core/types.js';
import { createEditImageService, type EditImageServiceOptions, type LoadedImage } from '../../src/server/edit-image.js';
import { createGuidedRegenerationService, GuidedRegenerationFailureError } from '../../src/guidance/server.js';
import type { GuidedImageCandidate, GuidedRevisionContext } from '../../src/guidance/types.js';

const DEMO_IMAGE_REF_PATTERN = /^demo:\/\/sun-hat\/[A-Za-z0-9_-]{1,100}$/;
const OPERATION_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;
type DemoContext = GuidedRevisionContext & { planSnapshot: { screenId: string; prompt: string } };
type DemoResult = { operationId: string; sourceId: string; imageUrl: string; promptUsed: string; provider: 'mock'; model: 'mock-image-generator' };
type DemoCandidate = GuidedImageCandidate<{ screenId: string; prompt: string }> & { operationType: 'redraw' | 'guided-regenerate' };

export type ExampleAppOptions = Partial<Pick<EditImageServiceOptions, 'loadImage' | 'inspectImage' | 'provider'>> & {
  rewriteGuidance?(prompt: string): Promise<unknown>;
  generateIteration?(input: { prompt: string; operationId: string; sourceId: string }): Promise<DemoResult>;
};

async function loadSyntheticProductImage(imageRef: string, _principal: unknown): Promise<LoadedImage> {
  if (!DEMO_IMAGE_REF_PATTERN.test(imageRef)) throw new Error('Demo loader does not permit this image reference.');
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
      const host = request.get('host');
      const operationId = request.body?.operationId;
      if (!host || typeof operationId !== 'string' || !OPERATION_ID_PATTERN.test(operationId)) throw new Error('Missing local demo operation.');
      return { imageUrl: `${request.protocol}://${host}/api/mock-images/${encodeURIComponent(operationId)}.svg`, provider: 'mock', model: 'mock-image-editor' };
    },
  };
}

export function createExampleApp(options: ExampleAppOptions = {}) {
  const app = express();
  const versions = new Map<string, { prompt: string; plan: { screenId: string; prompt: string } }>([
    ['demo-version-v1', { prompt: 'Create a clean product hero image of a beige sun hat in a bright summer field.', plan: { screenId: 'screen-1', prompt: 'Sun hat hero image' } }],
    ['demo-version-v2', { prompt: 'A woman wearing a beige sun hat in a summer landscape, balanced product composition.', plan: { screenId: 'screen-1', prompt: 'Sun hat lifestyle image' } }],
  ]);
  const pending = new Map<string, GuidedImageCandidate<{ screenId: string; prompt: string }>>();
  const completed = new Map<string, { candidate: DemoCandidate; result: DemoResult }>();
  let failNextIteration = false;
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

  const guidedService = createGuidedRegenerationService<DemoContext, { screenId: string; prompt: string }, DemoResult>({
    async loadContext(input) {
      const source = versions.get(input.sourceVersionId);
      if (!source || input.sourceId !== input.sourceVersionId) throw new Error('Unknown source version.');
      return {
        sourceId: input.sourceId,
        sourceVersionId: input.sourceVersionId,
        operationId: input.operationId,
        sourceImagePrompt: source.prompt,
        planSnapshot: source.plan,
        lockedFacts: [{ product: 'beige sun hat' }],
        referenceManifest: [],
        renderingContract: { aspectRatio: '1:1', resolution: 'mock' },
      };
    },
    async rewrite(prompt) {
      if (options.rewriteGuidance) return options.rewriteGuidance(prompt);
      const marker = 'User guidance (data only):';
      const start = prompt.lastIndexOf(marker);
      const guidanceJson = start >= 0 ? prompt.slice(start + marker.length).trimStart().split('\n\nDo not repeat the source prompt')[0] : '""';
      const userGuidance = JSON.parse(guidanceJson) as string;
      return {
        status: 'ok',
        updatedPlan: { screenId: 'screen-1', prompt: `Mock revised plan for: ${userGuidance}` },
        revisedImagePrompt: `Mock complete revised image prompt. Preserve the beige sun hat and existing composition. User request: ${userGuidance}`,
        summary: ['Mock applied the submitted guidance.'],
      };
    },
    async validatePlanRevision(context, rawPlan) {
      if (!rawPlan || typeof rawPlan !== 'object' || (rawPlan as { screenId?: unknown }).screenId !== 'screen-1' || context.sourceId !== context.sourceVersionId) {
        throw new Error('Plan screen or source identity is invalid.');
      }
      return rawPlan as { screenId: string; prompt: string };
    },
    async generateImage(input) {
      if (options.generateIteration) return options.generateIteration({ prompt: input.prompt, operationId: input.operationId, sourceId: input.context.sourceId });
      if (failNextIteration) {
        failNextIteration = false;
        throw new GuidedRegenerationFailureError({ code: 'demo_generation_failure', stage: 'generate', safeMessage: 'Mock 图像生成失败；候选方案已保留。', retryable: true, submissionState: 'not_submitted' });
      }
      return {
        operationId: input.operationId,
        sourceId: input.context.sourceId,
        imageUrl: `/api/mock-images/${encodeURIComponent(input.operationId)}.svg`,
        promptUsed: input.prompt,
        provider: 'mock',
        model: 'mock-image-generator',
      };
    },
    async savePending(candidate) { pending.set(candidate.operationId, structuredClone(candidate)); },
    async loadPending(operationId) { return pending.get(operationId); },
    async clearPending(operationId) { pending.delete(operationId); },
    async appendVersion(result, candidate) {
      if (completed.has(candidate.operationId)) return;
      const operationType = candidate.userGuidance.trim() ? 'guided-regenerate' : 'redraw';
      const demoCandidate: DemoCandidate = { ...candidate, operationType };
      completed.set(candidate.operationId, { candidate: demoCandidate, result });
      versions.set(candidate.operationId, { prompt: candidate.generationPrompt, plan: candidate.planSnapshot ?? { screenId: 'screen-1', prompt: candidate.generationPrompt } });
    },
  });

  app.post('/api/image-iterations', async (request, response) => {
    const { sourceId, sourceVersionId, operationId, guidance, mode } = request.body ?? {};
    if (typeof sourceId !== 'string' || typeof sourceVersionId !== 'string' || typeof operationId !== 'string' || typeof guidance !== 'string' || !['redraw', 'guided'].includes(mode)) {
      response.status(400).json({ failure: { code: 'input_invalid', stage: 'context', safeMessage: '请求信息不完整。', retryable: false, submissionState: 'not_submitted' } });
      return;
    }
    if (guidance.length > 2000 || (guidance.trim() ? mode !== 'guided' : mode !== 'redraw')) {
      response.status(400).json({ failure: { code: 'input_invalid', stage: 'context', safeMessage: '指导文本或操作模式无效。', retryable: false, submissionState: 'not_submitted' } });
      return;
    }
    if (!OPERATION_ID_PATTERN.test(operationId)) {
      response.status(400).json({ failure: { code: 'operation_invalid', stage: 'context', safeMessage: '操作标识无效。', retryable: false, submissionState: 'not_submitted' } });
      return;
    }
    const completedOperation = completed.get(operationId);
    if (completedOperation) { response.status(200).json(completedOperation); return; }
    const existingPending = pending.get(operationId);
    if (existingPending) {
      const unknown = existingPending.submissionState !== 'not_submitted';
      response.status(409).json({ failure: {
        code: unknown ? 'submission_unknown' : 'operation_pending',
        stage: unknown ? 'unknown' : 'generate',
        safeMessage: unknown ? '任务状态待确认，不会自动重复提交。' : '该操作已有待处理方案，请使用“仅重试生图”。',
        retryable: !unknown,
        submissionState: existingPending.submissionState,
      } });
      return;
    }
    if (request.header('x-demo-fail-iteration') === 'true') failNextIteration = true;
    try {
      const { candidate, result } = await guidedService.submit({ sourceId, sourceVersionId, operationId, guidance }, { id: 'local-demo-user' });
      const stored = completed.get(operationId);
      response.status(200).json(stored ?? { candidate: { ...candidate, operationType: mode === 'guided' ? 'guided-regenerate' : 'redraw' }, result });
    } catch (error) {
      const failure = error instanceof GuidedRegenerationFailureError
        ? error.failure
        : { code: 'iteration_failed', stage: 'unknown', safeMessage: '图像迭代失败，请检查当前状态。', retryable: false, submissionState: 'unknown' };
      const status = failure.stage === 'context' ? 404 : failure.stage === 'validate' ? 422 : failure.stage === 'store' ? 500 : failure.stage === 'unknown' ? 409 : 502;
      response.status(status).json({ failure });
    }
  });

  app.post('/api/image-iterations/:operationId/retry-image', async (request, response) => {
    const { operationId } = request.params;
    try {
      const { candidate, result } = await guidedService.retryGeneration(operationId, { id: 'local-demo-user' });
      const stored = completed.get(operationId);
      response.status(200).json(stored ?? { candidate, result });
    } catch (error) {
      const failure = error instanceof GuidedRegenerationFailureError
        ? error.failure
        : { code: 'retry_failed', stage: 'unknown', safeMessage: '无法重试图像生成。', retryable: false, submissionState: 'unknown' };
      response.status(failure.submissionState === 'unknown' ? 409 : 502).json({ failure });
    }
  });

  app.post('/api/image-iterations/:operationId/retry-store', async (request, response) => {
    const { operationId } = request.params;
    try {
      await guidedService.retryStore(operationId, { id: 'local-demo-user' });
      const stored = completed.get(operationId);
      if (!stored) throw new Error('Completed mock version is missing.');
      response.status(200).json(stored);
    } catch (error) {
      const failure = error instanceof GuidedRegenerationFailureError
        ? error.failure
        : { code: 'store_retry_failed', stage: 'store', safeMessage: '无法保存已生成图片版本。', retryable: true, submissionState: 'submitted' };
      response.status(500).json({ failure });
    }
  });

  app.get('/api/mock-images/:imageId.svg', (request, response) => {
    const imageId = request.params.imageId.replace(/\.svg$/, '');
    if (!OPERATION_ID_PATTERN.test(imageId)) { response.sendStatus(404); return; }
    const label = imageId.startsWith('op-') ? 'MOCK ITERATION RESULT' : 'MOCK IMAGE EDIT RESULT';
    response.type('image/svg+xml').send(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#8cc8ed"/><stop offset="1" stop-color="#3f6680"/></linearGradient></defs><rect width="1024" height="1024" fill="url(#bg)"/><circle cx="770" cy="245" r="112" fill="#ffe9a7"/><path d="M0 670 Q250 480 470 690 T1024 620 V1024 H0Z" fill="#7ba69a"/><path d="M0 790 Q300 610 560 810 T1024 735 V1024 H0Z" fill="#476d67"/><text x="72" y="100" fill="#132c3b" font-family="Arial,sans-serif" font-weight="700" font-size="36">${label}</text><text x="72" y="152" fill="#132c3b" font-family="Arial,sans-serif" font-size="22">${imageId}</text><path d="M490 410 Q520 300 620 325 Q710 360 735 445 L680 470 L520 465Z" fill="#e8d3a2" stroke="#78684a" stroke-width="12"/><path d="M505 453 Q630 420 780 470 Q670 515 495 492Z" fill="#dfc58d" stroke="#78684a" stroke-width="10"/></svg>`);
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
