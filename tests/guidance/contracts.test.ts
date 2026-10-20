import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildGuidedRevisionPrompt,
  parseGuidedRevisionResult,
  validateGuidedRevisionInput,
  type GuidedRevisionContext,
} from '../../src/guidance/index.ts';

const context: GuidedRevisionContext = {
  sourceId: 'product-screen-1',
  sourceVersionId: 'version-7',
  operationId: 'operation-9',
  sourceImagePrompt: 'A woman wearing a sun hat, no mask, seaside product scene.',
  planSnapshot: { screenId: 'screen-1', title: 'Sun protection', prompt: 'A woman with a mask' },
  lockedFacts: [{ fact: 'hat fabric color', value: 'beige' }],
  referenceManifest: [{ id: 'reference-1', role: 'product-reference' }],
  renderingContract: { aspectRatio: '1:1', resolution: '1K' },
  sourceEditHistory: ['Remove the mask from the face.'],
};

test('builds a versioned rewrite prompt from the full trusted source snapshot and user guidance', () => {
  const prompt = buildGuidedRevisionPrompt(context, '移除口罩，但保留帽子和构图');
  assert.match(prompt, /guided-image-revision\/1\.0\.0/);
  assert.match(prompt, /A woman wearing a sun hat, no mask, seaside product scene\./);
  assert.match(prompt, /移除口罩，但保留帽子和构图/);
  assert.match(prompt, /Remove the mask from the face\./);
  assert.match(prompt, /Preserve every original detail and constraint the user did not mention/);
});

test('validates guidance length and rejects whitespace-only rewrite requests', () => {
  assert.equal(validateGuidedRevisionInput('修改背景'), '修改背景');
  assert.throws(() => validateGuidedRevisionInput('   '), /不能为空/);
  assert.throws(() => validateGuidedRevisionInput('x'.repeat(2001)), /2000/);
});

test('parses a strict successful revision contract from JSON text', () => {
  const parsed = parseGuidedRevisionResult(JSON.stringify({
    status: 'ok',
    updatedPlan: { screenId: 'screen-1', prompt: 'A woman wearing only the sun hat at the seaside' },
    revisedImagePrompt: 'A woman wearing a beige sun hat at the seaside, without a mask.',
    summary: ['Removed the mask while preserving the hat and composition.'],
  }));
  assert.equal(parsed.status, 'ok');
  if (parsed.status === 'ok') assert.match(parsed.revisedImagePrompt, /without a mask/);
});

test('rejects unknown keys, empty prompts, malformed summaries, and mixed blocked fields', () => {
  const valid = { status: 'ok', updatedPlan: null, revisedImagePrompt: 'Complete prompt', summary: ['Changed the background'] };
  for (const invalid of [
    { ...valid, debug: 'provider route' },
    { ...valid, revisedImagePrompt: '   ' },
    { ...valid, summary: [] },
    { status: 'blocked', reason: 'conflict', revisedImagePrompt: 'partial' },
    { status: 'maybe', reason: 'unknown' },
    '{broken json',
  ]) assert.throws(() => parseGuidedRevisionResult(invalid));
});
