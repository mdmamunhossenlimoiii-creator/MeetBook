// Scheduled job (GitHub Actions): runs the AI bots. Everything is template based (js/bots-brain.js), no LLM.
//
// Security model
//  * No Admin SDK / service-account key. The job signs in as a normal Firebase Auth user (the
//    "bot runner") with email + password from GitHub Secrets and uses Firestore's REST API.
//  * Firestore rules decide what that user may do: only act AS an AI bot (public posts, never video,
//    comments, a reaction under a bot's own key, chat replies). It cannot touch real users' data.
//
// What it does each run (all limits are enforced here AND configurable from the Admin panel):
//  1. Global switch  settings/global.botsEnabled (default on). Off = the job exits immediately.
//  2. Auto posts     bots with autoPost on, within their daily limit.
//  3. Auto engagement on REAL users' posts: ONLY when the author turned on
//                    Settings -> "Allow AI bots to react and comment" (users/{uid}.settings.allowBotEngagement).
//                    At most one bot per post, a relevant comment + a reaction, always shown as AI.
//  4. Bot-to-bot comments: only if settings/global.botToBotComments is on (default OFF, to avoid
//                    staged conversations that look like real popularity).
//  5. Chat replies   answers messages users sent to a bot (botInbox).
//  Every action is written to botLogs.
//
// Env: BOT_RUNNER_EMAIL, BOT_RUNNER_PASSWORD (secrets), BOT_POSTS, BOT_COMMENTS (optional),
//      DRY_RUN=1 (print only), AUTH_URL / FS_URL (override endpoints, used by tests).
import { BOTS, isBotId } from '../js/bots-data.js';
import { makeComment, pickReaction, chatReply, nextPostText, relevance, normalize } from '../js/bots-brain.js';
import { firebaseConfig } from '../js/firebase-config.js';
import { createClient, eq, and } from './lib/firestore-rest.mjs';

const EMAIL = process.env.BOT_RUNNER_EMAIL;
const PASSWORD = process.env.BOT_RUNNER_PASSWORD;
const AUTH_URL = process.env.AUTH_URL || 'https://identitytoolkit.googleapis.com';
const FS_URL = process.env.FS_URL || 'https://firestore.googleapis.com';
const DRY = process.env.DRY_RUN === '1';

if (!EMAIL || !PASSWORD) {
  console.log('Bot runner is not configured (BOT_RUNNER_EMAIL / BOT_RUNNER_PASSWORD secrets are missing). Nothing to do.');
  process.exit(0);
}
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error('js/firebase-config.js is missing apiKey or projectId.');
  process.exit(1);
}

const rand = (n) => Math.floor(Math.random() * n);
const shuffle = (a) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = rand(i + 1); [r[i], r[j]] = [r[j], r[i]]; } return r; };
const num = (v, d, max = 10) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : d; };
const today = () => new Date().toISOString().slice(0, 10);

let token = '';
const fs = createClient({ projectId: firebaseConfig.projectId, fsUrl: FS_URL, getToken: async () => token });

async function signIn() {
  const res = await fetch(`${AUTH_URL}/v1/accounts:signInWithPassword?key=${encodeURIComponent(firebaseConfig.apiKey)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true })
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.idToken) throw new Error(`Sign-in failed (${res.status}). Check the BOT_RUNNER_* secrets.`);
  token = j.idToken;
  console.log('Signed in as the bot runner.');
}

// ------------------------------------------------------------ state (kept in one small doc)
async function loadState() {
  const d = (await fs.get('botState/runner')) || {};
  const parse = (v, fb) => { try { return v ? JSON.parse(v) : fb; } catch { return fb; } };
  const st = {
    used: parse(d.used, {}), commented: parse(d.commented, []), engaged: parse(d.engaged, []),
    daily: parse(d.daily, {}), usedComments: parse(d.usedComments, {})
  };
  if (st.daily.date !== today()) st.daily = { date: today(), counts: {}, chat: {} };
  st.daily.counts ||= {}; st.daily.chat ||= {};
  return st;
}
async function saveState(st) {
  await fs.patch('botState/runner', {
    used: JSON.stringify(st.used),
    commented: JSON.stringify(st.commented.slice(-400)),
    engaged: JSON.stringify(st.engaged.slice(-400)),
    daily: JSON.stringify(st.daily),
    usedComments: JSON.stringify(st.usedComments),
    updatedAt: new Date()
  });
}

// ------------------------------------------------------------ write helpers (all honour DRY_RUN)
async function log(bot, kind, targetId, text) {
  if (DRY) return;
  try {
    await fs.create('botLogs', { botId: bot.id, botName: bot.name, kind, targetId: targetId || '', text: String(text || '').slice(0, 200), source: 'runner', createdAt: new Date() });
  } catch (e) { console.warn('log failed:', e.message); }
}

async function createPost(bot, text) {
  if (DRY) { console.log(`[dry] post as ${bot.name}: ${text}`); return 'dry'; }
  return fs.create('posts', {
    uid: bot.id, authorName: bot.name, text, image: '',
    videoUrl: '', // bots never post video (rules enforce this too)
    visibility: 'public', audience: [], groupId: null, sharedFrom: null,
    reactions: {}, commentCount: 0, shareCount: 0, createdAt: new Date()
  });
}

async function createComment(bot, postId, text) {
  if (DRY) { console.log(`[dry] comment as ${bot.name} on ${postId}: ${text}`); return; }
  await fs.create(`posts/${postId}/comments`, { uid: bot.id, authorName: bot.name, text, ai: true, createdAt: new Date() });
  await fs.increment(`posts/${postId}`, 'commentCount', 1);
}

async function react(bot, postId, type) {
  if (DRY) { console.log(`[dry] ${type} reaction as ${bot.name} on ${postId}`); return; }
  await fs.patch(`posts/${postId}`, { reactions: { [bot.id]: type } }, [`reactions.${bot.id}`]);
}

async function tell(bot, toUid, type, postId, extra) {
  if (DRY) return;
  try {
    await fs.create('notifications', { to: toUid, type, from: bot.id, fromName: bot.name, postId, extra: extra || null, read: false, createdAt: new Date() });
  } catch (e) { console.warn('notification failed:', e.message); }
}

// ------------------------------------------------------------ bots + limits
async function loadBots() {
  // Live profile docs (so admin edits apply); fall back to the built-in data for fields a doc lacks.
  const docs = await fs.query({ from: [{ collectionId: 'users' }], where: eq('isBot', true), limit: 60 });
  const out = [];
  for (const d of docs) {
    const base = BOTS.find((b) => b.id === d.id);
    if (!base && !isBotId(d.id)) continue;
    out.push({
      ...(base || { posts: [], postsBn: [] }),
      ...d,
      // post ideas: the ones an admin typed in the panel win over the built-in list
      posts: Array.isArray(d.ideas) && d.ideas.length ? d.ideas : (base && base.posts) || [],
      postsBn: Array.isArray(d.ideasBn) && d.ideasBn.length ? d.ideasBn : (base && base.postsBn) || [],
      interests: Array.isArray(d.interests) && d.interests.length ? d.interests : (base && base.interests) || [],
      personality: d.personality || (base && base.personality) || 'friendly',
      lang: d.lang || (base && base.lang) || 'both'
    });
  }
  return out;
}
const limitOf = (bot) => (Number.isFinite(bot.dailyLimit) ? bot.dailyLimit : 6);
const usedToday = (st, bot) => st.daily.counts[bot.id] || 0;
const canAct = (st, bot) => bot.active !== false && usedToday(st, bot) < limitOf(bot);
const spend = (st, bot) => { st.daily.counts[bot.id] = usedToday(st, bot) + 1; };

// ------------------------------------------------------------ main
async function main() {
  const nPosts = num(process.env.BOT_POSTS, 1 + rand(2));
  const nEngage = num(process.env.BOT_COMMENTS, 1 + rand(3));
  console.log(`Plan: up to ${nPosts} post(s), ${nEngage} engagement(s)${DRY ? ' (dry run)' : ''}`);

  await signIn();
  const global = (await fs.get('settings/global')) || {};
  if (global.botsEnabled === false) { console.log('Bots are switched OFF in the Admin panel (settings/global.botsEnabled). Nothing to do.'); return; }

  // Chat-only runs (BOT_POSTS=0 BOT_COMMENTS=0) exit right away when nobody wrote to a bot: saves free-tier reads.
  if (nPosts === 0 && nEngage === 0 && !(await fs.query({ from: [{ collectionId: 'botInbox' }], where: eq('handled', false), limit: 1 })).length) {
    console.log('No new messages for the bots.'); return;
  }

  const bots = await loadBots();
  if (!bots.length) { console.log('No bot profiles found. Create them in Admin -> AI Bots first.'); return; }
  const botMap = new Map(bots.map((b) => [b.id, b]));
  const st = await loadState();
  const stats = { posts: 0, comments: 0, reactions: 0, chats: 0 };

  // 2. auto posts
  for (const bot of shuffle(bots.filter((b) => b.autoPost !== false && canAct(st, b))).slice(0, nPosts)) {
    const pick = nextPostText(bot, st.used);
    if (!pick) continue;
    const id = await createPost(bot, pick.text);
    spend(st, bot); stats.posts++;
    await log(bot, 'post', id, pick.text);
    console.log(`Posted as ${bot.name} (${id}): ${pick.text.slice(0, 70)}`);
  }

  // 3/4. engagement on recent public posts
  let engaged = 0;
  if (nEngage > 0) {
    const recent = await fs.query({
      from: [{ collectionId: 'posts' }],
      where: eq('visibility', 'public'),
      orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
      limit: 30
    });
    const cutoff = Date.now() - 48 * 3600 * 1000;
    const authorOk = new Map();
    const optedIn = async (uid) => {
      if (!authorOk.has(uid)) {
        const u = await fs.get(`users/${uid}`);
        authorOk.set(uid, !!(u && !u.banned && u.settings && u.settings.allowBotEngagement === true));
      }
      return authorOk.get(uid);
    };
    for (const post of shuffle(recent)) {
      if (engaged >= nEngage) break;
      if (post.groupId || post.hidden || post.commentsDisabled || post.sharedFrom) continue;
      if (post.createdAt && post.createdAt.getTime() < cutoff) continue;
      const fromBot = isBotId(post.uid);
      if (st.engaged.includes(post.id)) continue;
      if (fromBot ? global.botToBotComments !== true : !(await optedIn(post.uid))) continue; // consent / default-off rules
      const ranked = shuffle(bots.filter((b) => b.id !== post.uid && b.autoComment !== false && canAct(st, b) && !st.commented.includes(`${post.id}:${b.id}`)))
        .map((b) => ({ b, score: relevance(b, post.text) }))
        .filter((x) => x.score > 0 || (fromBot && !post.text === false))
        .sort((a, c) => c.score - a.score);
      if (!ranked.length) continue;
      const bot = ranked[0].b;
      const usedTexts = [...(st.usedComments[bot.id] || [])];
      const c = makeComment({ bot, post: { text: post.text, image: post.image, authorName: post.authorName }, used: usedTexts });
      if (!c) continue;
      await createComment(bot, post.id, c.text);
      spend(st, bot); stats.comments++; engaged++;
      st.commented.push(`${post.id}:${bot.id}`); st.engaged.push(post.id);
      st.usedComments[bot.id] = [...usedTexts, normalize(c.text)].slice(-60);
      await log(bot, 'comment', post.id, c.text);
      if (!fromBot) await tell(bot, post.uid, 'comment', post.id);
      console.log(`Commented as ${bot.name} on post ${post.id} (${c.topic}/${c.lang}): ${c.text.slice(0, 60)}`);
      if (bot.autoReaction !== false && canAct(st, bot)) {
        const r = pickReaction({ bot, post });
        if (r) {
          await react(bot, post.id, r);
          spend(st, bot); stats.reactions++;
          await log(bot, 'reaction', post.id, r);
          if (!fromBot) await tell(bot, post.uid, 'reaction', post.id, r);
        }
      }
    }
  }

  // 5. chat replies
  const inbox = await fs.query({ from: [{ collectionId: 'botInbox' }], where: eq('handled', false), limit: 25 });
  for (const m of inbox) {
    const bot = botMap.get(m.botId);
    const mark = (skipped) => (DRY ? null : fs.patch(`botInbox/${m.id}`, { handled: true, handledAt: new Date(), ...(skipped ? { skipped } : {}) }));
    if (!bot || bot.active === false || bot.chatEnabled === false) { await mark('chat-disabled'); continue; }
    if ((st.daily.chat[m.fromUid] || 0) >= 15) { await mark('daily-limit'); continue; }
    const chat = await fs.get(`chats/${m.chatId}`);
    if (!chat || chat.type !== 'private' || !(chat.members || []).includes(m.fromUid) || !(chat.members || []).includes(bot.id)) { await mark('no-chat'); continue; }
    const hist = (await fs.query({
      from: [{ collectionId: 'messages' }],
      orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }], limit: 6
    }, `chats/${m.chatId}`)).reverse();
    const reply = chatReply({ bot, text: m.text, history: hist });
    if (DRY) console.log(`[dry] chat reply as ${bot.name}: ${reply.text}`);
    else {
      await fs.create(`chats/${m.chatId}/messages`, { uid: bot.id, text: reply.text, image: '', ai: true, createdAt: new Date() });
      await fs.patch(`chats/${m.chatId}`, { lastMessage: { text: reply.text, uid: bot.id }, lastAt: new Date() });
      await log(bot, 'chat', m.chatId, reply.text);
    }
    st.daily.chat[m.fromUid] = (st.daily.chat[m.fromUid] || 0) + 1;
    stats.chats++;
    await mark();
    console.log(`Chat reply as ${bot.name} (${reply.intent}/${reply.lang})`);
  }

  if (!DRY) await saveState(st);
  console.log(`Done: ${stats.posts} post(s), ${stats.comments} comment(s), ${stats.reactions} reaction(s), ${stats.chats} chat repl${stats.chats === 1 ? 'y' : 'ies'}.`);
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
