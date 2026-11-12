// Permission matrix for firestore.rules, executed by our own rules interpreter (tests/rules-sim).
// Same data runs against the real Firebase Emulator in CI (tests/emulator/run.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTORS, CAPS, SEED } from './scenarios.mjs';
import { buildDb, runCase } from './engine.mjs';

const db = buildDb(SEED);

test('matrix data is sane: every allowed actor exists, update targets exist, create targets do not', () => {
  for (const c of CAPS) {
    for (const a of c.allow) assert.ok(ACTORS[a], `${c.name}: unknown actor ${a}`);
    if (c.op === 'update' || c.op === 'delete' || c.op === 'get') assert.ok(db.has(c.path), `${c.name}: ${c.path} not in seed`);
    if (c.op === 'create') assert.ok(!db.has(c.path), `${c.name}: ${c.path} already exists`);
  }
});

let maxReads = 0, maxUnique = 0, evaluated = 0;
for (const cap of CAPS) {
  test(`[${cap.group}] ${cap.name}  (${cap.op} ${cap.path})`, () => {
    const wrong = [];
    for (const [name, actor] of Object.entries(ACTORS)) {
      const want = cap.allow.includes(name);
      const v = runCase(cap, name, actor, db);
      evaluated++; maxReads = Math.max(maxReads, v.reads); maxUnique = Math.max(maxUnique, v.uniqueReads);
      if (v.allowed !== want) wrong.push(`${name}: expected ${want ? 'ALLOW' : 'DENY'} but got ${v.allowed ? 'ALLOW' : 'DENY'}${v.errors.length ? ` (errors: ${[...new Set(v.errors)].join('; ')})` : ''}`);
    }
    assert.deepEqual(wrong, [], wrong.join('\n'));
  });
}

test('rules stay within Firestore\'s limit of 10 document lookups per request', () => {
  // Firestore counts each distinct document once per request, so unique documents are what matter.
  assert.ok(evaluated > 1000, `only ${evaluated} evaluations`);
  assert.ok(maxUnique <= 10, `a request needs ${maxUnique} different documents`);
  assert.ok(maxReads <= 10, `${maxReads} get()/exists() calls (${maxUnique} distinct documents)`);
  console.log(`      (${evaluated} evaluations; at most ${maxReads} get/exists calls and ${maxUnique} distinct documents per request)`);
});
