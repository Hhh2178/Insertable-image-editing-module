import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildImageEditPrompt } from '../../src/core/prompt.ts';
import { validateImageEditInput } from '../../src/core/validation.ts';

const baseInput = {
  operationId: 'op-1',
  sourceId: 'source-1',
  imageRef: 'asset:source-1',
  instruction: '  去除标记区域的口罩  ',
};

test('builds the exact Chinese single-image prompt and preserves the user text', () => {
  const prompt = buildImageEditPrompt({ instruction: baseInput.instruction, marked: true, language: 'zh' });
  assert.ok(prompt.startsWith('提供的图片上有用户标记，用于指出需要修改的范围或内容。请根据用户要求完成修改，标记只用于定位，最终图片中不要保留这些标记。\n\n'));
  assert.ok(prompt.includes(baseInput.instruction));
  assert.ok(prompt.endsWith('\n\n保持原图其他区域的细节不变，保持原图的色彩不变'));
});

test('does not add a marking prefix without an overlay and supports English prompt text', () => {
  const prompt = buildImageEditPrompt({ instruction: 'Remove the marked mask area.', marked: false, language: 'en' });
  assert.equal(prompt, 'Remove the marked mask area.\n\nKeep all other details and colors of the original image unchanged.');
});

test('uses adaptive language wording for mixed instructions without rewriting them', () => {
  const instruction = 'Remove the mask, 保持帽子的颜色';
  const prompt = buildImageEditPrompt({ instruction, marked: true, language: 'auto' });
  assert.ok(prompt.includes(instruction));
  assert.match(prompt, /language of the user's instructions/i);
  assert.ok(prompt.endsWith('Keep all other details and colors of the original image unchanged.'));
});

test('validates required identifiers and nonblank instructions up to 2,000 characters', () => {
  assert.deepEqual(validateImageEditInput(baseInput), []);
  assert.ok(validateImageEditInput({ ...baseInput, instruction: '  ' }).some((issue) => issue.code === 'instruction_required'));
  assert.ok(validateImageEditInput({ ...baseInput, instruction: 'x'.repeat(2001) }).some((issue) => issue.code === 'instruction_too_long'));
  assert.ok(validateImageEditInput({ ...baseInput, sourceId: '' }).some((issue) => issue.code === 'source_required'));
});
