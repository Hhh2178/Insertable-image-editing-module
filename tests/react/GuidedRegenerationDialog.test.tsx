import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { JSDOM } from 'jsdom';
import React from 'react';

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
const { GuidedRegenerationDialog } = await import('../../src/react/GuidedRegenerationDialog.tsx');

afterEach(() => cleanup());

test('empty guidance dispatches as ordinary redraw and closes only after dispatch', async () => {
  let received: { guidance: string; mode: string } | undefined;
  let closed = 0;
  const onSubmit = async (request: { guidance: string; mode: string }, events: { onDispatched(): void }) => {
    received = request;
    events.onDispatched();
  };
  render(<GuidedRegenerationDialog open onSubmit={onSubmit} onClose={() => { closed += 1; }} />);

  fireEvent.click(screen.getByRole('button', { name: '开始重新生成' }));
  await waitFor(() => assert.equal(closed, 1));
  assert.deepEqual(received, { guidance: '', mode: 'redraw' });
});

test('nonempty guidance is passed unchanged as guided mode and is limited to 2000 characters', async () => {
  let received: { guidance: string; mode: string } | undefined;
  const onSubmit = async (request: { guidance: string; mode: string }) => { received = request; };
  render(<GuidedRegenerationDialog open onSubmit={onSubmit} onClose={() => {}} />);
  const input = screen.getByLabelText('指导意见（可选）') as HTMLTextAreaElement;
  fireEvent.change(input, { target: { value: '去掉背景口罩' } });
  assert.ok(screen.getByText('6 / 2000'));
  fireEvent.click(screen.getByRole('button', { name: '开始重新生成' }));
  await waitFor(() => assert.deepEqual(received, { guidance: '去掉背景口罩', mode: 'guided' }));
});

test('failed pre-dispatch request keeps the dialog open with the user draft', async () => {
  const onSubmit = async () => { throw new Error('本地 mock 暂不可用'); };
  render(<GuidedRegenerationDialog open onSubmit={onSubmit} onClose={() => {}} />);
  const input = screen.getByLabelText('指导意见（可选）') as HTMLTextAreaElement;
  fireEvent.change(input, { target: { value: '移除左上角文字' } });
  fireEvent.click(screen.getByRole('button', { name: '开始重新生成' }));
  await waitFor(() => assert.ok(screen.getByText('本地 mock 暂不可用')));
  assert.equal(input.value, '移除左上角文字');
  assert.ok(screen.getByRole('dialog', { name: '带指导意见重新生成' }));
});
