// Usage: BACKUP_PASSPHRASE=... node scripts/backup-decrypt.mjs backup.json.gz.enc out.json
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { scryptSync, createDecipheriv } from 'node:crypto';
const [inp, out] = process.argv.slice(2);
if (!inp || !out || !process.env.BACKUP_PASSPHRASE) { console.error('Usage: BACKUP_PASSPHRASE=... node scripts/backup-decrypt.mjs <in.enc> <out.json>'); process.exit(1); }
const b = readFileSync(inp);
if (b.subarray(0, 5).toString() !== 'MSBK1') { console.error('Not a MySocial backup file.'); process.exit(1); }
try {
  const d = createDecipheriv('aes-256-gcm', scryptSync(process.env.BACKUP_PASSPHRASE, b.subarray(5, 21), 32), b.subarray(21, 33));
  d.setAuthTag(b.subarray(33, 49));
  const plain = gunzipSync(Buffer.concat([d.update(b.subarray(49)), d.final()])); // nothing is written unless this succeeds
  writeFileSync(out, plain); console.log('Decrypted to', out);
} catch { console.error('Wrong passphrase or corrupted file.'); process.exit(1); }
