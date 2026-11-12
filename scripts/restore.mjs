// Restore from an encrypted backup made by scripts/backup.mjs. Run it by hand on YOUR computer, never in CI.
//
//   BACKUP_PASSPHRASE=... FIREBASE_SERVICE_ACCOUNT="$(cat key.json)" CONFIRM_PROJECT_ID=<your project id> \
//     node scripts/restore.mjs backup.json.gz.enc            # DRY RUN: only prints what it would do
//     ... node scripts/restore.mjs backup.json.gz.enc --apply  # really writes
//
// Safety rules:
//  * dry run unless --apply is given
//  * CONFIRM_PROJECT_ID must equal the service account's project id (stops restoring into the wrong project)
//  * by default only documents that do NOT exist yet are created; --overwrite replaces existing ones
//  * `admins` and `deletionRequests` are never restored (nobody gets staff rights or a pending deletion back by accident)
//  * fields that the backup replaced with "[image omitted from backup]" are left out, never written
//  * Firebase Authentication accounts are NOT in a backup, so restored profiles only work for accounts that still exist
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { scryptSync, createDecipheriv } from 'node:crypto';
import { createClient } from './lib/firestore-rest.mjs';
import { parseServiceAccount, makeTokenGetter } from './lib/google-auth.mjs';

const file = process.argv[2];
const APPLY = process.argv.includes('--apply');
const OVERWRITE = process.argv.includes('--overwrite');
const SKIP = new Set(['admins', 'deletionRequests']);
const PLACEHOLDER = '[image omitted from backup]';

if (!file || !process.env.BACKUP_PASSPHRASE || !process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error('Usage: BACKUP_PASSPHRASE=... FIREBASE_SERVICE_ACCOUNT=... CONFIRM_PROJECT_ID=... node scripts/restore.mjs <backup.enc> [--apply] [--overwrite]');
  process.exit(1);
}
const sa = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT);
if (process.env.CONFIRM_PROJECT_ID !== sa.project_id) {
  console.error(`Refusing: set CONFIRM_PROJECT_ID=${sa.project_id} to confirm you mean this project.`);
  process.exit(1);
}

const b = readFileSync(file);
if (b.subarray(0, 5).toString() !== 'MBK01') { console.error('Not a MeetBook backup file.'); process.exit(1); }
let backup;
try {
  const d = createDecipheriv('aes-256-gcm', scryptSync(process.env.BACKUP_PASSPHRASE, b.subarray(5, 21), 32), b.subarray(21, 33));
  d.setAuthTag(b.subarray(33, 49));
  backup = JSON.parse(gunzipSync(Buffer.concat([d.update(b.subarray(49)), d.final()])).toString('utf8'));
} catch { console.error('Wrong passphrase or corrupted file.'); process.exit(1); }
if (backup.format !== 2) { console.error(`Unsupported backup format ${backup.format}. Only format 2 (typed timestamps) can be restored.`); process.exit(1); }
if (backup.project !== sa.project_id) console.warn(`Note: this backup was taken from project "${backup.project}", restoring into "${sa.project_id}".`);

// {$ts: iso} -> Date, drop omitted-image placeholders.
// A look-alike {$ts: "garbage"} (users may store arbitrary maps on their own profile) is kept as the plain map it was.
const decode = (v) => {
  if (Array.isArray(v)) return v.filter((x) => x !== PLACEHOLDER).map(decode);
  if (v && typeof v === 'object') {
    if (typeof v.$ts === 'string' && Object.keys(v).length === 1) {
      const d = new Date(v.$ts);
      if (!Number.isNaN(d.getTime())) return d;
    }
    return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== PLACEHOLDER).map(([k, x]) => [k, decode(x)]));
  }
  return v;
};

const fs = createClient({ projectId: sa.project_id, fsUrl: process.env.FS_URL || 'https://firestore.googleapis.com', getToken: makeTokenGetter(sa) });
const stats = { created: 0, overwritten: 0, skippedExisting: 0, skippedCollections: [] };

async function put(path, data) {
  const existing = await fs.get(path);
  if (existing && !OVERWRITE) { stats.skippedExisting++; return; }
  if (APPLY) await fs.set(path, data);
  if (existing) stats.overwritten++; else stats.created++;
}

for (const [coll, docs] of Object.entries(backup.data)) {
  const top = coll.split('/')[0];
  if (SKIP.has(top)) { stats.skippedCollections.push(coll); continue; }
  if (coll.includes('/')) { // sub-collection: { parentId: [docs] }
    const sub = coll.split('/')[1];
    for (const [parentId, items] of Object.entries(docs)) for (const { id, ...rest } of items) await put(`${top}/${parentId}/${sub}/${id}`, decode(rest));
  } else for (const { id, ...rest } of docs) await put(`${coll}/${id}`, decode(rest));
}
console.log(`${APPLY ? 'APPLIED' : 'DRY RUN (nothing written, add --apply)'}: ${stats.created} to create, ${stats.overwritten} to overwrite, ${stats.skippedExisting} existing kept.`);
if (stats.skippedCollections.length) console.log(`Never restored: ${stats.skippedCollections.join(', ')}`);
