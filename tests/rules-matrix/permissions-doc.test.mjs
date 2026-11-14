import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildDoc } from './generate-doc.mjs';

test('docs/PERMISSIONS.md is up to date with the permission matrix (run: node tests/rules-matrix/generate-doc.mjs)', () => {
  const file = readFileSync(new URL('../../docs/PERMISSIONS.md', import.meta.url), 'utf8');
  const normalize = (value) => value.replace(/\r\n/g, '\n').split('\n').map((line) => line.trimEnd()).filter((line) => line.trim()).join('\n');
  const actual = normalize(file).split('\n');
  const expected = normalize(buildDoc()).split('\n');
  const mismatch = expected.findIndex((line, index) => line !== actual[index]);
  assert.equal(mismatch, -1, mismatch < 0 ? '' : `permission matrix differs at line ${mismatch + 1}: actual=${JSON.stringify(actual[mismatch])}; expected=${JSON.stringify(expected[mismatch])}`);
});
