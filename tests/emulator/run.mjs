// Runs the permission matrix (tests/rules-matrix/scenarios.mjs) against the REAL Firebase Firestore Emulator.
// It also proves that firestore.rules COMPILES: the emulator refuses to load rules with syntax errors.
// Only talks to the local emulator (demo-* project id), never to a real Firebase project.
//
//   cd tests/emulator && npm install && cd ../..
//   ./tests/emulator/node_modules/.bin/firebase emulators:exec --only firestore --project demo-meetbook "node tests/emulator/run.mjs"
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, increment, deleteField, Timestamp, collection, runTransaction } from 'firebase/firestore';
import { ACTORS, CAPS, SEED } from '../rules-matrix/scenarios.mjs';

const PROJECT = 'demo-meetbook';
if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('Run this through `firebase emulators:exec` so FIRESTORE_EMULATOR_HOST is set.'); process.exit(2); }

const conv = (v) => {
  if (Array.isArray(v)) return v.map(conv);
  if (v && typeof v === 'object') {
    if ('$srv' in v) return serverTimestamp();
    if ('$rel' in v) return Timestamp.fromMillis(Date.now() + v.$rel);
    if ('$inc' in v) return increment(v.$inc);
    if ('$del' in v) return deleteField();
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, conv(x)]));
  }
  return v;
};

let env;
try {
  env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') } });
} catch (e) { console.error('FIRESTORE RULES DID NOT COMPILE OR LOAD:\n', e.message || e); process.exit(1); }
console.log('firestore.rules compiled and loaded into the emulator.');

async function seed() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const entries = Object.entries(SEED);
    for (let i = 0; i < entries.length; i += 400) {
      const b = writeBatch(db);
      entries.slice(i, i + 400).forEach(([p, d]) => b.set(doc(db, p), conv(d)));
      await b.commit();
    }
  });
}

const attempt = async (db, cap, actorName, actor) => {
  const ref = doc(db, cap.path);
  const data = typeof cap.data === 'function' ? cap.data({ ...actor, name: actorName }) : cap.data;
  try {
    if (cap.op === 'get') await getDoc(ref);
    else if (cap.op === 'create') await setDoc(ref, conv(data));
    else if (cap.op === 'update') await updateDoc(ref, conv(data));
    else if (cap.op === 'delete') await deleteDoc(ref);
    return { ok: true };
  } catch (e) {
    return { ok: false, permission: /permission|insufficient/i.test(String(e.code || e.message)), error: String(e.message || e) };
  }
};

await seed();
let total = 0; const wrong = [];
for (const cap of CAPS) {
  for (const [name, actor] of Object.entries(ACTORS)) {
    const ctx = actor.uid ? env.authenticatedContext(actor.uid) : env.unauthenticatedContext();
    const r = await attempt(ctx.firestore(), cap, name, actor);
    total++;
    const want = cap.allow.includes(name);
    if (r.ok !== want || (!r.ok && !r.permission)) wrong.push(`[${cap.group}] ${cap.name} as ${name}: expected ${want ? 'ALLOW' : 'DENY'}, got ${r.ok ? 'ALLOW' : 'DENY'}${r.ok || r.permission ? '' : ` (NOT a permission error: ${r.error.slice(0, 160)})`}`);
    if (r.ok && cap.op !== 'get') await seed(); // a write succeeded: restore the seed so cases stay independent
  }
}
// Prove a real user can create a bot inbox item only in the same transaction as its quota increment.
{
  const db = env.authenticatedContext('u1').firestore();
  const day = new Date().toISOString().slice(0, 10);
  const quotaRef = doc(db, 'botInboxRateLimits', 'u1', 'bots', 'bot_01', 'days', day);
  const inboxRef = doc(collection(db, 'botInbox'));
  const submit = () => runTransaction(db, async (tx) => {
    const snap = await tx.get(quotaRef);
    const count = snap.exists() ? snap.data().count : 0;
    tx.set(quotaRef, { senderUid: 'u1', botId: 'bot_01', count: count + 1, lastAt: serverTimestamp() });
    tx.set(inboxRef, {
      fromUid: 'u1', botId: 'bot_01', chatId: 'bot_01_u1', text: 'hello',
      handled: false, createdAt: serverTimestamp(), quotaDay: day
    });
  });
  await submit();
  console.log('atomic bot inbox + quota transaction allowed');
  await assert.rejects(submit(), 'a second bot inbox message inside the cooldown must be rejected');
  console.log('bot inbox cooldown enforced by real Firestore Rules');
}
await env.cleanup();
console.log(`${total} cases run against the real emulator, ${wrong.length} mismatches.`);
if (wrong.length) { console.error(wrong.join('\n')); process.exit(1); }
