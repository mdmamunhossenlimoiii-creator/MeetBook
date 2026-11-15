// Safe, idempotent backfill for legacy profile projections.
// Admin may create/update only the minimal publicDirectory projection for people.
// A missing detailed publicProfiles document is created here only for AI bots;
// human detailed profiles and bot-consent projections remain owner-created on sign-in.
import { db, collection, getDocs, doc, writeBatch, serverTimestamp } from '../firebase.js';
import { buildBotPublicProfile, buildDirectoryProjection } from './public-profile-projections.js';

const DIRECTORY_FIELDS = ['name', 'nameLower', 'isBot', 'roleEmoji', 'verified'];

export async function backfillPublicProfiles() {
  const [users, profiles, directories] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDocs(collection(db, 'publicProfiles')),
    getDocs(collection(db, 'publicDirectory'))
  ]);

  const existingProfiles = new Set(profiles.docs.map((snapshot) => snapshot.id));
  const existingDirectories = new Map(directories.docs.map((snapshot) => [snapshot.id, snapshot.data()]));
  const operations = [];
  let directoryWrites = 0;
  let botProfileCreates = 0;

  for (const snapshot of users.docs) {
    const user = snapshot.data();
    const directory = buildDirectoryProjection(user);
    if (directory) {
      const current = existingDirectories.get(snapshot.id);
      const unchanged = current && DIRECTORY_FIELDS.every((field) => current[field] === directory[field]);
      if (!unchanged) {
        operations.push({ ref: doc(db, 'publicDirectory', snapshot.id), data: directory });
        directoryWrites += 1;
      }
    }

    if (user.isBot === true && !existingProfiles.has(snapshot.id)) {
      const profile = buildBotPublicProfile(user, serverTimestamp());
      if (profile) {
        operations.push({ ref: doc(db, 'publicProfiles', snapshot.id), data: profile });
        botProfileCreates += 1;
      }
    }
  }

  // Keep every batch below Firestore's 500-write ceiling.
  for (let index = 0; index < operations.length; index += 400) {
    const batch = writeBatch(db);
    for (const operation of operations.slice(index, index + 400)) {
      // Replace with the exact allowlisted projection; never merge unexpected fields.
      batch.set(operation.ref, operation.data);
    }
    await batch.commit();
  }

  return { directoryWrites, botProfileCreates };
}
