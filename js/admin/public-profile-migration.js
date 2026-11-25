// Safe, idempotent backfill for legacy profile projections.
// Admin repairs only derived, allowlisted documents; private user data remains in users/{uid}.
// Projection collections are deliberately NOT listed: malformed legacy rows are unreadable by Rules,
// so a collection scan would fail before the migration could repair them.
import { db, collection, getDocs, doc, getDoc, writeBatch, serverTimestamp } from '../firebase.js';
import { buildBotPublicProfile, buildDirectoryProjection } from './public-profile-projections.js';

const DIRECTORY_FIELDS = ['name', 'nameLower', 'isBot', 'roleEmoji', 'verified'];
const isPermissionDenied = (error) => error?.code === 'permission-denied';

export async function backfillPublicProfiles() {
  // Staff can read canonical user documents. This is the only collection scan.
  const users = await getDocs(collection(db, 'users'));
  const operations = [];
  const directoryDeleteRefs = [];
  const botProfileDeletes = [];
  let directoryWrites = 0;
  let directoryDeletes = 0;
  let directoryRepairs = 0;
  let botProfileCreates = 0;
  let botProfileRepairs = 0;

  for (const snapshot of users.docs) {
    const user = snapshot.data();
    const directoryRef = doc(db, 'publicDirectory', snapshot.id);
    const directory = buildDirectoryProjection(user, snapshot.id);

    if (!directory) {
      directoryDeleteRefs.push(directoryRef);
      directoryDeletes += 1;
    } else {
      let needsWrite = false;
      try {
        const current = await getDoc(directoryRef);
        if (!current.exists()) needsWrite = true;
        else {
          const data = current.data();
          const unchanged = Object.keys(data).length === DIRECTORY_FIELDS.length
            && DIRECTORY_FIELDS.every((field) => data[field] === directory[field]);
          needsWrite = !unchanged;
        }
      } catch (error) {
        if (!isPermissionDenied(error)) throw error;
        // Malformed or absent legacy rows may be unreadable; delete before recreating.
        directoryDeleteRefs.push(directoryRef);
        directoryRepairs += 1;
        needsWrite = true;
      }
      if (needsWrite) {
        operations.push({ kind: 'set', ref: directoryRef, data: directory });
        directoryWrites += 1;
      }
    }

    if (user.isBot === true) {
      const profile = buildBotPublicProfile(user, serverTimestamp(), snapshot.id);
      if (!profile) continue;

      const profileRef = doc(db, 'publicProfiles', snapshot.id);
      let needsWrite = false;
      try {
        const current = await getDoc(profileRef);
        if (!current.exists()) {
          needsWrite = true;
          botProfileCreates += 1;
        } else {
          const data = current.data();
          const profileFields = ['name', 'nameLower', 'bio', 'photo', 'cover', 'isBot', 'roleEmoji', 'verified', 'profileVisibility', 'createdAt'];
          const unchanged = Object.keys(data).length === profileFields.length
            && profileFields.filter((field) => field !== 'createdAt').every((field) => data[field] === profile[field])
            && data.createdAt && typeof data.createdAt.toDate === 'function';
          if (!unchanged) {
            // Only built-in bot projections are repaired here. Human detailed profiles are untouched.
            botProfileDeletes.push(profileRef);
            needsWrite = true;
            botProfileRepairs += 1;
          }
        }
      } catch (error) {
        if (!isPermissionDenied(error)) throw error;
        // Rules intentionally hide malformed projections. Admin can delete and rebuild
        // this bot-only derived document; human detailed profiles are never touched.
        botProfileDeletes.push(profileRef);
        needsWrite = true;
        botProfileRepairs += 1;
      }
      if (needsWrite) operations.push({ kind: 'set', ref: profileRef, data: profile });
    }
  }

  // Delete unreadable derived projections first; later batches recreate only valid projections.
  for (let index = 0; index < directoryDeleteRefs.length; index += 400) {
    const batch = writeBatch(db);
    for (const ref of directoryDeleteRefs.slice(index, index + 400)) batch.delete(ref);
    await batch.commit();
  }
  for (let index = 0; index < botProfileDeletes.length; index += 400) {
    const batch = writeBatch(db);
    for (const ref of botProfileDeletes.slice(index, index + 400)) batch.delete(ref);
    await batch.commit();
  }

  // Keep every batch below Firestore's 500-write ceiling.
  for (let index = 0; index < operations.length; index += 400) {
    const batch = writeBatch(db);
    for (const operation of operations.slice(index, index + 400)) {
      batch.set(operation.ref, operation.data);
    }
    await batch.commit();
  }

  return { directoryWrites, directoryDeletes, directoryRepairs, botProfileCreates, botProfileRepairs };
}
