// Scheduled job (GitHub Actions): weekly JSON backup of the database, ENCRYPTED before it leaves the job.
// Why encrypted: this repo is public, and artifacts of a public repo can be downloaded by any GitHub user.
// Without BACKUP_PASSPHRASE the job refuses to run. Decrypt locally with scripts/backup-decrypt.mjs.
//
// Real Firestore exports need a paid Cloud Storage bucket, so this reads documents through the REST API.
// NOT in the backup: Firebase Authentication accounts (emails / passwords) and users/{uid}/saved. See README "Restore".
// Large embedded images (data URLs over 2 KB) are replaced by a placeholder unless BACKUP_INCLUDE_IMAGES=1.
// Env: FIREBASE_SERVICE_ACCOUNT, BACKUP_PASSPHRASE, OUT_DIR (default backup-out), DRY_RUN=1, FS_URL, TOKEN_URL (tests)
import { mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createHash, randomBytes, scryptSync, createCipheriv } from 'node:crypto';
import { createClient } from './lib/firestore-rest.mjs';
import { parseServiceAccount, makeTokenGetter } from './lib/google-auth.mjs';

const RAW = process.env.FIREBASE_SERVICE_ACCOUNT;
const PASS = process.env.BACKUP_PASSPHRASE;
if (!RAW) { console.log('FIREBASE_SERVICE_ACCOUNT secret is not set. Nothing to do.'); process.exit(0); }
if (!PASS || PASS.length < 12) { console.error('Set a BACKUP_PASSPHRASE secret of at least 12 characters. Refusing to create an unencrypted backup.'); process.exit(1); }
const sa = parseServiceAccount(RAW);
const EXPECTED_PROJECT = process.env.MEETBOOK_FIREBASE_PROJECT_ID;
if (!EXPECTED_PROJECT) { console.error('Set MEETBOOK_FIREBASE_PROJECT_ID to the new MeetBook Firebase project ID. Refusing backup.'); process.exit(1); }
if (sa.project_id !== EXPECTED_PROJECT || sa.project_id === 'mysocial-33681') {
  console.error('Firebase service account project does not match the configured MeetBook project. Refusing backup.'); process.exit(1);
}
const fs = createClient({ projectId: sa.project_id, fsUrl: process.env.FS_URL || 'https://firestore.googleapis.com', getToken: makeTokenGetter(sa) });
const OUT = process.env.OUT_DIR || 'backup-out';
const KEEP_IMAGES = process.env.BACKUP_INCLUDE_IMAGES === '1';

const TOP = ['users', 'posts', 'reels', 'stories', 'groups', 'friendships', 'friendRequests', 'follows', 'notifications', 'reports', 'chats', 'admins', 'adminLogs', 'settings', 'announcements', 'deletionRequests', 'botLogs'];
const SUB = { posts: 'comments', chats: 'messages', groups: 'requests' };

const slim = (v) => {
  if (typeof v === 'string') return !KEEP_IMAGES && v.startsWith('data:image') && v.length > 2048 ? '[image omitted from backup]' : v;
  if (v instanceof Date) return { $ts: v.toISOString() }; // typed, so restore can bring back real timestamps
  if (Array.isArray(v)) return v.map(slim);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, slim(x)]));
  return v;
};

const dump = {};
const counts = {};
for (const c of TOP) {
  const docs = await fs.listAll(c);
  dump[c] = docs.map(({ path, ...d }) => slim(d));
  counts[c] = docs.length;
  if (SUB[c]) {
    for (const d of docs) {
      const subs = await fs.listAll(`${c}/${d.id}/${SUB[c]}`);
      if (subs.length) { (dump[`${c}/${SUB[c]}`] ||= {})[d.id] = subs.map(({ path, ...x }) => slim(x)); counts[`${c}/${SUB[c]}`] = (counts[`${c}/${SUB[c]}`] || 0) + subs.length; }
    }
  }
  console.log(`${c}: ${docs.length}`);
}

const plain = gzipSync(Buffer.from(JSON.stringify({ format: 2, project: sa.project_id, takenAt: new Date().toISOString(), imagesIncluded: KEEP_IMAGES, data: dump })));
const salt = randomBytes(16), iv = randomBytes(12);
const cipher = createCipheriv('aes-256-gcm', scryptSync(PASS, salt, 32), iv);
const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
const file = Buffer.concat([Buffer.from('MBK01'), salt, iv, cipher.getAuthTag(), enc]);
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const name = `meetbook-backup-${stamp}.json.gz.enc`;
const sha = createHash('sha256').update(file).digest('hex');

if (process.env.DRY_RUN === '1') { console.log(`[dry] would write ${name} (${file.length} bytes)`); process.exit(0); }
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/${name}`, file);
await fs.patch('system/backups', { lastRunAt: new Date(), lastFile: name, sizeBytes: file.length, sha256: sha, counts, imagesIncluded: KEEP_IMAGES, status: 'ok' });
console.log(`Backup written: ${name} (${file.length} bytes, sha256 ${sha.slice(0, 12)}…)`);
