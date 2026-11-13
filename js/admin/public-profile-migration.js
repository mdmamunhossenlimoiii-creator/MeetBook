// One-time lazy backfill for legacy accounts after private user documents are locked down.
import { db, collection, getDocs, doc, writeBatch, serverTimestamp } from '../firebase.js';

export async function backfillPublicProfiles() {
  const [users, profiles] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDocs(collection(db, 'publicProfiles'))
  ]);
  const existing = new Set(profiles.docs.map((d) => d.id));
  const missing = users.docs.filter((d) => !existing.has(d.id));
  for (let i = 0; i < missing.length; i += 400) {
    const batch = writeBatch(db);
    for (const snap of missing.slice(i, i + 400)) {
      const u = snap.data();
      batch.set(doc(db, 'publicProfiles', snap.id), {
        name: u.name || 'Unknown user',
        nameLower: String(u.name || '').toLowerCase(),
        bio: String(u.bio || '').slice(0, 500),
        photo: u.photo || '',
        cover: u.cover || '',
        isBot: u.isBot === true,
        roleEmoji: u.roleEmoji || '',
        verified: u.verified === true,
        profileVisibility: u.settings?.profileVisibility === 'friends' ? 'friends' : 'everyone',
        createdAt: u.createdAt || serverTimestamp()
      }, { merge: true });
    }
    await batch.commit();
  }
  return missing.length;
}
