import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { ImageEditProvider } from '../../src/core/types.ts';
import { createExampleApp } from '../../examples/react-express/server.ts';

test('isolated Express example serves mock edit results and preserves operation/source identity', async () => {
  const providerInputs: unknown[] = [];
  const provider: ImageEditProvider = {
    generate: async (input) => {
      providerInputs.push(input);
      return { imageUrl: 'https://example.invalid/mock-result.png', provider: 'apimart', model: input.model };
    },
  };
  const app = createExampleApp({
    loadImage: async (imageRef) => {
      assert.equal(imageRef, 'demo://sun-hat/version-v2');
      return { bytes: Buffer.from([1, 2, 3]), mimeType: 'image/png' };
    },
    inspectImage: async () => ({ width: 3, height: 1, format: 'png' }),
    provider,
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/api/image-edit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operationId: 'op-demo-1', sourceId: 'demo-version-v2', imageRef: 'demo://sun-hat/version-v2', instruction: '修正标注区域' }),
    });
    assert.equal(response.status, 200);
    const result = await response.json() as { operationId: string; sourceId: string; imageUrl: string; promptUsed: string };
    assert.equal(result.operationId, 'op-demo-1');
    assert.equal(result.sourceId, 'demo-version-v2');
    assert.equal(result.imageUrl, 'https://example.invalid/mock-result.png');
    assert.equal(providerInputs.length, 1);
    assert.equal((providerInputs[0] as { images: unknown[] }).images.length, 1);
  } finally {
    server.close();
  }
});

test('example maps invalid requests to safe structured errors', async () => {
  const app = createExampleApp({
    loadImage: async () => { throw new Error('private loader detail'); },
    inspectImage: async () => ({ width: 1, height: 1, format: 'png' }),
    provider: { generate: async () => { throw new Error('must not call'); } },
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/api/image-edit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operationId: 'op', sourceId: '', imageRef: 'private-ref', instruction: 'edit' }),
    });
    assert.equal(response.status, 400);
    const body = await response.text();
    assert.match(body, /source_required/);
    assert.doesNotMatch(body, /private loader detail/);
  } finally {
    server.close();
  }
});
