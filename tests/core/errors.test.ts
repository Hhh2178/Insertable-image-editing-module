import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ImageEditFailureError, toSafeImageEditFailure } from '../../src/core/errors.ts';

test('serializes only safe error fields and does not expose provider causes', () => {
  const error = new ImageEditFailureError({
    code: 'provider_rejected', stage: 'submit', safeMessage: '图像服务暂时无法处理此请求。',
    retryable: false, submissionState: 'not_submitted',
  }, new Error('Authorization: Bearer secret-must-not-leak response body with private data'));
  const serialized = JSON.stringify(toSafeImageEditFailure(error));
  assert.match(serialized, /provider_rejected/);
  assert.doesNotMatch(serialized, /secret-must-not-leak|Authorization|private data/);
});

test('normalizes unexpected failures without serializing raw messages', () => {
  const safe = toSafeImageEditFailure(new Error('raw response containing confidential material'));
  assert.equal(safe.stage, 'result');
  assert.equal(safe.submissionState, 'unknown');
  assert.doesNotMatch(JSON.stringify(safe), /confidential material/);
});
