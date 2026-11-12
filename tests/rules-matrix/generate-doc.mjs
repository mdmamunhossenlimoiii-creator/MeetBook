// Builds docs/PERMISSIONS.md from the permission matrix (tests/rules-matrix/scenarios.mjs).
// Usage: node tests/rules-matrix/generate-doc.mjs        (writes the file)
// tests/rules-matrix/permissions-doc.test.mjs fails when the file is out of date.
import { writeFileSync } from 'node:fs';
import { CAPS, ACTORS } from './scenarios.mjs';

const mark = (ok) => (ok ? '✅' : '❌');
function normal(c) {
  // normal users: u1, u2 (have a profile) and u_new (profile not created yet)
  const n = ['user', 'other', 'fresh'].filter((k) => c.allow.includes(k)).length;
  return n === 3 ? '✅' : n > 0 ? '◐' : '❌';
}
const esc = (s) => String(s).replace(/\|/g, '\\|');

export function buildDoc() {
  const groups = [...new Set(CAPS.map((c) => c.group))];
  const total = CAPS.length;
  const out = [];
  out.push(`# MySocial permission matrix

> Generated from \`tests/rules-matrix/scenarios.mjs\` by \`node tests/rules-matrix/generate-doc.mjs\`. **Do not edit by hand**:
> a test fails when this file is out of date. The expectations in the matrix were written by hand from the security
> requirements (they are not copied from the rules), then checked against \`firestore.rules\`.

## How to read it

| Symbol | Meaning |
|---|---|
| ✅ | allowed |
| ❌ | denied (Firestore rules reject the request) |
| ◐ | normal users are allowed **only for their own data** (or only for data of a specific owner, see the row text); the other normal user is denied |

Roles come from \`/admins/{uid}.role\` (only a Super Admin can write that collection). **A missing or unknown role means no power at all.**
Normal users cannot change their own role: \`/admins\` is not writable by them, and the \`role\` field on a profile document has no effect.

| Column | Who |
|---|---|
| Normal user | signed in, has a profile, not blocked, not suspended |
| Moderator / Admin / Super Admin | \`role\` = moderator / admin / super_admin |
| Not signed in | no Firebase Auth session |
| Blocked / Suspended | \`users/{uid}.banned == true\` / \`suspendedUntil\` in the future |
| No role / Unknown role | admin document without \`role\` / with a value we do not know (fail-closed) |
| Bot runner | the GitHub Action account registered in \`/botRunners\` |

${total} capabilities × ${Object.keys(ACTORS).length} actors = ${total * Object.keys(ACTORS).length} cases are executed on every test run.
`);
  for (const g of groups) {
    out.push(`\n## ${g}\n`);
    out.push('| Capability | Normal user | Moderator | Admin | Super Admin | Not signed in | Blocked | Suspended | No role | Unknown role | Bot runner |');
    out.push('|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|');
    for (const c of CAPS.filter((x) => x.group === g)) {
      const A = (k) => mark(c.allow.includes(k));
      out.push(`| ${esc(c.name)} | ${normal(c)} | ${A('moderator')} | ${A('admin')} | ${A('super')} | ${A('anon')} | ${A('banned')} | ${A('suspended')} | ${A('legacy')} | ${A('badrole')} | ${A('runner')} |`);
    }
  }
  out.push(`
## What this does NOT prove

* The matrix is run by the in-repo rules interpreter on every test run, and by the **real Firebase Emulator** only in the GitHub Actions job \`rules-emulator\`. Look at the latest run of that job before trusting a release.
* A few protections are enforced only in the website UI, not by rules (hidden posts, maintenance mode); see ARCHITECTURE.md "Known limits".
* List queries (\`allow list\`) are not part of the matrix; document reads, creates, updates and deletes are.
`);
  return out.join('\n');
}
if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(new URL('../../docs/PERMISSIONS.md', import.meta.url), buildDoc());
  console.log('docs/PERMISSIONS.md written');
}
