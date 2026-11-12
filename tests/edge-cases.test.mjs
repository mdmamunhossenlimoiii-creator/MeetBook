// Edge cases for the three high-risk jobs: account deletion, encrypted backup, restore.
// Runs against the in-memory Firestore mock (tests/mock-firestore.mjs). NOT real Firebase.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { generateKeyPairSync, createCipheriv, randomBytes, scryptSync } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { startMock } from './mock-firestore.mjs';

const exec = (args, env) => new Promise((resolve) => {
  const c = spawn('node', args, { env: { ...process.env, ...env } });
  let stdout = '', stderr = '';
  c.stdout.on('data', (d) => { stdout += d; }); c.stderr.on('data', (d) => { stderr += d; });
  c.on('close', (status) => resolve({ status, stdout, stderr, all: stdout + stderr }));
});
const now = new Date();
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const KEY_BODY = privateKey.split('\n').filter((l) => l && !l.startsWith('-----'));
const SA = JSON.stringify({ client_email: 'svc@test-proj.iam.gserviceaccount.com', private_key: privateKey, project_id: 'test-proj' });
const PASS = 'correct horse battery';
const post = (uid, text, more = {}) => ({ uid, authorName: uid, text, image: '', videoUrl: '', visibility: 'public', audience: [], groupId: null, reactions: {}, commentCount: 0, shareCount: 0, createdAt: now, ...more });

// no secret may appear in output, in any stored document or in the request log
function assertNoSecrets(label, texts, m, extra = []) {
  const bad = [privateKey, 'BEGIN PRIVATE KEY', ...KEY_BODY.slice(1, 4), PASS, ...extra];
  const hay = [...texts, JSON.stringify([...m.docs.entries()]), m.calls.join('\n')].join('\n');
  for (const s of bad) assert.ok(!hay.includes(s), `${label}: a secret leaked (${s.slice(0, 12)}…)`);
}
const delEnv = (m, more = {}) => ({ FIREBASE_SERVICE_ACCOUNT: SA, MEETBOOK_FIREBASE_PROJECT_ID: 'test-proj', FS_URL: m.url, IDT_URL: m.url, TOKEN_URL: `${m.url}/token`, ...more });
const req = (uid, by = 'boss') => ({ status: 'pending', requestedBy: by, requestedAt: now });
const base = () => ({ 'admins/boss': { role: 'super_admin' }, 'users/boss': { name: 'Boss' } });

// ============================================================ account deletion
test('deletion: DRY_RUN deletes nothing and leaves the request pending', async () => {
  const m = await startMock({ authUsers: ['d1'], seed: { ...base(), 'users/d1': { name: 'D' }, 'posts/a': post('d1', 'x'), 'deletionRequests/d1': req('d1') } });
  try {
    const r = await exec(['scripts/account-deletion.mjs'], delEnv(m, { DRY_RUN: '1' }));
    assert.equal(r.status, 0, r.all);
    assert.notEqual(m.get('posts/a'), null); assert.notEqual(m.get('users/d1'), null);
    assert.equal(m.get('users/d1').banned, undefined, 'a dry run must not even ban');
    assert.equal(m.get('deletionRequests/d1').status, 'pending');
    assert.deepEqual(m.authDeleted, []);
    assertNoSecrets('dry run', [r.all], m);
  } finally { await m.close(); }
});

test('deletion: a second run after success changes nothing (idempotent)', async () => {
  const m = await startMock({ authUsers: ['d1'], seed: { ...base(), 'users/d1': { name: 'D' }, 'users/k': { name: 'K' }, 'posts/a': post('d1', 'x'), 'posts/k': post('k', 'keep'), 'deletionRequests/d1': req('d1') } });
  try {
    assert.equal((await exec(['scripts/account-deletion.mjs'], delEnv(m))).status, 0);
    const snapshot = JSON.stringify([...m.docs.keys()].sort());
    const logs = m.ids('adminLogs').length;
    const r2 = await exec(['scripts/account-deletion.mjs'], delEnv(m));
    assert.equal(r2.status, 0, r2.all); assert.match(r2.stdout, /0 pending/);
    assert.equal(JSON.stringify([...m.docs.keys()].sort()), snapshot);
    assert.equal(m.ids('adminLogs').length, logs, 'no duplicate audit entries');
    assert.deepEqual(m.authDeleted, ['d1'], 'auth user deleted exactly once');
  } finally { await m.close(); }
});

test('deletion: Auth user already gone, or no profile document at all, still finishes cleanly', async () => {
  const m = await startMock({ authUsers: [], seed: { ...base(), 'users/g1': { name: 'G' }, 'deletionRequests/g1': req('g1'), 'deletionRequests/ghost': req('ghost') } });
  try {
    const r = await exec(['scripts/account-deletion.mjs'], delEnv(m));
    assert.equal(r.status, 0, r.all);
    assert.equal(m.get('deletionRequests/g1').status, 'done'); assert.match(m.get('deletionRequests/g1').note, /already gone/);
    assert.equal(m.get('deletionRequests/ghost').status, 'done'); assert.match(m.get('deletionRequests/ghost').note, /no profile document/);
  } finally { await m.close(); }
});

test('deletion: Auth service failure keeps the request pending, account stays blocked, a retry finishes; no secrets in logs', async () => {
  const m = await startMock({ authUsers: ['d1'], faults: { authDelete: 1 }, seed: { ...base(), 'users/d1': { name: 'D' }, 'posts/a': post('d1', 'x'), 'deletionRequests/d1': req('d1') } });
  try {
    const r1 = await exec(['scripts/account-deletion.mjs'], delEnv(m));
    assert.notEqual(r1.status, 0, 'the job must fail loudly');
    assert.equal(m.get('deletionRequests/d1').status, 'pending', 'never marked done when Auth deletion failed');
    assert.match(m.get('deletionRequests/d1').note, /Failed \(will retry\)/);
    assert.deepEqual(m.authDeleted, []);
    assertNoSecrets('auth failure', [r1.all], m);
    const r2 = await exec(['scripts/account-deletion.mjs'], delEnv(m));
    assert.equal(r2.status, 0, r2.all);
    assert.equal(m.get('deletionRequests/d1').status, 'done'); assert.deepEqual(m.authDeleted, ['d1']);
    assert.equal(m.get('posts/a'), null);
  } finally { await m.close(); }
});

test('deletion: Firestore failure half way blocks the account first and resumes on retry', async () => {
  const m = await startMock({ authUsers: ['d1'], faults: { commitAfter: 1 }, seed: { ...base(), 'users/d1': { name: 'D' }, 'deletionRequests/d1': req('d1') } });
  for (let i = 0; i < 900; i++) m.put(`posts/b${i}`, post('d1', `b${i}`)); // several delete batches
  try {
    const r1 = await exec(['scripts/account-deletion.mjs'], delEnv(m));
    assert.notEqual(r1.status, 0);
    assert.equal(m.get('users/d1').banned, true, 'blocked before purging');
    assert.equal(m.get('deletionRequests/d1').status, 'pending');
    const left = m.ids('posts').length; assert.ok(left > 0 && left < 900, `partial purge expected, got ${left}`);
    assert.deepEqual(m.authDeleted, [], 'auth account untouched until the data is gone');
    const r2 = await exec(['scripts/account-deletion.mjs'], delEnv(m));
    assert.equal(r2.status, 0, r2.all);
    assert.equal(m.ids('posts').length, 0); assert.equal(m.get('deletionRequests/d1').status, 'done'); assert.deepEqual(m.authDeleted, ['d1']);
  } finally { await m.close(); }
});

test('deletion: requests without a valid requester, self-deletion by staff, and unknown requester are refused', async () => {
  const m = await startMock({ authUsers: ['a', 'b', 'c', 'boss'], seed: { ...base(), 'admins/mod': { role: 'moderator' }, 'admins/noRole': {}, 'users/a': {}, 'users/b': {}, 'users/c': {},
    'deletionRequests/a': { status: 'pending' },                       // no requestedBy
    'deletionRequests/b': { status: 'pending', requestedBy: 'mod' },    // moderator
    'deletionRequests/c': { status: 'pending', requestedBy: 'noRole' }, // staff doc without a role
    'deletionRequests/boss': req('boss') } });                          // super admin deleting a staff account
  try {
    const r = await exec(['scripts/account-deletion.mjs'], delEnv(m));
    assert.equal(r.status, 0, r.all);
    for (const id of ['a', 'b', 'c', 'boss']) assert.equal(m.get(`deletionRequests/${id}`).status, 'refused', id);
    assert.deepEqual(m.authDeleted, []);
    ['users/a', 'users/b', 'users/c', 'users/boss'].forEach((p) => assert.notEqual(m.get(p), null, p));
  } finally { await m.close(); }
});

test('deletion: a bad service-account secret fails without echoing it', async () => {
  const m = await startMock({ seed: base() });
  try {
    const bad = 'not-json {"private_key":"TOP-SECRET-VALUE"';
    const r = await exec(['scripts/account-deletion.mjs'], delEnv(m, { FIREBASE_SERVICE_ACCOUNT: bad }));
    assert.notEqual(r.status, 0); assert.ok(!r.all.includes('TOP-SECRET-VALUE'));
    const r2 = await exec(['scripts/backup.mjs'], delEnv(m, { FIREBASE_SERVICE_ACCOUNT: bad, BACKUP_PASSPHRASE: PASS }));
    assert.notEqual(r2.status, 0); assert.ok(!r2.all.includes('TOP-SECRET-VALUE'));
  } finally { await m.close(); }
});

// ============================================================ backup
const out = () => mkdtempSync(`${tmpdir()}/edge-`);
const backupEnv = (m, dir, more = {}) => ({ FIREBASE_SERVICE_ACCOUNT: SA, MEETBOOK_FIREBASE_PROJECT_ID: 'test-proj', FS_URL: m.url, TOKEN_URL: `${m.url}/token`, OUT_DIR: dir, BACKUP_PASSPHRASE: PASS, ...more });
const fileIn = (dir) => `${dir}/${readdirSync(dir).find((f) => f.endsWith('.enc'))}`;

test('backup: short passphrase refused, DRY_RUN writes nothing, secrets never printed', async () => {
  const m = await startMock({ seed: { 'users/u1': { name: 'A' } } });
  const dir = out();
  try {
    const short = await exec(['scripts/backup.mjs'], backupEnv(m, dir, { BACKUP_PASSPHRASE: 'short' }));
    assert.notEqual(short.status, 0); assert.equal(readdirSync(dir).length, 0);
    const dry = await exec(['scripts/backup.mjs'], backupEnv(m, dir, { DRY_RUN: '1' }));
    assert.equal(dry.status, 0, dry.all); assert.equal(readdirSync(dir).length, 0); assert.equal(m.get('system/backups'), null, 'dry run does not touch status doc');
    const real = await exec(['scripts/backup.mjs'], backupEnv(m, dir));
    assertNoSecrets('backup', [short.all, dry.all, real.all], m);
  } finally { await m.close(); }
});

test('backup: an empty database still produces a valid, restorable file', async () => {
  const m = await startMock({ seed: {} });
  const dir = out();
  try {
    const r = await exec(['scripts/backup.mjs'], backupEnv(m, dir));
    assert.equal(r.status, 0, r.all);
    const d = await exec(['scripts/backup-decrypt.mjs', fileIn(dir), `${dir}/e.json`], { BACKUP_PASSPHRASE: PASS });
    assert.equal(d.status, 0, d.all);
    assert.equal(JSON.parse(readFileSync(`${dir}/e.json`, 'utf8')).format, 2);
  } finally { await m.close(); }
});

test('backup: BACKUP_INCLUDE_IMAGES=1 keeps images, default drops them', async () => {
  const big = 'data:image/jpeg;base64,' + 'B'.repeat(4000);
  const m = await startMock({ seed: { 'users/u1': { name: 'A', photo: big } } });
  const d1 = out(), d2 = out();
  try {
    await exec(['scripts/backup.mjs'], backupEnv(m, d1));
    await exec(['scripts/backup.mjs'], backupEnv(m, d2, { BACKUP_INCLUDE_IMAGES: '1' }));
    await exec(['scripts/backup-decrypt.mjs', fileIn(d1), `${d1}/o.json`], { BACKUP_PASSPHRASE: PASS });
    await exec(['scripts/backup-decrypt.mjs', fileIn(d2), `${d2}/o.json`], { BACKUP_PASSPHRASE: PASS });
    assert.equal(JSON.parse(readFileSync(`${d1}/o.json`)).data.users[0].photo, '[image omitted from backup]');
    assert.equal(JSON.parse(readFileSync(`${d2}/o.json`)).data.users[0].photo, big);
  } finally { await m.close(); }
});

// ============================================================ corrupted / hostile backup files
async function makeBackup(seed) {
  const m = await startMock({ seed });
  const dir = out();
  const r = await exec(['scripts/backup.mjs'], backupEnv(m, dir));
  await m.close();
  assert.equal(r.status, 0, r.all);
  return { dir, file: fileIn(dir) };
}
const restoreEnv = (m, more = {}) => ({ FIREBASE_SERVICE_ACCOUNT: SA, FS_URL: m.url, TOKEN_URL: `${m.url}/token`, BACKUP_PASSPHRASE: PASS, CONFIRM_PROJECT_ID: 'test-proj', ...more });

test('restore/decrypt: tampered, truncated and foreign files are rejected cleanly and write nothing', async () => {
  const { dir, file } = await makeBackup({ 'users/u1': { name: 'A' }, 'posts/p1': post('u1', 'hello') });
  const good = readFileSync(file);
  const flipped = Buffer.from(good); flipped[flipped.length - 20] ^= 0xff;               // ciphertext bit flip
  const badTag = Buffer.from(good); badTag[40] ^= 0x01;                                    // auth tag
  const badSalt = Buffer.from(good); badSalt[8] ^= 0x01;                                   // salt -> other key
  const cases = { flipped, badTag, badSalt, truncated: good.subarray(0, 30), tiny: good.subarray(0, 5), empty: Buffer.alloc(0), foreign: Buffer.from('PK\u0003\u0004 not a backup at all, just some zip-looking bytes') };
  const dst = await startMock({ seed: {} });
  try {
    for (const [name, buf] of Object.entries(cases)) {
      const f = `${dir}/${name}.enc`; writeFileSync(f, buf);
      const r = await exec(['scripts/restore.mjs', f, '--apply'], restoreEnv(dst));
      assert.notEqual(r.status, 0, `${name}: restore must fail`);
      assert.ok(!/at .*\.mjs:\d+|node:internal/.test(r.all), `${name}: must be a clean message, not a stack trace\n${r.all}`);
      const d = await exec(['scripts/backup-decrypt.mjs', f, `${dir}/${name}.json`], { BACKUP_PASSPHRASE: PASS });
      assert.notEqual(d.status, 0, `${name}: decrypt must fail`);
      assert.ok(!/at .*\.mjs:\d+|node:internal/.test(d.all), `${name}: decrypt must give a clean message\n${d.all}`);
      assert.ok(!existsSync(`${dir}/${name}.json`), `${name}: no output file for a failed decrypt`);
    }
    assert.equal(dst.docs.size, 0, 'nothing was written by any failed restore');
  } finally { await dst.close(); }
});

test('restore: refuses an old/unknown format even with the right passphrase', async () => {
  const salt = randomBytes(16), iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', scryptSync(PASS, salt, 32), iv);
  const enc = Buffer.concat([c.update(gzipSync(Buffer.from(JSON.stringify({ format: 1, project: 'test-proj', data: { users: [{ id: 'u1', name: 'A' }] } })))), c.final()]);
  const dir = out(); const f = `${dir}/old.enc`;
  writeFileSync(f, Buffer.concat([Buffer.from('MSBK1'), salt, iv, c.getAuthTag(), enc]));
  const dst = await startMock({ seed: {} });
  try {
    const r = await exec(['scripts/restore.mjs', f, '--apply'], restoreEnv(dst));
    assert.notEqual(r.status, 0); assert.match(r.all, /Unsupported backup format/); assert.equal(dst.docs.size, 0);
  } finally { await dst.close(); }
});

test('restore: running --apply twice is idempotent, --overwrite replaces but still never restores staff', async () => {
  const { file } = await makeBackup({ 'users/u1': { name: 'Original' }, 'posts/p1': post('u1', 'hello'), 'posts/p1/comments/c1': { uid: 'u1', text: 'c', createdAt: now }, 'admins/boss': { role: 'super_admin' }, 'deletionRequests/u1': { status: 'pending' } });
  const dst = await startMock({ seed: { 'users/u1': { name: 'Edited later' } } });
  try {
    const a = await exec(['scripts/restore.mjs', file, '--apply'], restoreEnv(dst));
    assert.equal(a.status, 0, a.all); assert.match(a.stdout, /APPLIED: 2 to create, 0 to overwrite, 1 existing kept/);
    const state = JSON.stringify([...dst.docs.keys()].sort());
    const b = await exec(['scripts/restore.mjs', file, '--apply'], restoreEnv(dst));
    assert.match(b.stdout, /APPLIED: 0 to create, 0 to overwrite, 3 existing kept/);
    assert.equal(JSON.stringify([...dst.docs.keys()].sort()), state);
    assert.equal(dst.get('users/u1').name, 'Edited later');
    const c = await exec(['scripts/restore.mjs', file, '--apply', '--overwrite'], restoreEnv(dst));
    assert.equal(c.status, 0, c.all); assert.equal(dst.get('users/u1').name, 'Original');
    assert.equal(dst.get('admins/boss'), null, 'staff never restored, even with --overwrite');
    assert.equal(dst.get('deletionRequests/u1'), null, 'pending deletions never restored');
    assertNoSecrets('restore', [a.all, b.all, c.all], dst);
  } finally { await dst.close(); }
});

test('restore: odd data in the backup (look-alike timestamp objects, placeholder inside a list) cannot crash or leak a placeholder', async () => {
  // a user can store arbitrary map fields on their own profile; one that looks like our typed timestamp must not break a restore
  const { file } = await makeBackup({
    'users/u1': { name: 'A', weird: { $ts: 'not a date at all' }, nested: { t: now, list: [now, { x: now }] } },
    'users/u2': { name: 'B', gallery: ['data:image/jpeg;base64,' + 'C'.repeat(3000), 'https://example.com/a.jpg'] },
    'users/u3': { name: 'C-after' }
  });
  const dst = await startMock({ seed: {} });
  try {
    const r = await exec(['scripts/restore.mjs', file, '--apply'], restoreEnv(dst));
    assert.equal(r.status, 0, 'restore must survive odd data\n' + r.all);
    assert.equal(dst.get('users/u3').name, 'C-after', 'documents after the odd one were still restored');
    assert.ok(dst.get('users/u1').nested.t instanceof Date); assert.ok(dst.get('users/u1').nested.list[0] instanceof Date); assert.ok(dst.get('users/u1').nested.list[1].x instanceof Date);
    assert.ok(!JSON.stringify(dst.get('users/u2')).includes('image omitted'), 'placeholder text is never written, also inside lists');
    assert.ok(dst.get('users/u2').gallery.includes('https://example.com/a.jpg'));
  } finally { await dst.close(); }
});

test('restore: a failure half way is safe to re-run', async () => {
  const seed = {}; for (let i = 0; i < 30; i++) seed[`posts/p${i}`] = post('u1', `t${i}`);
  const { file } = await makeBackup(seed);
  const dst = await startMock({ seed: {}, faults: {} });
  try {
    // simulate a crash: apply a partial state by hand, then run the real restore: only the missing ones are created
    for (let i = 0; i < 10; i++) dst.put(`posts/p${i}`, post('u1', `t${i}`));
    const r = await exec(['scripts/restore.mjs', file, '--apply'], restoreEnv(dst));
    assert.equal(r.status, 0, r.all); assert.match(r.stdout, /20 to create, 0 to overwrite, 10 existing kept/);
    assert.equal(dst.ids('posts').length, 30);
  } finally { await dst.close(); }
});
