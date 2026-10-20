import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { JSDOM } from 'jsdom';
import React from 'react';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
Object.assign(globalThis, {
  window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
  MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
});
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true, writable: true });

const { cleanup, fireEvent, render, screen, waitFor } = await import('@testing-library/react');
const { App } = await import('../../src/App.tsx');
afterEach(() => cleanup());

test('guided regeneration posts the fixed selected version and appends a visible session version', async () => {
  let requestBody: Record<string, unknown> | undefined;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({
      candidate: {
        operationId: requestBody.operationId,
        sourceId: requestBody.sourceId,
        sourceVersionId: requestBody.sourceVersionId,
        operationType: 'guided-regenerate',
        generationPrompt: 'Complete revised prompt',
        operationPromptUsed: 'Complete revised prompt',
        userGuidance: requestBody.guidance,
      },
      result: { operationId: requestBody.operationId, sourceId: requestBody.sourceId, imageUrl: '/api/mock-images/result.svg', promptUsed: 'Complete revised prompt' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  try {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /带指导意见重生/ }));
    fireEvent.change(screen.getByLabelText('指导意见（可选）'), { target: { value: '不要出现口罩' } });
    fireEvent.click(screen.getByRole('button', { name: '开始重新生成' }));
    await waitFor(() => assert.ok(screen.getByRole('button', { name: /V3 · 指导重生/ })));
    assert.equal(requestBody?.mode, 'guided');
    assert.equal(requestBody?.sourceId, 'demo-version-v2');
    assert.equal(requestBody?.sourceVersionId, 'demo-version-v2');
    assert.equal(requestBody?.guidance, '不要出现口罩');
    assert.equal(screen.queryByRole('dialog', { name: '带指导意见重新生成' }), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('generation retry uses the pending operation endpoint without submitting guidance a second time', async () => {
  const requests: Array<{ url: string; body?: string }> = [];
  const originalFetch = globalThis.fetch;
  let call = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, body: typeof init?.body === 'string' ? init.body : undefined });
    call += 1;
    if (call === 1) return new Response(JSON.stringify({ failure: { safeMessage: '图像生成明确失败', stage: 'generate', submissionState: 'not_submitted' } }), { status: 502 });
    const requestBody = JSON.parse(requests[0].body ?? '{}') as Record<string, unknown>;
    return new Response(JSON.stringify({
      candidate: {
        operationId: requestBody.operationId, sourceId: requestBody.sourceId, sourceVersionId: requestBody.sourceVersionId,
        operationType: 'guided-regenerate', generationPrompt: 'Retained rewritten prompt', operationPromptUsed: 'Retained rewritten prompt',
      },
      result: { operationId: requestBody.operationId, sourceId: requestBody.sourceId, imageUrl: '/api/mock-images/retry.svg', promptUsed: 'Retained rewritten prompt' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  try {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /带指导意见重生/ }));
    fireEvent.change(screen.getByLabelText('指导意见（可选）'), { target: { value: '保留商品，去掉口罩' } });
    fireEvent.click(screen.getByRole('button', { name: '开始重新生成' }));
    fireEvent.click(await screen.findByRole('button', { name: /仅重试生图/ }));
    await waitFor(() => assert.ok(screen.getByRole('button', { name: /V3 · 指导重生/ })));
    assert.equal(requests.length, 2);
    assert.match(requests[1].url, /\/api\/image-iterations\/op-[^/]+\/retry-image$/);
    assert.equal(requests[1].body, undefined);
  } finally { globalThis.fetch = originalFetch; }
});

test('ordinary redraw submits an empty guidance operation against the currently selected version', async () => {
  let requestBody: Record<string, unknown> | undefined;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({
      candidate: {
        operationId: requestBody.operationId, sourceId: requestBody.sourceId, sourceVersionId: requestBody.sourceVersionId,
        operationType: 'redraw', generationPrompt: 'Selected version prompt', operationPromptUsed: 'Selected version prompt', userGuidance: '',
      },
      result: { operationId: requestBody.operationId, sourceId: requestBody.sourceId, imageUrl: '/api/mock-images/redraw.svg', promptUsed: 'Selected version prompt' },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  try {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /按当前方案重抽/ }));
    await waitFor(() => assert.ok(screen.getByRole('button', { name: /V3 · 按当前方案重抽/ })));
    assert.equal(requestBody?.mode, 'redraw');
    assert.equal(requestBody?.sourceId, 'demo-version-v2');
    assert.equal(requestBody?.sourceVersionId, 'demo-version-v2');
    assert.equal(requestBody?.guidance, '');
    assert.equal(screen.queryByRole('dialog'), null);
  } finally { globalThis.fetch = originalFetch; }
});
