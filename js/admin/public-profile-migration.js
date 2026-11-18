// Safe, idempotent backfill for legacy profile projections.
// Admin repairs only derived, allowlisted documents; private user data remains in users/{uid}.
// Projection collections are deliberately NOT listed: malformed legacy rows are unreadable by Rules,
// so a collection scan would fail before the migration could repair them.
import { db, collection, getDocs, doc, getDoc, writeBatch, serverTimestamp } from '../firebase.js';
import { buildBotPublicProfile, buildDirectoryProjection } from './public-profile-projections.js';

const isPermissionDenied = (error) => error?.code === 'permission-denied';

export async function backfillPublicProfiles() {
  // Staff can read canonical user documents. This is the only collection scan.
  const users = await getDocs(collection(db, 'users'));
  const operations = [];
  const botProfileDeletes = [];
  let directoryWrites = 0;
  let directoryDeletes = 0;
  let botProfileCreates = 0;
  let botProfileRepairs = 0;

  for (const snapshot of users.docs) {
    const user = snapshot.data();
    const directoryRef = doc(db, 'publicDirectory', snapshot.id);
    const directory = buildDirectoryProjection(user);

    if (directory) {
      // Replace the exact minimal projection without reading a privacy-filtered legacy row.
      operations.push({ kind: 'set', ref: directoryRef, data: directory });
      directoryWrites += 1;
    } else {
      // A directory row without a valid canonical source must not remain discoverable.
      operations.push({ kind: 'delete', ref: directoryRef });
      directoryDeletes += 1;
    }

    if (user.isBot === true) {
      const profile = buildBotPublicProfile(user, serverTimestamp());
      if (!profile) continue;

      const profileRef = doc(db, 'publicProfiles', snapshot.id);
      let needsCreate = false;
      try {
        const current = await getDoc(profileRef);
        needsCreate = !current.exists();
      } catch (error) {
        if (!isPermissionDenied(error)) throw error;
        // Rules intentionally hide malformed projections. Admin can delete and rebuild
        // this bot-only derived document; human detailed profiles are never touched.
        botProfileDeletes.push(profileRef);
        needsCreate = true;
        botProfileRepairs += 1;
      }

      if (needsCreate) {
        operations.push({ kind: 'set', ref: profileRef, data: profile });
        botProfileCreates += 1;
      }
    }
  }

  // Delete unreadable bot projections first; a later batch recreates them from canonical bot data.
  for (let index = 0; index < botProfileDeletes.length; index += 400) {
    const batch = writeBatch(db);
    for (const ref of botProfileDeletes.slice(index, index + 400)) batch.delete(ref);
    await batch.commit();
  }

  // Keep every batch below Firestore's 500-write ceiling.
  for (let index = 0; index < operations.length; index += 400) {
    const batch = writeBatch(db);
    for (const operation of operations.slice(index, index + 400)) {
      if (operation.kind === 'delete') batch.delete(operation.ref);
      else batch.set(operation.ref, operation.data);
    }
    await batch.commit();
  }

  return { directoryWrites, directoryDeletes, botProfileCreates, botProfileRepairs };
}
