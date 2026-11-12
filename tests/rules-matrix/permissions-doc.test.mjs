import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildDoc } from './generate-doc.mjs';

test('docs/PERMISSIONS.md is up to date with the permission matrix (run: node tests/rules-matrix/generate-doc.mjs)', () => {
  const file = readFileSync(new URL('../../docs/PERMISSIONS.md', import.meta.url), 'utf8');
  assert.equal(file, buildDoc());
});
