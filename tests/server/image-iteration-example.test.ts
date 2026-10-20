import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import type { AddressInfo } from 'node:net';
import { createExampleApp } from '../../examples/react-express/server.ts';

test('local iteration mock returns a visible version tied to the submitted source snapshot', async () => {
  const app = createExampleApp();
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address() as AddressInfo;
    const origin = `http://127.0.0.1:${address.port}`;
    const response = await fetch(`${origin}/api/image-iterations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'guided', sourceId: 'demo-version-v2', sourceVersionId: 'demo-version-v2', operationId: 'op-guided-demo', guidance: '移除遮挡物，保留商品构图' }),
    });
    assert.equal(response.status, 200, await response.clone().text());
    const body = await response.json() as {
      candidate: { operationType: string; sourceVersionId: string; generationPrompt: string; operationPromptUsed: string; userGuidance: string };
      result: { imageUrl: string; operationId: string };
    };
    assert.equal(body.candidate.operationType, 'guided-regenerate');
    assert.equal(body.candidate.sourceVersionId, 'demo-version-v2');
    assert.match(body.candidate.generationPrompt, /移除遮挡物/);
    assert.equal(body.candidate.operationPromptUsed, body.candidate.generationPrompt);
    assert.equal(body.candidate.userGuidance, '移除遮挡物，保留商品构图');
    assert.equal(body.result.operationId, 'op-guided-demo');
    const image = await fetch(new URL(body.result.imageUrl, origin));
    assert.equal(image.status, 200);
    assert.match(await image.text(), /<svg/);
  } finally {
    server.close();
  }
});

test('iteration mock rejects a client supplied source outside the host allowlist', async () => {
  const app = createExampleApp();
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/api/image-iterations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'redraw', sourceId: 'https://remote.invalid/image.png', sourceVersionId: 'outside', operationId: 'op-invalid', guidance: '' }),
    });
    assert.equal(response.status, 404);
    assert.match(await response.text(), /无法读取当前选中版本/);
  } finally {
    server.close();
  }
});

test('pending operation cannot be resubmitted with the same operation id and can retry only the image stage', async () => {
  const app = createExampleApp();
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address() as AddressInfo;
    const origin = `http://127.0.0.1:${address.port}`;
    const request = () => fetch(`${origin}/api/image-iterations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-demo-fail-iteration': 'true' },
      body: JSON.stringify({ mode: 'guided', sourceId: 'demo-version-v2', sourceVersionId: 'demo-version-v2', operationId: 'op-retry-demo', guidance: '移除遮挡物' }),
    });
    const first = await request();
    assert.equal(first.status, 502);
    assert.match(await first.text(), /图像生成失败/);
    const duplicate = await request();
    assert.equal(duplicate.status, 409);
    assert.match(await duplicate.text(), /待处理/);
    const retry = await fetch(`${origin}/api/image-iterations/op-retry-demo/retry-image`, { method: 'POST' });
    assert.equal(retry.status, 200);
    const result = await retry.json() as { candidate: { generationPrompt: string; operationType: string }; result: { imageUrl: string } };
    assert.match(result.candidate.generationPrompt, /移除遮挡物/);
    assert.equal(result.candidate.operationType, 'guided-regenerate');
    assert.match(result.result.imageUrl, /op-retry-demo/);
  } finally { server.close(); }
});
