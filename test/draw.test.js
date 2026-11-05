import test from 'node:test';
import assert from 'node:assert/strict';
import { draw } from '../server/draw.js';

test('everyone gives and receives once, never to self or to excluded pairs', () => {
  const ids = [1, 2, 3, 4, 5, 6];
  const forbidden = [[1, 2], [3, 4]];
  for (let i = 0; i < 200; i++) {
    const r = draw(ids, forbidden);
    assert.equal(new Set(r.values()).size, ids.length);
    for (const [g, t] of r) {
      assert.notEqual(g, t);
      assert.ok(!forbidden.some(([a, b]) => (a === g && b === t) || (a === t && b === g)));
    }
  }
});

test('returns null when impossible', () => {
  assert.equal(draw([1, 2, 3], [[1, 2], [2, 3], [1, 3]]), null);
});
