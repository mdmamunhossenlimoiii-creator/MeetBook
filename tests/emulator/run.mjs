// Runs the permission matrix (tests/rules-matrix/scenarios.mjs) against the REAL Firebase Firestore Emulator.
// It also proves that firestore.rules COMPILES: the emulator refuses to load rules with syntax errors.
// Only talks to the local emulator (demo-* project id), never to a real Firebase project.
//
//   cd tests/emulator && npm install && cd ../..
//   ./tests/emulator/node_modules/.bin/firebase emulators:exec --only firestore --project demo-meetbook "node tests/emulator/run.mjs"
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, increment, deleteField, Timestamp } from 'firebase/firestore';
import { ACTORS, CAPS, SEED } from '../rules-matrix/scenarios.mjs';

const PROJECT = 'demo-meetbook';
if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('Run this through `firebase emulators:exec` so FIRESTORE_EMULATOR_HOST is set.'); process.exit(2); }
const realFirestore = process.env.FIRESTORE_EMULATOR_HOST === 'fake:0' ? null : await import('firebase/firestore');

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
// Runner authorization hardening: negative tests against isolated REAL Firestore Emulator projects.
// Every fixture is synthetic. Each scenario is seeded before its authenticated client is created.
if (process.env.FIRESTORE_EMULATOR_HOST !== 'fake:0') {
  const denied = (promise, label) => assert.rejects(promise, undefined, label);
  const isolatedRunnerCase = async (projectId, documents, run) => {
    const isolated = await initializeTestEnvironment({
      projectId,
      firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') }
    });
    try {
      await isolated.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        for (const [path, data] of Object.entries(documents)) await setDoc(doc(db, path), data);
      });
      await run(isolated);
    } finally {
      await isolated.cleanup();
    }
  };

  await denied(getDoc(doc(env.authenticatedContext('runoff').firestore(), 'chats/bot_01_u1')),
    'disabled Runner must not read an assigned-bot chat');
  await denied(getDoc(doc(env.authenticatedContext('ghostRunner').firestore(), 'botState/ghostRunner')),
    'UID without a botRunners document must not access runner state');
  await denied(updateDoc(doc(env.authenticatedContext('run').firestore(), 'posts/p2'), { commentCount: -1 }),
    'Runner must not decrement a post comment counter');

  await isolatedRunnerCase('demo-meetbook-empty-runner', {
    'settings/global': { botsEnabled: true },
    'botRunners/emptyRunner': { enabled: true, botIds: [] },
    'botRunners/normalAsBot': { enabled: true, botIds: ['u2'] },
    'users/u2': { isBot: false },
    'chats/u1_u2': { type: 'private', members: ['u1', 'u2'] }
  }, async (isolated) => {
    await denied(getDoc(doc(isolated.authenticatedContext('emptyRunner').firestore(), 'botState/emptyRunner')),
      'empty botIds must deny runner state access');
    await denied(getDoc(doc(isolated.authenticatedContext('normalAsBot').firestore(), 'chats/u1_u2')),
      'a normal user in botIds must not make a human-only chat readable');
  });

  await isolatedRunnerCase('demo-meetbook-inactive-bot', {
    'settings/global': { botsEnabled: true },
    'botRunners/inactiveRunner': { enabled: true, botIds: ['bot_02'] },
    'users/bot_02': { isBot: true, active: false },
    'users/u2': { isBot: false, settings: { allowBotEngagement: true } },
    'chats/bot_02_u2': { type: 'private', members: ['bot_02', 'u2'] },
    'posts/p2': { uid: 'u2', visibility: 'public', reactions: {}, commentCount: 0 }
  }, async (isolated) => {
    const db = isolated.authenticatedContext('inactiveRunner').firestore();
    await denied(getDoc(doc(db, 'chats/bot_02_u2')),
      'inactive assigned bot must not authorize private-chat access');
    await denied(setDoc(doc(db, 'posts/p2/comments/new'), {
      uid: 'bot_02', ai: true, text: 'hello', createdAt: serverTimestamp()
    }), 'inactive assigned bot must not publish a comment');
    await denied(updateDoc(doc(db, 'posts/p2'), {
      reactions: { bot_02: 'love' }, lastBotReactionBy: 'bot_02'
    }), 'inactive assigned bot must not react to a post');
  });

  await isolatedRunnerCase('demo-meetbook-global-stop', {
    'settings/global': { botsEnabled: false },
    'botRunners/run': { enabled: true, botIds: ['bot_01'] },
    'users/bot_01': { isBot: true, active: true, autoPost: true, autoComment: true, autoReaction: true, chatEnabled: true },
    'users/u2': { isBot: false },
    'chats/bot_01_u2': { type: 'private', members: ['bot_01', 'u2'] }
  }, async (isolated) => {
    const db = isolated.authenticatedContext('run').firestore();
    await denied(getDoc(doc(db, 'chats/bot_01_u2')),
      'global botsEnabled=false must deny Runner chat access');
    await denied(getDoc(doc(db, 'botState/run')),
      'global botsEnabled=false must deny Runner state access');
  });

  await isolatedRunnerCase('demo-meetbook-missing-global', {
    'botRunners/run': { enabled: true, botIds: ['bot_01'] }
  }, async (isolated) => {
    await denied(getDoc(doc(isolated.authenticatedContext('run').firestore(), 'botState/run')),
      'missing settings/global must fail closed and deny Runner access');
  });
  console.log('Runner negative security tests passed: disabled, unknown UID, empty allowlist, non-bot allowlist, inactive bot comment/reaction, global kill switch, missing settings/global, and counter decrement');

  await isolatedRunnerCase('demo-meetbook-runner-atomic-actions', {
    'settings/global': { botsEnabled: true, botToBotComments: false },
    'botRunners/run': { enabled: true, botIds: ['bot_01'] },
    'users/bot_01': { isBot: true, active: true, autoPost: true, autoComment: true, autoReaction: true, chatEnabled: true },
    'users/u2': { isBot: false, settings: { allowBotEngagement: true } },
    'posts/p2': { uid: 'u2', visibility: 'public', reactions: {}, commentCount: 0 }
  }, async (isolated) => {
    const db = isolated.authenticatedContext('run').firestore();
    await denied(updateDoc(doc(db, 'posts/p2'), { commentCount: 1 }),
      'Runner cannot fabricate a comment count without a same-batch comment');
    const batch = writeBatch(db);
    batch.set(doc(db, 'posts/p2/comments/bot_01'), {
      uid: 'bot_01', authorName: 'Bot One', text: 'hello', ai: true, createdAt: serverTimestamp()
    });
    batch.update(doc(db, 'posts/p2'), { commentCount: 1, lastBotCommentBy: 'bot_01' });
    await batch.commit();
    const post = await getDoc(doc(db, 'posts/p2'));
    assert.equal(post.data().commentCount, 1);
    await updateDoc(doc(db, 'posts/p2'), {
      reactions: { bot_01: 'love' }, lastBotReactionBy: 'bot_01'
    });
    console.log('active assigned bot comment+counter atomic batch and identity-bound reaction allowed');
  });
}

// Prove a real user can create a bot inbox item only in the same transaction as its quota increment.
// The lightweight harness fake does not model atomic multi-document write batches.
if (process.env.FIRESTORE_EMULATOR_HOST !== 'fake:0') {
{
  const db = env.authenticatedContext('u1').firestore();
  const quotaRef = doc(db, 'botInboxRateLimits', 'u1', 'bots', 'bot_01');
  let inboxNumber = 0;
  const submit = async () => {
    const inboxRef = doc(db, 'botInbox', `atomic-${++inboxNumber}`);
    const snap = await getDoc(quotaRef);
    const count = snap.exists() ? snap.data().count : 0;
    const windowAt = snap.exists() ? snap.data().windowStartedAt.toMillis() : 0;
    const expired = !snap.exists() || Date.now() - windowAt >= 86_400_000;
    const batch = writeBatch(db);
    batch.set(quotaRef, {
      senderUid: 'u1', botId: 'bot_01', count: expired ? 1 : count + 1,
      windowStartedAt: expired ? serverTimestamp() : snap.data().windowStartedAt, lastAt: serverTimestamp()
    });
    batch.set(inboxRef, {
      fromUid: 'u1', botId: 'bot_01', chatId: 'bot_01_u1', text: 'hello',
      handled: false, createdAt: serverTimestamp()
    });
    await batch.commit();
  };
  await submit();
  console.log('atomic bot inbox + quota transaction allowed');
  await assert.rejects(submit());
  console.log('bot inbox cooldown enforced by real Firestore Rules');

  await env.withSecurityRulesDisabled(async (ctx) => updateDoc(doc(ctx.firestore(), 'botInboxRateLimits/u1/bots/bot_01'), {
    count: 20, windowStartedAt: Timestamp.fromMillis(Date.now() - 3_600_000),
    lastAt: Timestamp.fromMillis(Date.now() - 20_000)
  }));
  await assert.rejects(submit());
  console.log('20-message rolling-window cap enforced');

  const expiredAt = Date.now() - 25 * 3_600_000;
  await env.withSecurityRulesDisabled(async (ctx) => updateDoc(doc(ctx.firestore(), 'botInboxRateLimits/u1/bots/bot_01'), {
    count: 20, windowStartedAt: Timestamp.fromMillis(expiredAt), lastAt: Timestamp.fromMillis(expiredAt)
  }));
  await submit();
  const reset = await getDoc(quotaRef);
  if (reset.data().count !== 1) throw new Error('expired quota window did not reset to one');
  console.log('rolling 24-hour quota resets after expiry');

  // Profile metadata visibility and consent projections must match canonical user settings atomically.
  const ownerDb = env.authenticatedContext('u3').firestore();
  await assert.rejects(updateDoc(doc(ownerDb, 'publicProfiles/u3'), { profileVisibility: 'everyone' }));
  await assert.rejects(updateDoc(doc(ownerDb, 'botEngagement/u3'), { allowBotMemory: true, updatedAt: serverTimestamp() }));
  const profileBatch = writeBatch(ownerDb);
  profileBatch.update(doc(ownerDb, 'users/u3'), {
    settings: {
      allowMessages: 'friends', profileVisibility: 'everyone', defaultVisibility: 'public',
      allowBotEngagement: false, allowBotMemory: true
    }
  });
  profileBatch.set(doc(ownerDb, 'publicProfiles/u3'), { profileVisibility: 'everyone' }, { merge: true });
  profileBatch.set(doc(ownerDb, 'botEngagement/u3'), {
    allowBotEngagement: false, allowBotMemory: true, updatedAt: serverTimestamp()
  }, { merge: true });
  await profileBatch.commit();
  await assert.doesNotReject(getDoc(doc(env.authenticatedContext('u4').firestore(), 'publicProfiles/u3')));
  console.log('profile visibility and bot-memory consent require canonical atomic settings updates');

  const memoryOwnerDb = env.authenticatedContext('u2').firestore();
  const ownMemories = await realFirestore.getDocs(realFirestore.query(realFirestore.collection(memoryOwnerDb, 'botMemories'), realFirestore.where('ownerUid', '==', 'u2')));
  if (ownMemories.size !== 2) throw new Error('memory owner could not list all of their own saved summaries');
  await assert.rejects(realFirestore.getDocs(realFirestore.query(realFirestore.collection(env.authenticatedContext('u4').firestore(), 'botMemories'), realFirestore.where('ownerUid', '==', 'u2'))));
  console.log('bot-memory list queries are restricted to the owning user');

  const disableMemoryBatch = writeBatch(memoryOwnerDb);
  disableMemoryBatch.update(doc(memoryOwnerDb, 'users/u2'), {
    settings: {
      allowMessages: 'friends', profileVisibility: 'friends', defaultVisibility: 'public',
      allowBotEngagement: true, allowBotMemory: false
    }
  });
  disableMemoryBatch.set(doc(memoryOwnerDb, 'botEngagement/u2'), {
    allowBotEngagement: true, allowBotMemory: false, updatedAt: serverTimestamp()
  }, { merge: true });
  ownMemories.docs.forEach((memory) => disableMemoryBatch.delete(memory.ref));
  await disableMemoryBatch.commit();
  const afterDisable = await realFirestore.getDocs(realFirestore.query(realFirestore.collection(memoryOwnerDb, 'botMemories'), realFirestore.where('ownerUid', '==', 'u2')));
  if (!afterDisable.empty) throw new Error('turning memory off did not delete saved summaries');
  console.log('turning memory off atomically revokes consent and deletes saved summaries');
 
  await isolatedRunnerCase('demo-meetbook-configured-bot-daily-limit', {
    'settings/global': { botsEnabled: true },
    'botRunners/limitRunner': { enabled: true, botIds: ['bot_28'] },
    'users/bot_28': { isBot: true, active: true, autoPost: true, autoComment: true, autoReaction: true, chatEnabled: true, dailyLimit: 2 },
    'botRateLimits/bot_28': {
      botId: 'bot_28', kind: 'botDaily', count: 1,
      windowStartedAt: Timestamp.fromMillis(Date.now() - 120_000),
      lastAt: Timestamp.fromMillis(Date.now() - 120_000)
    }
  }, async (isolated) => {
    const db = isolated.authenticatedContext('limitRunner').firestore();
    await updateDoc(doc(db, 'botRateLimits/bot_28'), { count: 2, lastAt: serverTimestamp() });
    await denied(updateDoc(doc(db, 'botRateLimits/bot_28'), { count: 3, lastAt: serverTimestamp() }),
      'a bot configured for two daily actions must not reserve a third action');
    console.log('per-bot dailyLimit is enforced by real Firestore Rules');
  });

  await isolatedRunnerCase('demo-meetbook-global-activity-and-gemini-budgets', {
    'settings/global': { botsEnabled: true },
    'botRunners/globalRunner': { enabled: true, botIds: ['bot_01'] },
    'users/bot_01': { isBot: true, active: true, autoPost: true, autoComment: true, autoReaction: true, chatEnabled: true },
    'botGlobalRateLimits/global': {
      kind: 'globalDaily', count: 59,
      windowStartedAt: Timestamp.fromMillis(Date.now() - 120_000),
      lastAt: Timestamp.fromMillis(Date.now() - 120_000)
    },
    'botGeminiRateLimits/global': {
      kind: 'geminiDaily', count: 59,
      windowStartedAt: Timestamp.fromMillis(Date.now() - 120_000),
      lastAt: Timestamp.fromMillis(Date.now() - 120_000)
    }
  }, async (isolated) => {
    const db = isolated.authenticatedContext('globalRunner').firestore();
    await updateDoc(doc(db, 'botGlobalRateLimits/global'), { count: 60, lastAt: serverTimestamp() });
    await denied(updateDoc(doc(db, 'botGlobalRateLimits/global'), { count: 61, lastAt: serverTimestamp() }),
      'global daily activity must stop at 60 actions');
    await updateDoc(doc(db, 'botGeminiRateLimits/global'), { count: 60, lastAt: serverTimestamp() });
    await denied(updateDoc(doc(db, 'botGeminiRateLimits/global'), { count: 61, lastAt: serverTimestamp() }),
      'Gemini requests must stop at 60 per day');
    console.log('global activity and Gemini daily budgets are enforced by real Firestore Rules');
  });

}
}
await env.cleanup();
console.log(`${total} cases run against the real emulator, ${wrong.length} mismatches.`);
if (wrong.length) { console.error(wrong.join('\n')); process.exit(1); }