// AI bot accounts: Firestore profiles (users/bot_NN, isBot: true). Bots have NO Firebase Auth login.
// Only staff can create / edit / delete them or post as them; firestore.rules enforce that (and forbid video posts).
// Automatic activity (posts, engagement, chat) is done by scripts/bot-runner.mjs in GitHub Actions. No credentials here.
import {
  db, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, collection, query, where, limit, getDocs, serverTimestamp, increment
} from './firebase.js';
import { DEFAULT_SETTINGS } from './auth.js';
import { invalidateUser } from './utils.js';
import { BOTS, BOT_DEFAULTS, botAvatar, botCover } from './bots-data.js';

export const MAX_BOTS = 30; // rules allow bot_01 .. bot_30

const profileFromBuiltIn = (b, i) => ({
  name: b.name, nameLower: b.name.toLowerCase(), username: b.username, bio: b.bio,
  photo: botAvatar(i), cover: botCover(i),
  personality: b.personality, interests: b.interests, lang: b.lang,
  active: true, autoPost: true, autoComment: true, autoReaction: true, chatEnabled: true, dailyLimit: BOT_DEFAULTS.dailyLimit,
  ideas: [], ideasBn: [],
  banned: false, isBot: true, settings: { ...DEFAULT_SETTINGS }, createdAt: serverTimestamp()
});

export async function listBots() {
  const snap = await getDocs(query(collection(db, 'users'), where('isBot', '==', true), limit(60)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.id.localeCompare(b.id));
}

// Creates the built-in bots that do not exist yet. Existing bots are NOT touched, so admin edits survive.
export async function seedBots() {
  const snaps = await Promise.all(BOTS.map((b) => getDoc(doc(db, 'users', b.id))));
  let created = 0;
  for (let i = 0; i < BOTS.length; i++) {
    if (snaps[i].exists()) continue;
    await setDoc(doc(db, 'users', BOTS[i].id), profileFromBuiltIn(BOTS[i], i));
    created++;
  }
  return { created, existing: BOTS.length - created };
}

export function nextBotId(existing) {
  const used = new Set(existing.map((b) => b.id));
  for (let n = 1; n <= MAX_BOTS; n++) { const id = `bot_${String(n).padStart(2, '0')}`; if (!used.has(id)) return id; }
  return null;
}

export async function createBot(existing, data) {
  const id = nextBotId(existing);
  if (!id) throw new Error(`The limit is ${MAX_BOTS} bots.`);
  const n = Number(id.slice(4));
  await setDoc(doc(db, 'users', id), {
    ...BOT_DEFAULTS, ideas: [], ideasBn: [], interests: [], username: id, bio: 'AI bot.',
    photo: botAvatar(n), cover: botCover(n), ...data,
    nameLower: String(data.name).toLowerCase(), banned: false, isBot: true, settings: { ...DEFAULT_SETTINGS }, createdAt: serverTimestamp()
  });
  return id;
}

export async function saveBot(id, patch) {
  const data = { ...patch };
  if (data.name) data.nameLower = data.name.toLowerCase();
  await updateDoc(doc(db, 'users', id), data);
  invalidateUser(id);
}

export async function deleteBot(id) {
  await deleteDoc(doc(db, 'users', id));
  invalidateUser(id);
}

// Manual actions (an admin account writes as the bot; rules verify the admin role).
export async function postAsBot(bot, text, image = '') {
  const clean = String(text || '').trim();
  if (!clean && !image) throw new Error('Write something or add a photo.');
  return addDoc(collection(db, 'posts'), {
    uid: bot.id, authorName: bot.name, text: clean.slice(0, 5000), image: image || '',
    videoUrl: '', // bots never post videos (rules also enforce this)
    visibility: 'public', audience: [], groupId: null, sharedFrom: null,
    reactions: {}, commentCount: 0, shareCount: 0, createdAt: serverTimestamp()
  });
}

export async function commentAsBot(bot, postId, text) {
  const clean = String(text || '').trim();
  if (!clean) throw new Error('Write a comment first.');
  // Consent rule (also enforced by firestore.rules): bots only comment on bot posts or on posts of people who allowed it.
  const post = await getDoc(doc(db, 'posts', postId));
  if (!post.exists()) throw new Error('That post does not exist.');
  const owner = await getDoc(doc(db, 'users', post.data().uid));
  if (!(owner.exists() && (owner.data().isBot || owner.data().settings?.allowBotEngagement === true))) {
    throw new Error('This person has not allowed AI bots to comment on their posts (Settings -> AI bots).');
  }
  await addDoc(collection(db, 'posts', postId, 'comments'), { uid: bot.id, authorName: bot.name, text: clean.slice(0, 2000), ai: true, createdAt: serverTimestamp() });
  await updateDoc(doc(db, 'posts', postId), { commentCount: increment(1) });
}
