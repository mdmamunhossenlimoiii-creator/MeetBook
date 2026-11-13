import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const files = [
  'js/auth.js',
  'js/settings.js',
  'js/profile.js',
  'js/friends.js',
  'js/app.js',
  'js/messages.js'
];

for (const file of files) {
  test(`frontend module syntax: ${file}`, () => {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout || `node --check failed for ${file}`);
  });
}
