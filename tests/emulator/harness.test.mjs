// Checks run.mjs itself with fakes (see fake/loader.mjs). The REAL emulator run happens only in CI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

test('emulator runner logic works end to end against the interpreter-backed fakes', async () => {
  const out = await new Promise((resolve) => {
    const c = spawn('node', ['--import', './tests/emulator/fake/register.mjs', 'tests/emulator/run.mjs'], { env: { ...process.env, FIRESTORE_EMULATOR_HOST: 'fake:0' } });
    let s = ''; c.stdout.on('data', (d) => { s += d; }); c.stderr.on('data', (d) => { s += d; });
    c.on('close', (code) => resolve({ code, s }));
  });
  assert.equal(out.code, 0, out.s);
  assert.match(out.s, /\d+ cases run .*0 mismatches/);
});
