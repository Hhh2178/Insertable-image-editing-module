import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGuidedRegenerationService, GuidedRegenerationFailureError } from '../../src/guidance/server.ts';
import type { GuidedImageCandidate, GuidedRevisionContext } from '../../src/guidance/index.ts';

const context: GuidedRevisionContext = {
  sourceId: 'screen-1', sourceVersionId: 'version-4', operationId: 'op-guided-1',
  sourceImagePrompt: 'A beige sun hat product image with a woman at the beach.',
  planSnapshot: { screenId: 'screen-1', prompt: 'woman wearing mask' },
  lockedFacts: [{ color: 'beige' }], referenceManifest: [{ id: 'ref-1' }], renderingContract: { ratio: '1:1' },
};

test('guided submit rewrites once, validates, and passes the complete revised prompt directly to image generation', async () => {
  let generatedPrompt = '';
  let rewriteCalls = 0;
  const service = createGuidedRegenerationService({
    async loadContext() { return context; },
    async rewrite(prompt) {
      rewriteCalls += 1;
      assert.match(prompt, /Remove or rewrite conflicting positive descriptions/);
      return { status: 'ok', updatedPlan: { screenId: 'screen-1' }, revisedImagePrompt: 'Complete revised prompt, no mask.', summary: ['Removed mask'] };
    },
    async validatePlanRevision(_source, plan) { return plan; },
    async generateImage(input) { generatedPrompt = input.prompt; return { imageUrl: '/result.svg' }; },
    async savePending() {}, async loadPending() { return undefined; }, async clearPending() {}, async appendVersion() {},
  });
  const result = await service.submit({ sourceId: context.sourceId, sourceVersionId: context.sourceVersionId, operationId: context.operationId, guidance: 'Remove the mask.' }, { id: 'demo' });
  assert.equal(result.candidate.generationPrompt, 'Complete revised prompt, no mask.');
  assert.equal(generatedPrompt, 'Complete revised prompt, no mask.');
  assert.equal(result.candidate.userGuidance, 'Remove the mask.');
  assert.equal(result.candidate.operationPromptUsed, 'Complete revised prompt, no mask.');
  assert.equal(rewriteCalls, 1);
});

test('blank guidance skips rewrite and sends the selected source prompt to image generation', async () => {
  let prompt = '';
  const service = createGuidedRegenerationService({
    async loadContext() { return context; },
    async rewrite() { assert.fail('blank guidance must not rewrite'); },
    async validatePlanRevision(_source, plan) { return plan; },
    async generateImage(input) { prompt = input.prompt; return { url: '/redraw.svg' }; },
    async savePending() {}, async loadPending() { return undefined; }, async clearPending() {}, async appendVersion() {},
  });
  const result = await service.submit({ sourceId: context.sourceId, sourceVersionId: context.sourceVersionId, operationId: context.operationId, guidance: '  ' }, { id: 'demo' });
  assert.equal(prompt, context.sourceImagePrompt);
  assert.deepEqual(result.candidate.summary, []);
  assert.equal(result.candidate.planSnapshot, context.planSnapshot);
});

test('host plan validation failure stops generation after exactly one rewrite', async () => {
  let rewrites = 0;
  let generations = 0;
  const service = createGuidedRegenerationService({
    async loadContext() { return context; },
    async rewrite() { rewrites += 1; return { status: 'ok', updatedPlan: { screenId: 'wrong-screen' }, revisedImagePrompt: 'unsafe cross-screen prompt', summary: ['Changed screen'] }; },
    async validatePlanRevision() { throw new Error('private validator detail'); },
    async generateImage() { generations += 1; return {}; },
    async savePending() {}, async loadPending() { return undefined; }, async clearPending() {}, async appendVersion() {},
  });
  await assert.rejects(
    service.submit({ sourceId: context.sourceId, sourceVersionId: context.sourceVersionId, operationId: context.operationId, guidance: 'Change another screen' }, { id: 'demo' }),
    (error: unknown) => error instanceof GuidedRegenerationFailureError && error.failure.stage === 'validate' && !error.message.includes('private validator detail'),
  );
  assert.equal(rewrites, 1);
  assert.equal(generations, 0);
});

test('host validator cannot erase a plan from a source version that has one', async () => {
  let generations = 0;
  const service = createGuidedRegenerationService({
    async loadContext() { return context; },
    async rewrite() { return { status: 'ok', updatedPlan: { screenId: 'screen-1' }, revisedImagePrompt: 'Complete revised prompt', summary: ['Updated'] }; },
    async validatePlanRevision() { return null; },
    async generateImage() { generations += 1; return {}; },
    async savePending() {}, async loadPending() { return undefined; }, async clearPending() {}, async appendVersion() {},
  });
  await assert.rejects(
    service.submit({ sourceId: context.sourceId, sourceVersionId: context.sourceVersionId, operationId: context.operationId, guidance: 'Update the plan' }, { id: 'demo' }),
    (error: unknown) => error instanceof GuidedRegenerationFailureError && error.failure.stage === 'validate',
  );
  assert.equal(generations, 0);
});

test('malformed request identifiers return a safe context failure', async () => {
  const service = createGuidedRegenerationService({
    async loadContext() { assert.fail('invalid input must not load context'); },
    async rewrite() { assert.fail('invalid input must not rewrite'); },
    async validatePlanRevision(_source, plan) { return plan; }, async generateImage() { return {}; },
    async savePending() {}, async loadPending() { return undefined; }, async clearPending() {}, async appendVersion() {},
  });
  await assert.rejects(
    service.submit({ sourceId: 7, sourceVersionId: null, operationId: {}, guidance: '' } as unknown as Parameters<typeof service.submit>[0], { id: 'demo' }),
    (error: unknown) => error instanceof GuidedRegenerationFailureError && error.failure.stage === 'context',
  );
});

test('generation retry reuses the pending rewritten prompt without calling rewrite again', async () => {
  const fail = new GuidedRegenerationFailureError({ code: 'busy', stage: 'generate', safeMessage: '暂不可用', retryable: true, submissionState: 'not_submitted' });
  const pending = new Map<string, GuidedImageCandidate>();
  let rewrites = 0;
  let images = 0;
  const service = createGuidedRegenerationService({
    async loadContext() { return context; },
    async rewrite() { rewrites += 1; return { status: 'ok', updatedPlan: { screenId: 'screen-1', prompt: 'Revised plan' }, revisedImagePrompt: 'Revised complete prompt.', summary: ['Updated'] }; },
    async validatePlanRevision(_source, plan) { return plan; },
    async generateImage(input) { images += 1; if (images === 1) throw fail; return { image: input.prompt }; },
    async savePending(candidate) { pending.set(candidate.operationId, structuredClone(candidate)); },
    async loadPending(id) { return pending.get(id); },
    async clearPending(id) { pending.delete(id); }, async appendVersion() {},
  });
  const input = { sourceId: context.sourceId, sourceVersionId: context.sourceVersionId, operationId: context.operationId, guidance: 'Revise the scene.' };
  await assert.rejects(service.submit(input, { id: 'demo' }), (error: unknown) => error instanceof GuidedRegenerationFailureError && error.failure.stage === 'generate');
  const result = await service.retryGeneration(context.operationId, { id: 'demo' });
  assert.equal(rewrites, 1);
  assert.equal(images, 2);
  assert.equal(result.candidate.generationPrompt, 'Revised complete prompt.');
});

test('unknown submission state refuses automatic image retry', async () => {
  const pending = new Map<string, GuidedImageCandidate>();
  let images = 0;
  const service = createGuidedRegenerationService({
    async loadContext() { return context; }, async rewrite() { assert.fail('not used'); },
    async validatePlanRevision(_source, plan) { return plan; },
    async generateImage() { images += 1; throw new GuidedRegenerationFailureError({ code: 'timeout', stage: 'generate', safeMessage: '状态待确认', retryable: false, submissionState: 'unknown' }); },
    async savePending(candidate) { pending.set(candidate.operationId, structuredClone(candidate)); },
    async loadPending(id) { return pending.get(id); }, async clearPending() {}, async appendVersion() {},
  });
  await assert.rejects(service.submit({ sourceId: context.sourceId, sourceVersionId: context.sourceVersionId, operationId: context.operationId, guidance: '' }, { id: 'demo' }));
  await assert.rejects(service.retryGeneration(context.operationId, { id: 'demo' }), /尚未确认/);
  assert.equal(images, 1);
});

test('image success followed by storage failure can retry storage without generating again', async () => {
  const pending = new Map<string, GuidedImageCandidate>();
  let images = 0;
  let appendAttempts = 0;
  const service = createGuidedRegenerationService({
    async loadContext() { return context; }, async rewrite() { assert.fail('empty guidance skips rewrite'); },
    async validatePlanRevision(_source, plan) { return plan; },
    async generateImage() { images += 1; return { id: 'generated-result' }; },
    async savePending(candidate) { pending.set(candidate.operationId, structuredClone(candidate)); },
    async loadPending(id) { return pending.get(id); }, async clearPending(id) { pending.delete(id); },
    async appendVersion() { appendAttempts += 1; if (appendAttempts === 1) throw new Error('private store detail'); },
  });
  await assert.rejects(service.submit({ sourceId: context.sourceId, sourceVersionId: context.sourceVersionId, operationId: context.operationId, guidance: '' }, { id: 'demo' }));
  const candidate = await service.retryStore(context.operationId, { id: 'demo' });
  assert.equal(images, 1);
  assert.equal(appendAttempts, 2);
  assert.deepEqual(candidate.generatedResult, { id: 'generated-result' });
});
