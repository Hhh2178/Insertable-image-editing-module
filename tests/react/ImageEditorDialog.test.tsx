import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import React from 'react';
import { ImageEditFailureError, imageEditFailure } from '../../src/core/errors.ts';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  MutationObserver: dom.window.MutationObserver,
  getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
});
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true, writable: true });

const { cleanup, fireEvent, render, screen, waitFor } = await import('@testing-library/react');
const { ImageEditorDialog } = await import('../../src/react/ImageEditorDialog.tsx');

afterEach(() => cleanup());

test('annotation canvas preserves the source image contain geometry', () => {
  const styles = readFileSync(new URL('../../src/react/editor.css', import.meta.url), 'utf8');
  const rule = styles.match(/\.image-editor-annotation-canvas\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.match(rule, /object-fit:\s*contain/);
  assert.match(rule, /object-position:\s*center/);
});

const source = {
  id: 'version-2',
  imageRef: 'asset:version-2',
  previewUrl: 'https://images.example.test/source.png',
};

test('requires non-whitespace edit instructions and displays the character count', () => {
  render(<ImageEditorDialog open source={source} execute={async () => { throw new Error('should not submit'); }} onClose={() => {}} onSuccess={() => {}} onError={() => {}} />);

  const submit = screen.getByRole('button', { name: '提交编辑' });
  const instruction = screen.getByLabelText(/编辑要求/);
  assert.equal((submit as HTMLButtonElement).disabled, true);
  fireEvent.change(instruction, { target: { value: '   ' } });
  assert.equal((submit as HTMLButtonElement).disabled, true);
  fireEvent.change(instruction, { target: { value: '移除红色标记处的文字' } });
  assert.equal((submit as HTMLButtonElement).disabled, false);
  assert.ok(screen.getByText('10 / 2000'));
});

test('dispatch closes the dialog and submits the fixed source and user instruction', async () => {
  let captured: unknown;
  let closeCount = 0;
  const onClose = () => { closeCount += 1; };
  const execute = async (input: unknown, events: { onDispatched(): void }) => {
    captured = input;
    events.onDispatched();
    return { operationId: 'op-1', sourceId: source.id, imageUrl: 'https://images.example.test/result.png', promptUsed: 'prompt', provider: 'mock', model: 'mock' };
  };
  render(<ImageEditorDialog open source={source} execute={execute} onClose={onClose} onSuccess={() => {}} onError={() => {}} />);
  fireEvent.change(screen.getByLabelText(/编辑要求/), { target: { value: '去掉遮挡物' } });
  fireEvent.click(screen.getByRole('button', { name: '提交编辑' }));

  await waitFor(() => assert.equal(closeCount, 1));
  assert.ok(screen.getByRole('dialog'), 'the parent owns the controlled open state');
  assert.equal((captured as { sourceId: string }).sourceId, source.id);
  assert.equal((captured as { imageRef: string }).imageRef, source.imageRef);
  assert.equal((captured as { instruction: string }).instruction, '去掉遮挡物');
  assert.equal((captured as { markedOverlayPngDataUrl?: string }).markedOverlayPngDataUrl, undefined);
  assert.match((captured as { operationId: string }).operationId, /^edit-|^[0-9a-f-]{36}$/i);
});

test('provider failure reports the error and preserves the editor draft', async () => {
  let errorMessage = '';
  const onError = (failure: { safeMessage: string }) => { errorMessage = failure.safeMessage; };
  const execute = async () => { throw new ImageEditFailureError(imageEditFailure('provider_busy', 'submit', '服务暂不可用。', { submissionState: 'not_submitted' })); };
  render(<ImageEditorDialog open source={source} execute={execute} onClose={() => {}} onSuccess={() => {}} onError={onError} />);
  const instruction = screen.getByLabelText(/编辑要求/);
  fireEvent.change(instruction, { target: { value: '去掉背景文字' } });
  fireEvent.click(screen.getByRole('button', { name: '提交编辑' }));

  await waitFor(() => assert.equal(errorMessage, '服务暂不可用。'));
  assert.ok(screen.getByRole('dialog'));
  assert.equal((instruction as HTMLTextAreaElement).value, '去掉背景文字');
});

test('exports marks from the selected version and supports undo, redo, and clear', async () => {
  let captured: { markedOverlayPngDataUrl?: string } | undefined;
  const execute = async (input: { markedOverlayPngDataUrl?: string }) => {
    captured = input;
    return { operationId: 'op', sourceId: source.id, imageUrl: source.previewUrl, promptUsed: 'prompt', provider: 'mock', model: 'mock' };
  };
  render(<ImageEditorDialog open source={source} execute={execute} onClose={() => {}} onSuccess={() => {}} onError={() => {}} />);
  const canvas = screen.getByLabelText('在图片上涂抹需要修改的区域') as HTMLCanvasElement;
  const context = { clearRect() {}, save() {}, restore() {}, beginPath() {}, arc() {}, fill() {}, moveTo() {}, lineTo() {}, stroke() {}, set lineCap(_value: string) {}, set lineJoin(_value: string) {}, set globalCompositeOperation(_value: string) {}, set strokeStyle(_value: string) {}, set fillStyle(_value: string) {}, set lineWidth(_value: number) {} };
  canvas.getContext = (() => context) as unknown as typeof canvas.getContext;
  canvas.toDataURL = () => 'data:image/png;base64,bWFya2Vk';
  const image = screen.getByAltText('当前选中版本原图');
  Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 100 });
  Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 100 });
  fireEvent.load(image);

  canvas.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100, toJSON: () => ({}) });
  fireEvent(canvas, new dom.window.MouseEvent('pointerdown', { bubbles: true, clientX: 40, clientY: 50 }));
  fireEvent(canvas, new dom.window.MouseEvent('pointerup', { bubbles: true, clientX: 40, clientY: 50 }));
  assert.equal((screen.getByRole('button', { name: '撤销' }) as HTMLButtonElement).disabled, false);
  fireEvent.click(screen.getByRole('button', { name: '撤销' }));
  assert.equal((screen.getByRole('button', { name: '重做' }) as HTMLButtonElement).disabled, false);
  fireEvent.click(screen.getByRole('button', { name: '重做' }));
  fireEvent.click(screen.getByRole('button', { name: '清空' }));
  assert.equal((screen.getByRole('button', { name: '撤销' }) as HTMLButtonElement).disabled, false);
  fireEvent.click(screen.getByRole('button', { name: '撤销' }));
  fireEvent.change(screen.getByLabelText(/编辑要求/), { target: { value: '在标记位置修改' } });
  fireEvent.click(screen.getByRole('button', { name: '提交编辑' }));
  await waitFor(() => assert.equal(captured?.markedOverlayPngDataUrl, 'data:image/png;base64,bWFya2Vk'));
});
