// Run with:  node --test tests/
// Tests the GitHub Actions scripts (bot runner, account deletion, encrypted backup) against an in-memory
// imitation of Firestore. Firestore SECURITY RULES are NOT covered here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { startMock } from './mock-firestore.mjs';
import { BOTS } from '../js/bots-data.js';
import { firebaseConfig } from '../js/firebase-config.js';

// Bot runner integration tests require an owner-configured Firebase Web App. They are skipped
// while MeetBook intentionally has blank Firebase placeholders; bot automation remains out of scope.
const botRunnerConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

// async on purpose: the mock server lives in this process, so a blocking spawnSync would deadlock it
const exec = (args, env) => new Promise((resolve) => {
  const c = spawn('node', args, { env: { ...process.env, ...env } });
  let stdout = '', stderr = '';
  c.stdout.on('data', (d) => { stdout += d; }); c.stderr.on('data', (d) => { stderr += d; });
  c.on('close', (status) => resolve({ status, stdout, stderr }));
});
const run = (script, env) => exec([script], env);
const run2 = exec;
const now = new Date();
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const SA = JSON.stringify({ client_email: 'svc@test-proj.iam.gserviceaccount.com', private_key: privateKey, project_id: 'test-proj' });

function seedBots(extra = {}) {
  const s = {};
  BOTS.forEach((b) => { s[`users/${b.id}`] = { name: b.name, isBot: true, banned: false, ...extra }; });
  s['botRunners/runner1'] = { enabled: true, botIds: BOTS.map((bot) => bot.id) };
  return s;
}
const post = (uid, text, more = {}) => ({ uid, authorName: uid, text, image: '', videoUrl: '', visibility: 'public', audience: [], groupId: null, reactions: {}, commentCount: 0, shareCount: 0, createdAt: now, ...more });

test('bot runner: consent, safety, limits, chat, logs', { skip: !botRunnerConfigured }, async () => {
  const m = await startMock({ seed: {
    ...seedBots(),
    'settings/global': { botsEnabled: true, botToBotComments: false },
    'users/u1': { name: 'Rina Akter', banned: false, settings: { allowBotEngagement: true } },
    'users/u2': { name: 'Sam', banned: false, settings: { allowBotEngagement: false } },
    'posts/p1': post('u1', "Went to Cox's Bazar with friends, the sea was amazing! Best trip ever."),
    'posts/p2': post('u2', 'Lovely travel photo from my trip to the beach'),
    'posts/p3': post('u1', 'My grandfather passed away today'),
    'posts/p4': post('bot_01', 'Tech tip: update your phone and apps regularly.'),
    'chats/bot_06_u1': { type: 'private', members: ['bot_06', 'u1'] },
    'botInbox/i1': { botId: 'bot_06', fromUid: 'u1', chatId: 'bot_06_u1', text: 'তুমি কি রোবট?', handled: false, createdAt: now }
  } });
  const env = { BOT_RUNNER_EMAIL: 'r@x.com', BOT_RUNNER_PASSWORD: 'secret', AUTH_URL: m.url, FS_URL: m.url, BOT_POSTS: '2', BOT_COMMENTS: '6' };
  try {
    const r = await run('scripts/bot-runner.mjs', env);
    assert.equal(r.status, 0, r.stderr + r.stdout);

    const botPosts = m.ids('posts').filter((id) => !['p1', 'p2', 'p3', 'p4'].includes(id));
    assert.equal(botPosts.length, 2, 'two new bot posts');
    botPosts.forEach((id) => { const p = m.get(`posts/${id}`); assert.match(p.uid, /^bot_\d\d$/); assert.equal(p.visibility, 'public'); assert.equal(p.videoUrl, ''); });

    assert.equal(m.ids('posts/p2/comments').length, 0, 'no engagement without consent');
    assert.equal(m.ids('posts/p3/comments').length, 0, 'silent on sensitive posts');
    assert.equal(m.ids('posts/p4/comments').length, 0, 'bot-to-bot comments are off by default');
    assert.deepEqual(m.get('posts/p2').reactions, {});
    const cids = m.ids('posts/p1/comments');
    assert.equal(cids.length, 1, 'one comment on the consenting user post');
    const c = m.get(`posts/p1/comments/${cids[0]}`);
    assert.match(c.uid, /^bot_\d\d$/); assert.equal(c.ai, true); assert.ok(c.text.length > 3);
    assert.equal(m.get('posts/p1').commentCount, 1);
    assert.equal(Object.keys(m.get('posts/p1').reactions).length, 1);
    assert.match(Object.keys(m.get('posts/p1').reactions)[0], /^bot_\d\d$/);
    assert.ok(m.ids('notifications').length >= 1, 'author is notified');

    // chat
    const msgs = m.ids('chats/bot_06_u1/messages');
    assert.equal(msgs.length, 1);
    const reply = m.get(`chats/bot_06_u1/messages/${msgs[0]}`);
    assert.equal(reply.uid, 'bot_06'); assert.match(reply.text, /এআই বট/, 'answers honestly that it is an AI bot');
    assert.equal(m.get('botInbox/i1').handled, true);
    assert.equal(m.get('chats/bot_06_u1').lastMessage.uid, 'bot_06');

    assert.ok(m.ids('botLogs').length >= 4, 'activity logged');
    const st = m.get('botState/runner1'); assert.ok(JSON.parse(st.daily).counts);

    // second run: p1 is never engaged twice
    const r2 = await run('scripts/bot-runner.mjs', { ...env, BOT_POSTS: '0' });
    assert.equal(r2.status, 0, r2.stderr);
    assert.equal(m.ids('posts/p1/comments').length, 1);
  } finally { await m.close(); }
});

test('bot runner: global OFF, per-bot OFF and daily limit stop everything', { skip: !botRunnerConfigured }, async () => {
  for (const [name, seed] of [
    ['global off', { ...seedBots(), 'settings/global': { botsEnabled: false } }],
    ['bots inactive', { ...seedBots({ active: false }) }],
    ['limit 0', { ...seedBots({ dailyLimit: 0 }) }]
  ]) {
    const m = await startMock({ seed: { ...seed, 'users/u1': { name: 'R', settings: { allowBotEngagement: true } }, 'posts/p1': post('u1', 'trip to the beach') } });
    try {
      const r = await run('scripts/bot-runner.mjs', { BOT_RUNNER_EMAIL: 'r@x.com', BOT_RUNNER_PASSWORD: 'secret', AUTH_URL: m.url, FS_URL: m.url, BOT_POSTS: '3', BOT_COMMENTS: '3' });
      assert.equal(r.status, 0, `${name}: ${r.stderr}`);
      assert.deepEqual(m.ids('posts'), ['p1'], name);
      assert.equal(m.ids('posts/p1/comments').length, 0, name);
    } finally { await m.close(); }
  }
});

test('bot runner: a wrong password fails loudly, missing secrets do nothing', async () => {
  const m = await startMock({ seed: seedBots() });
  try {
    const bad = await run('scripts/bot-runner.mjs', { BOT_RUNNER_EMAIL: 'r@x.com', BOT_RUNNER_PASSWORD: 'nope', AUTH_URL: m.url, FS_URL: m.url });
    assert.notEqual(bad.status, 0);
    const none = await run('scripts/bot-runner.mjs', { BOT_RUNNER_EMAIL: '', BOT_RUNNER_PASSWORD: '' });
    assert.equal(none.status, 0); assert.match(none.stdout, /not configured/);
  } finally { await m.close(); }
});

test('account deletion: purges data + auth user, refuses staff and bots', async () => {
  const m = await startMock({ authUsers: ['del1', 'adm1'], seed: {
    'admins/boss': { role: 'super_admin' }, 'admins/ex': { role: 'admin' },
    'users/del1': { name: 'Del' }, 'publicProfiles/del1': { name: 'Del', nameLower: 'del' }, 'botEngagement/del1': { allowBotEngagement: false }, 'botInboxRateLimits/del1/bots/bot_01': { senderUid: 'del1', botId: 'bot_01', count: 1 }, 'users/del2': { name: 'Del2' }, 'deletionRequests/del2': { status: 'pending', requestedBy: 'ex' }, 'users/del1/saved/x': { createdAt: now }, 'users/keep': { name: 'Keep' }, 'users/adm1': { name: 'Boss' }, 'admins/adm1': { role: 'admin' },
    'posts/a': post('del1', 'mine'), 'posts/a/comments/c1': { uid: 'keep', text: 'hi' }, 'posts/b': post('keep', 'theirs'), 'posts/b/comments/c2': { uid: 'del1', text: 'old comment' },
    'friendships/del1_keep': { members: ['del1', 'keep'] }, 'follows/keep_del1': { follower: 'keep', followed: 'del1' },
    'chats/del1_keep': { type: 'private', members: ['del1', 'keep'] }, 'chats/del1_keep/messages/m1': { uid: 'keep', text: 'yo' },
    'chats/g1': { type: 'group', members: ['del1', 'keep', 'x'] },
    'groups/solo': { name: 'Solo', members: ['del1'] }, 'groups/shared': { name: 'Shared', members: ['del1', 'keep'] },
    'notifications/n1': { to: 'del1', from: 'keep' },
    'deletionRequests/del1': { status: 'pending', requestedBy: 'boss' }, 'deletionRequests/adm1': { status: 'pending', requestedBy: 'boss' }, 'deletionRequests/bot_03': { status: 'pending', requestedBy: 'boss' }
  } });
  // more than one query page (500) and more than one list page (300) of data
  for (let i = 0; i < 1100; i++) m.put(`posts/bulk${i}`, post('del1', `bulk ${i}`));
  for (let i = 0; i < 650; i++) m.put(`posts/a/comments/cc${i}`, { uid: 'keep', text: 'x' });
  const env = { FIREBASE_SERVICE_ACCOUNT: SA, MEETBOOK_FIREBASE_PROJECT_ID: 'test-proj', FS_URL: m.url, IDT_URL: m.url, TOKEN_URL: `${m.url}/token` };
  try {
    const r = await run('scripts/account-deletion.mjs', env);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    for (const p of ['users/del1', 'publicProfiles/del1', 'botEngagement/del1', 'botInboxRateLimits/del1/bots/bot_01', 'users/del1/saved/x', 'posts/a', 'posts/a/comments/c1', 'friendships/del1_keep', 'follows/keep_del1', 'chats/del1_keep', 'chats/del1_keep/messages/m1', 'groups/solo', 'notifications/n1'])
      assert.equal(m.get(p), null, `${p} should be deleted`);
    for (const p of ['users/keep', 'posts/b', 'groups/shared', 'users/adm1', 'chats/g1']) assert.notEqual(m.get(p), null, `${p} should stay`);
    assert.deepEqual(m.get('groups/shared').members, ['keep']);
    assert.deepEqual(m.get('chats/g1').members, ['keep', 'x']);
    assert.equal(m.ids('posts').filter((id) => id.startsWith('bulk')).length, 0, 'all 1100 posts removed (paging)');
    assert.equal(m.ids('posts/a/comments').length, 0, 'all 650 comments removed (list paging)');
    assert.deepEqual(m.authDeleted, ['del1']);
    assert.equal(m.get('deletionRequests/del2').status, 'refused', 'requester is no longer a super admin');
    assert.notEqual(m.get('users/del2'), null, 'refused request deletes nothing');
    assert.equal(m.get('deletionRequests/del1').status, 'done');
    assert.equal(m.get('deletionRequests/adm1').status, 'refused');
    assert.equal(m.get('deletionRequests/bot_03').status, 'refused');
    assert.ok(m.ids('adminLogs').length >= 3);
  } finally { await m.close(); }
});

test('backup: refuses without passphrase, writes an encrypted file that decrypts only with the passphrase', async () => {
  const m = await startMock({ seed: { 'users/u1': { name: 'Rina', photo: 'data:image/jpeg;base64,' + 'A'.repeat(5000) }, 'posts/p1': post('u1', 'secret post'), 'posts/p1/comments/c1': { uid: 'u1', text: 'c' } } });
  const out = mkdtempSync(`${tmpdir()}/bk-`);
  const env = { FIREBASE_SERVICE_ACCOUNT: SA, MEETBOOK_FIREBASE_PROJECT_ID: 'test-proj', FS_URL: m.url, TOKEN_URL: `${m.url}/token`, OUT_DIR: out };
  try {
    assert.notEqual((await run('scripts/backup.mjs', env)).status, 0, 'needs a passphrase');
    const r = await run('scripts/backup.mjs', { ...env, BACKUP_PASSPHRASE: 'correct horse battery' });
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const [file] = readdirSync(out);
    const raw = readFileSync(`${out}/${file}`);
    assert.ok(!raw.includes('secret post'), 'no plaintext in the file');
    assert.equal(m.get('system/backups').status, 'ok');
    const ok = await exec(['scripts/backup-decrypt.mjs', `${out}/${file}`, `${out}/x.json`], { BACKUP_PASSPHRASE: 'correct horse battery' });
    assert.equal(ok.status, 0, ok.stderr);
    const j = JSON.parse(readFileSync(`${out}/x.json`, 'utf8'));
    assert.equal(j.data.posts[0].text, 'secret post');
    assert.equal(j.data['posts/comments'].p1.length, 1);
    assert.equal(j.data.users[0].photo, '[image omitted from backup]');
    const bad = await exec(['scripts/backup-decrypt.mjs', `${out}/${file}`, `${out}/y.json`], { BACKUP_PASSPHRASE: 'wrong wrong wrong' });
    assert.notEqual(bad.status, 0);
  } finally { await m.close(); }
});

test('restore: dry run by default, needs project confirmation, keeps existing, skips admins, brings back timestamps', async () => {
  const src = await startMock({ seed: { 'users/u1': { name: 'Rina', photo: 'data:image/jpeg;base64,' + 'A'.repeat(5000) }, 'users/u2': { name: 'Sam' }, 'posts/p1': post('u1', 'hello'), 'posts/p1/comments/c1': { uid: 'u2', text: 'hi', createdAt: now }, 'admins/boss': { role: 'super_admin' } } });
  const out = mkdtempSync(`${tmpdir()}/rs-`);
  const pass = 'correct horse battery';
  try {
    const b = await run('scripts/backup.mjs', { FIREBASE_SERVICE_ACCOUNT: SA, MEETBOOK_FIREBASE_PROJECT_ID: 'test-proj', FS_URL: src.url, TOKEN_URL: `${src.url}/token`, OUT_DIR: out, BACKUP_PASSPHRASE: pass });
    assert.equal(b.status, 0, b.stderr);
  } finally { await src.close(); }
  const [file] = readdirSync(out);
  const dst = await startMock({ seed: { 'users/u2': { name: 'Sam (edited since)' } } });
  const env = { FIREBASE_SERVICE_ACCOUNT: SA, FS_URL: dst.url, TOKEN_URL: `${dst.url}/token`, BACKUP_PASSPHRASE: pass, CONFIRM_PROJECT_ID: 'test-proj' };
  try {
    const noConfirm = await run2(['scripts/restore.mjs', `${out}/${file}`, '--apply'], { ...env, CONFIRM_PROJECT_ID: 'other' });
    assert.notEqual(noConfirm.status, 0, 'must confirm the project id');
    const dry = await run2(['scripts/restore.mjs', `${out}/${file}`], env);
    assert.equal(dry.status, 0, dry.stderr); assert.match(dry.stdout, /DRY RUN/);
    assert.equal(dst.get('users/u1'), null, 'dry run writes nothing');
    const real = await run2(['scripts/restore.mjs', `${out}/${file}`, '--apply'], env);
    assert.equal(real.status, 0, real.stderr);
    assert.equal(dst.get('users/u1').name, 'Rina');
    assert.equal(dst.get('users/u1').photo, undefined, 'omitted image placeholder is never written');
    assert.equal(dst.get('users/u2').name, 'Sam (edited since)', 'existing documents are kept');
    assert.ok(dst.get('posts/p1/comments/c1').createdAt instanceof Date, 'timestamps come back as timestamps');
    assert.equal(dst.get('admins/boss'), null, 'staff documents are never restored');
    const wrong = await run2(['scripts/restore.mjs', `${out}/${file}`], { ...env, BACKUP_PASSPHRASE: 'wrong wrong wrong' });
    assert.notEqual(wrong.status, 0);
  } finally { await dst.close(); }
});
