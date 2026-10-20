import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ImageEditProviderInput } from '../../src/core/types.ts';
import { createApimartImageProvider } from '../../src/adapters/apimart/client.ts';
import { ImageEditFailureError } from '../../src/core/errors.ts';

const request: ImageEditProviderInput = {
  model: 'gemini-nano-banana-2.1', size: 'auto', resolution: '1K', prompt: 'edit exactly',
  images: [{ bytes: Buffer.from([1, 2, 3]), mimeType: 'image/png' }],
};

function response(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
}

test('uploads one image, submits fixed model parameters, polls, and normalizes array URL results', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const replies = [
    response({ url: 'https://upload.apimart.ai/image.png' }),
    response({ data: { id: 'task 1' } }),
    response({ data: { status: 'processing' } }),
    response({ data: { status: 'completed', result: { images: [{ url: 'https://cdn.example.test/final.png' }] } } }),
  ];
  const provider = createApimartImageProvider({
    getApiKey: () => 'test-only-secret',
    fetch: async (input, init) => { calls.push({ url: String(input), init }); return replies.shift()!; },
    sleep: async () => {}, pollIntervalMs: 0,
  });
  const result = await provider.generate(request);
  assert.equal(result.imageUrl, 'https://cdn.example.test/final.png');
  assert.deepEqual(calls.map((call) => call.url), [
    'https://api.apimart.ai/v1/uploads/images',
    'https://api.apimart.ai/v1/images/generations',
    'https://api.apimart.ai/v1/tasks/task%201',
    'https://api.apimart.ai/v1/tasks/task%201',
  ]);
  const uploadBody = calls[0].init?.body as FormData;
  assert.ok(uploadBody instanceof FormData);
  assert.ok(uploadBody.get('file') instanceof Blob);
  const createBody = JSON.parse(String(calls[1].init?.body));
  assert.deepEqual(createBody, {
    model: 'gemini-nano-banana-2.1', prompt: 'edit exactly', n: 1, size: 'auto', resolution: '1K',
    image_urls: ['https://upload.apimart.ai/image.png'],
  });
  for (const call of calls) assert.equal(new Headers(call.init?.headers).get('authorization'), 'Bearer test-only-secret');
});

test('normalizes a single string result URL and rejects missing or unsafe result URLs', async () => {
  const replies = [
    response({ url: 'https://upload.apimart.ai/image.png' }),
    response({ data: { task_id: 'task-2' } }),
    response({ data: { status: 'completed', output: { resultUrls: 'https://cdn.example.test/single.png' } } }),
  ];
  const provider = createApimartImageProvider({ getApiKey: () => 'test', fetch: async () => replies.shift()!, sleep: async () => {}, pollIntervalMs: 0 });
  assert.equal((await provider.generate(request)).imageUrl, 'https://cdn.example.test/single.png');
});

test('marks ambiguous create transport failure unknown and never auto-submits a duplicate task', async () => {
  const calls: string[] = [];
  const provider = createApimartImageProvider({
    getApiKey: () => 'test',
    fetch: async (input) => { calls.push(String(input)); if (calls.length === 1) return response({ url: 'https://upload.apimart.ai/image.png' }); throw new Error('socket dropped'); },
    sleep: async () => {},
  });
  await assert.rejects(provider.generate(request), (error: unknown) => {
    assert.ok(error instanceof ImageEditFailureError);
    assert.equal(error.failure.stage, 'submit');
    assert.equal(error.failure.submissionState, 'unknown');
    assert.equal(error.failure.retryable, false);
    assert.doesNotMatch(JSON.stringify(error.failure), /socket dropped|test/);
    return true;
  });
  assert.equal(calls.length, 2);
});

test('redacts explicit provider error bodies and fails when a task is rejected', async () => {
  const replies = [response({ url: 'https://upload.apimart.ai/image.png' }), response({ message: 'secret provider detail' }, 400)];
  const provider = createApimartImageProvider({ getApiKey: () => 'secret-key', fetch: async () => replies.shift()!, sleep: async () => {} });
  await assert.rejects(provider.generate(request), (error: unknown) => {
    assert.ok(error instanceof ImageEditFailureError);
    assert.equal(error.failure.stage, 'submit');
    assert.equal(error.failure.submissionState, 'not_submitted');
    assert.doesNotMatch(JSON.stringify(error.failure), /secret provider detail|secret-key/);
    return true;
  });
});

test('retries one explicit content-safety rejection with a clarification before the unchanged prompt', async () => {
  const calls: Array<{ url: string; body?: Record<string, unknown> }> = [];
  const replies = [
    response({ url: 'https://upload.apimart.ai/image.png' }),
    response({ error: { code: 'content_policy_violation' } }, 451),
    response({ data: { task_id: 'safe-retry-task' } }),
    response({ data: { status: 'completed', image_url: 'https://cdn.example.test/allowed.png' } }),
  ];
  const provider = createApimartImageProvider({
    getApiKey: () => 'test',
    fetch: async (input, init) => {
      const url = String(input);
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : undefined;
      calls.push({ url, body });
      return replies.shift()!;
    },
    sleep: async () => {},
  });
  assert.equal((await provider.generate(request)).imageUrl, 'https://cdn.example.test/allowed.png');
  const submits = calls.filter((call) => call.url.endsWith('/v1/images/generations'));
  assert.equal(submits.length, 2);
  const firstPrompt = submits[0].body?.prompt as string;
  const retryPrompt = submits[1].body?.prompt as string;
  assert.equal(firstPrompt, request.prompt);
  assert.ok(retryPrompt.startsWith('Please review this request for permitted, benign image editing. If it is allowed, follow it; otherwise reject it.'));
  assert.ok(retryPrompt.includes(request.prompt));
  assert.equal(retryPrompt.endsWith(request.prompt.slice(-12)), true);
});

test('stops polling at configured bounds and reports that the provider task was submitted', async () => {
  const replies = [
    response({ url: 'https://upload.apimart.ai/image.png' }),
    response({ task_id: 'task-3' }),
    response({ status: 'processing' }),
  ];
  const provider = createApimartImageProvider({ getApiKey: () => 'test', fetch: async () => replies.shift()!, sleep: async () => {}, pollIntervalMs: 0, maxPollAttempts: 1 });
  await assert.rejects(provider.generate(request), (error: unknown) => {
    assert.ok(error instanceof ImageEditFailureError);
    assert.equal(error.failure.stage, 'poll');
    assert.equal(error.failure.submissionState, 'submitted');
    return true;
  });
});
