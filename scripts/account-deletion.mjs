// Scheduled job (GitHub Actions): permanently deletes accounts that a SUPER ADMIN queued in
// /deletionRequests/{uid} (status "pending"). Runs with a Google service account (secret
// FIREBASE_SERVICE_ACCOUNT), which is why it can delete Firebase Auth users and bypass rules.
// The key lives only in GitHub Secrets: never in the website or the repository.
//
// Order (safe to re-run if it stops half way):
//   1. re-check the request (requested by a CURRENT super admin; target is not staff / not a bot)
//   2. block the account (users/{uid}.banned = true) so it cannot write new data while we purge
//   3. purge in pages until nothing is left (queries return max 500 docs, deletes go in batches of 400,
//      a Firestore commit allows 500)
//   4. delete users/{uid}, then the Firebase Auth user
//   5. mark the request done + write an admin log entry
//
// Deleted: Auth user, users/{uid} (+saved), their posts (+comments), reels, stories, friend requests,
// friendships, follows, notifications (to/from), bot-chat inbox, private chats (+messages), groups they alone belong to.
// Removed from: group chats and shared groups (membership only).
// NOT removed (honest limits): comments they wrote on OTHER people's posts, their reaction on others' posts,
// copies of their name inside other people's documents (shared posts, chat previews), reports about them,
// and staff audit logs. Finding comments needs a collection-group index; they show the name saved at the time.
// This app stores no files in Cloud Storage (images are inside Firestore docs), so there is nothing to delete there.
//
// Env: FIREBASE_SERVICE_ACCOUNT, DRY_RUN=1, FS_URL, IDT_URL, TOKEN_URL (the last three are for tests).
import { createClient, eq, arrayContains } from './lib/firestore-rest.mjs';
import { parseServiceAccount, makeTokenGetter } from './lib/google-auth.mjs';

const RAW = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!RAW) { console.log('FIREBASE_SERVICE_ACCOUNT secret is not set. Nothing to do.'); process.exit(0); }
const DRY = process.env.DRY_RUN === '1';
const sa = parseServiceAccount(RAW);
const EXPECTED_PROJECT = process.env.MEETBOOK_FIREBASE_PROJECT_ID;
if (!EXPECTED_PROJECT) { console.error('Set MEETBOOK_FIREBASE_PROJECT_ID. Refusing account deletion.'); process.exit(1); }
if (sa.project_id !== EXPECTED_PROJECT || sa.project_id === 'mysocial-33681') {
  console.error('Service-account project does not match the configured MeetBook project. Refusing account deletion.'); process.exit(1);
}
const getToken = makeTokenGetter(sa);
const FS_URL = process.env.FS_URL || 'https://firestore.googleapis.com';
const IDT_URL = process.env.IDT_URL || 'https://identitytoolkit.googleapis.com';
const fs = createClient({ projectId: sa.project_id, fsUrl: FS_URL, getToken });
const PAGE = 500;
const q = (collectionId, where) => fs.query({ from: [{ collectionId }], where, limit: PAGE });

async function deleteAuthUser(uid) {
  const res = await fetch(`${IDT_URL}/v1/projects/${sa.project_id}/accounts:delete`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getToken()}` },
    body: JSON.stringify({ localId: uid })
  });
  if (res.ok) return 'deleted';
  const t = await res.text();
  if (/USER_NOT_FOUND/.test(t)) return 'already gone';
  throw new Error(`Auth delete failed (${res.status}): ${t.slice(0, 200)}`);
}

// delete every doc of a (sub)collection, page by page
async function dropCollection(path) {
  let n = 0;
  for (let i = 0; i < 1000; i++) {
    const docs = await fs.listAll(path, { max: 300 });
    if (!docs.length) return n;
    if (DRY) return docs.length;
    await fs.deleteMany(docs.map((d) => d.path));
    n += docs.length;
  }
  throw new Error(`Could not empty ${path}`);
}

async function purge(uid) {
  const counts = {};
  const add = (k, n) => { counts[k] = (counts[k] || 0) + n; };

  // delete everything a query matches, repeating until the query is empty
  async function drain(label, collectionId, where, before) {
    for (let i = 0; i < 2000; i++) {
      const docs = await q(collectionId, where);
      if (!docs.length) return;
      if (before) for (const d of docs) await before(d);
      if (DRY) { add(label, docs.length); return; }
      await fs.deleteMany(docs.map((d) => d.path));
      add(label, docs.length);
    }
    throw new Error(`Could not drain ${label}: documents keep coming back`);
  }

  await drain('posts', 'posts', eq('uid', uid), async (p) => add('comments', await dropCollection(`posts/${p.id}/comments`)));
  await drain('reels', 'reels', eq('uid', uid));
  await drain('stories', 'stories', eq('uid', uid));
  await drain('friendRequests', 'friendRequests', eq('from', uid));
  await drain('friendRequests', 'friendRequests', eq('to', uid));
  await drain('friendships', 'friendships', arrayContains('members', uid));
  await drain('follows', 'follows', eq('follower', uid));
  await drain('follows', 'follows', eq('followed', uid));
  await drain('notifications', 'notifications', eq('to', uid));
  await drain('notifications', 'notifications', eq('from', uid));
  await drain('botInbox', 'botInbox', eq('fromUid', uid));
  add('saved', await dropCollection(`users/${uid}/saved`));

  // chats: private chats are deleted with their messages; group chats only lose this member
  for (let i = 0; i < 2000; i++) {
    const chats = await q('chats', arrayContains('members', uid));
    if (!chats.length) break;
    for (const c of chats) {
      if (DRY) { add('chats', 1); continue; }
      if (c.type === 'private') { add('messages', await dropCollection(`chats/${c.id}/messages`)); await fs.deleteMany([c.path]); add('chats', 1); }
      else await fs.patch(`chats/${c.id}`, { members: (c.members || []).filter((m) => m !== uid) }, ['members']);
    }
    if (DRY) break;
  }
  // groups: deleted if this was the only member, otherwise only the membership is removed
  for (let i = 0; i < 2000; i++) {
    const groups = await q('groups', arrayContains('members', uid));
    if (!groups.length) break;
    for (const g of groups) {
      if (DRY) { add('groups', 1); continue; }
      const rest = (g.members || []).filter((m) => m !== uid);
      if (!rest.length) { add('groupRequests', await dropCollection(`groups/${g.id}/requests`)); await fs.deleteMany([g.path]); add('groups', 1); }
      else await fs.patch(`groups/${g.id}`, { members: rest }, ['members']);
    }
    if (DRY) break;
  }
  const total = Object.entries(counts).reduce((a, [, n]) => a + n, 0);
  return { counts, total };
}

async function main() {
  const pending = await q('deletionRequests', eq('status', 'pending'));
  console.log(`${pending.length} pending deletion request(s)${DRY ? ' (dry run)' : ''}`);
  for (const r of pending) {
    const uid = r.id;
    const finish = async (status, note, extra = {}) => {
      if (DRY) { console.log(`[dry] ${uid}: ${status} ${note}`); return; }
      await fs.patch(`deletionRequests/${uid}`, { status, note, finishedAt: new Date(), ...extra }, ['status', 'note', 'finishedAt', ...Object.keys(extra)]);
      await fs.create('adminLogs', { actorUid: 'system', actorName: 'Deletion job', action: `account deletion ${status}`, target: uid, details: note, createdAt: new Date() });
    };
    try {
      if (/^bot_\d\d$/.test(uid)) { await finish('refused', 'AI bots are removed from Admin -> AI Bots, not here.'); continue; }
      if (await fs.get(`admins/${uid}`)) { await finish('refused', 'Staff accounts must be removed from Staff first.'); continue; }
      const requester = r.requestedBy ? await fs.get(`admins/${r.requestedBy}`) : null;
      if (!requester || requester.role !== 'super_admin') { await finish('refused', 'The person who requested this is not a super admin (any more).'); continue; }

      const user = await fs.get(`users/${uid}`);
      if (user && !DRY) await fs.patch(`users/${uid}`, { banned: true }, ['banned']); // stop new writes while purging
      const out = await purge(uid);
      if (user && !DRY) await fs.deleteMany([user.path]);
      const auth = DRY ? 'skipped (dry run)' : await deleteAuthUser(uid);
      await finish('done', `Auth: ${auth}. Firestore documents removed: ${out.total}${user ? '' : ' (no profile document existed)'}.`, { counts: out.counts });
      console.log(`Deleted ${uid}: auth ${auth}, ${out.total} docs`);
    } catch (e) {
      console.error(`Failed for ${uid}: ${e.message}`);
      if (!DRY) await fs.patch(`deletionRequests/${uid}`, { note: `Failed (will retry): ${e.message.slice(0, 300)}`, lastTriedAt: new Date() }, ['note', 'lastTriedAt']).catch(() => {});
      process.exitCode = 1;
    }
  }
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
