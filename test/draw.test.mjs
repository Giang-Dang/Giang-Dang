import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wrapText } from '../scripts/lib/draw.mjs';

const ELLIPSIS = String.fromCharCode(0x2026);

const byLength = (s) => s.length;

test('wrapText breaks greedily at word boundaries', () => {
  assert.deepEqual(wrapText(byLength, 'aaa bbb ccc ddd', 7, 3), ['aaa bbb', 'ccc ddd']);
});

test('wrapText ends the last kept line with an ellipsis when text overflows', () => {
  assert.deepEqual(wrapText(byLength, 'aaa bbb ccc ddd eee', 7, 2), ['aaa bbb', `ccc${ELLIPSIS}`]);
});

test('wrapText keeps a single word longer than the line on its own line', () => {
  assert.deepEqual(wrapText(byLength, 'abcdefghij kl', 5, 3), ['abcdefghij', 'kl']);
});
