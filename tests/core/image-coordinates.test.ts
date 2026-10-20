import assert from 'node:assert/strict';
import test from 'node:test';
import { mapPointerToContainedImage } from '../../src/core/image-coordinates.ts';

test('maps pointers into a contained image and ignores letterboxed padding', () => {
  const bounds = { left: 20, top: 10, width: 300, height: 300 };
  const image = { width: 200, height: 100 };

  assert.deepEqual(mapPointerToContainedImage(170, 160, bounds, image), {
    point: { x: 0.5, y: 0.5 },
    inside: true,
  });
  assert.equal(mapPointerToContainedImage(170, 20, bounds, image)?.inside, false);
});

test('returns null for invalid layout or source image dimensions', () => {
  assert.equal(mapPointerToContainedImage(0, 0, { left: 0, top: 0, width: 0, height: 10 }, { width: 1, height: 1 }), null);
  assert.equal(mapPointerToContainedImage(0, 0, { left: 0, top: 0, width: 10, height: 10 }, { width: 0, height: 1 }), null);
});
