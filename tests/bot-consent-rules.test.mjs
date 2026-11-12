// Bot consent, verified for real: the bot runner is executed against a mock Firestore that judges EVERY request
// with the actual firestore.rules text (tests/mock-rules.mjs). So consent is enforced twice here:
// by the script's own checks AND by the rules, and the rules are probed directly with hand-made REST calls.
// Caveat: the rules engine is our interpreter, not Google's; the same scenarios run on the real emulator in CI
// (tests/emulator/run.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { startMock } from './mock-firestore.mjs';
import { BOTS } from '../js/bots-data.js';
import { firebaseConfig } from '../js/firebase-config.js';

// The runner integration requires the owner's new MeetBook Firebase Web App values.
// Keep the rules-only cases active while the config is intentionally unconfigured.
const botRunnerConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

const exec = (args, env) => new Promise((resolve) => {
  const c = spawn('node', args, { env: { ...process.env, ...env } });
  let stdout = '', stderr = '';
  c.stdout.on('data', (d) => { stdout += d; }); c.stderr.on('data', (d) => { stderr += d; });
  c.on('close', (status) => resolve({ status, stdout, stderr }));
});
const now = new Date();
const post = (uid, text, more = {}) => ({ uid, authorName: uid, text, image: '', videoUrl: '', visibility: 'public', audience: [], groupId: null, reactions: {}, commentCount: 0, shareCount: 0, createdAt: now, ...more });
const seed = () => {
  const s = {};
  BOTS.forEach((b) => { s[`users/${b.id}`] = { name: b.name, isBot: true, banned: false }; });
  return {
    ...s,
    'botRunners/runner1': { enabled: true },
    'settings/global': { botsEnabled: true, botToBotComments: false },
    'users/runner1': { name: 'Runner account', banned: false },
    'users/u1': { name: 'Rina Akter', banned: false, settings: { allowBotEngagement: true } },
    'users/u2': { name: 'Sam', banned: false, settings: { allowBotEngagement: false } },
    'users/u3': { name: 'Tina (never opened settings)', banned: false },
    'posts/p1': post('u1', "Went to Cox's Bazar with friends, the sea was amazing! Best trip ever."),
    'posts/p2': post('u2', 'Lovely travel photo from my trip to the beach'),
    'posts/p3': post('u3', 'Amazing travel trip to the sea with friends'),
    'chats/bot_06_u2': { type: 'private', members: ['bot_06', 'u2'] },
    'botInbox/i1': { botId: 'bot_06', fromUid: 'u2', chatId: 'bot_06_u2', text: 'hello', handled: false, createdAt: now }
  };
};
const env = (m, more = {}) => ({ BOT_RUNNER_EMAIL: 'r@x.com', BOT_RUNNER_PASSWORD: 'secret', AUTH_URL: m.url, FS_URL: m.url, BOT_POSTS: '1', BOT_COMMENTS: '10', ...more });

const DOCS = '/v1/projects/test-proj/databases/(default)/documents';
async function asRunner(m) {
  const r = await fetch(`${m.url}/v1/accounts:signInWithPassword`, { method: 'POST', body: JSON.stringify({ password: 'secret' }), headers: { 'Content-Type': 'application/json' } });
  const { idToken } = await r.json();
  const call = async (method, path, body) => {
    const res = await fetch(`${m.url}${DOCS}/${path}`, { method, headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return res.status;
  };
  const S = (v) => ({ stringValue: v });
  const comment = (uid, ai = true) => ({ fields: { uid: S(uid), authorName: S('x'), text: S('hello'), ai: { booleanValue: ai }, createdAt: { timestampValue: new Date().toISOString() } } });
  return { call, S, comment };
}

test('rules + runner: the full run is never denied, and only consenting users are touched', { skip: !botRunnerConfigured }, async () => {
  const m = await startMock({ seed: seed(), rules: true });
  try {
    const r = await exec(['scripts/bot-runner.mjs'], env(m));
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.deepEqual(m.denied, [], 'a legitimate runner run must not hit a rules denial (otherwise it would fail on real Firebase)');
    assert.equal(m.ids('posts/p1/comments').length, 1, 'opted-in user gets engagement');
    assert.equal(m.ids('posts/p2/comments').length, 0, 'explicit opt-out: nothing');
    assert.equal(m.ids('posts/p3/comments').length, 0, 'no setting at all = default OFF: nothing');
    assert.deepEqual(m.get('posts/p2').reactions, {});
    assert.deepEqual(m.get('posts/p3').reactions, {});
    assert.equal(m.get('posts/p2').commentCount + m.get('posts/p3').commentCount, 0);
    assert.equal(m.ids('chats/bot_06_u2/messages').length, 1, 'bot chat reply passes the rules (runner may read private chats with a bot)');
    assert.ok(m.ids('posts').length >= 4, 'bot post created under rules');
  } finally { await m.close(); }
});

test('rules: even a hand-made request cannot make a bot engage with a user who did not opt in', async () => {
  const m = await startMock({ seed: seed(), rules: true });
  try {
    const { call, S, comment } = await asRunner(m);
    // blocked: u2 opted out, u3 never opted in
    assert.equal(await call('POST', 'posts/p2/comments?documentId=x1', comment('bot_01')), 403, 'comment on opted-out user');
    assert.equal(await call('POST', 'posts/p3/comments?documentId=x2', comment('bot_01')), 403, 'comment on default-off user');
    assert.equal(await call('PATCH', 'posts/p2?updateMask.fieldPaths=reactions.bot_01', { fields: { reactions: { mapValue: { fields: { bot_01: S('love') } } } } }), 403, 'reaction on opted-out user');
    assert.equal(await call('PATCH', 'posts/p3?updateMask.fieldPaths=reactions.bot_01', { fields: { reactions: { mapValue: { fields: { bot_01: S('love') } } } } }), 403, 'reaction on default-off user');
    assert.equal(m.ids('posts/p2/comments').length + m.ids('posts/p3/comments').length, 0);
    // blocked: acting as a human, or posting video / non-public as a bot
    assert.equal(await call('POST', 'posts/p1/comments?documentId=x3', comment('u1')), 403, 'runner cannot comment as a real user');
    assert.equal(await call('POST', 'posts/p1/comments?documentId=x4', comment('bot_01', false)), 403, 'bot comment must be flagged as AI');
    assert.equal(await call('PATCH', 'users/u2?updateMask.fieldPaths=settings.allowBotEngagement', { fields: { settings: { mapValue: { fields: { allowBotEngagement: { booleanValue: true } } } } } }), 403, 'runner cannot flip a user\'s consent switch');
    // allowed: the same comment on the user who opted in
    assert.equal(await call('POST', 'posts/p1/comments?documentId=ok1', comment('bot_01')), 200, 'opted-in user is allowed');
  } finally { await m.close(); }
});

test('rules: withdrawing consent stops the bots on the very next run', { skip: !botRunnerConfigured }, async () => {
  const m = await startMock({ seed: seed(), rules: true });
  try {
    const first = await exec(['scripts/bot-runner.mjs'], env(m, { BOT_POSTS: '0' }));
    assert.equal(first.status, 0, first.stderr);
    assert.equal(m.ids('posts/p1/comments').length, 1);
    // the user switches the setting off, a fresh post appears
    m.put('users/u1', { name: 'Rina Akter', banned: false, settings: { allowBotEngagement: false } });
    m.put('posts/p9', post('u1', 'Another amazing trip to the beach with friends'));
    const second = await exec(['scripts/bot-runner.mjs'], env(m, { BOT_POSTS: '0' }));
    assert.equal(second.status, 0, second.stderr);
    assert.deepEqual(m.denied, []);
    assert.equal(m.ids('posts/p9/comments').length, 0, 'no engagement after consent was withdrawn');
    assert.equal(m.ids('posts/p1/comments').length, 1, 'nothing new on the old post either');
  } finally { await m.close(); }
});

test('negative control: without the rules gate the same hand-made write succeeds (so the 403s above come from the rules)', async () => {
  const m = await startMock({ seed: seed(), rules: false });
  try {
    const { call, comment } = await asRunner(m);
    assert.equal(await call('POST', 'posts/p2/comments?documentId=x1', comment('bot_01')), 200);
  } finally { await m.close(); }
});
