import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectClientBoundary } from './check-client-boundary.mjs';

test('both React entry graphs stay free of server and provider modules', async () => {
  const inputs = await inspectClientBoundary();
  assert.ok(inputs.some((input) => input.toLowerCase().includes('src/guidance/react/index.ts')));
  assert.ok(inputs.some((input) => input.toLowerCase().includes('src/react/index.ts')));
});
