// App entry: session lifecycle, global listeners, shell (header / sidebars), router.
import {
  configured, auth, db, onAuthStateChanged, signOut, doc, getDoc, collection, query, where,
  orderBy, limit, onSnapshot, getDocs, updateDoc, serverTimestamp
} from './firebase.js';
import { state, runCleanups, subscribe, emit } from './state.js';
import {
  $, $$, esc, avatarHtml, debounce, errorBox, closeModal, getUser, tsMs, toast,
  isIndexError, indexLinkFrom, showIndexNotice, botBadge, isSuspended, fmtDate
} from './utils.js';
import { icon } from './icons.js';
import { toggleTheme, effectiveTheme } from './theme.js';
import { renderAuth, renderSetupNeeded, ensureProfile } from './auth.js';
import * as feed from './feed.js';
import * as profile from './profile.js';
import * as friends from './friends.js';
import * as messages from './messages.js';
import * as reels from './reels.js';
import * as groups from './groups.js';
import * as notifications from './notifications.js';
import * as settings from './settings.js';
import * as admin from './admin/index.js';

const root = document.getElementById('app');
let unsubShell = null;

// ---------------------------------------------------------------- session
function stopSession() {
  runCleanups();
  for (const u of state.globalUnsubs.splice(0)) { try { u(); } catch { /* ignore */ } }
  if (unsubShell) { unsubShell(); unsubShell = null; }
  Object.assign(state, {
    user: null, profile: null, isAdmin: false, adminRole: null, site: {}, announcements: [], friends: new Set(), following: new Set(),
    saved: new Set(), incomingRequests: [], unreadNotifs: 0, unreadChats: 0, chats: []
  });
}

function listen(q, onNext, label) {
  const unsub = onSnapshot(q, onNext, (err) => {
    console.warn(`[listener:${label}]`, err);
    if (isIndexError(err)) showIndexNotice(indexLinkFrom(err));
    else if (err && err.code === 'permission-denied') toast(`Permission denied (${label}). Publish the latest firestore.rules.`, 'error', 7000);
  });
  state.globalUnsubs.push(unsub);
}

async function startSession(user, profileData) {
  state.user = user;
  state.profile = profileData;
  state.chats = [];
  const uid = user.uid;

  try {
    const a = await getDoc(doc(db, 'admins', uid));
    // Fail closed (same as firestore.rules): only a known role gives staff access. A doc without a valid
    // role (for example the old `enabled: true` setup) is NOT an admin until `role` is set by hand.
    const role = a.exists() ? a.data().role : null;
    state.adminRole = ['super_admin', 'admin', 'moderator'].includes(role) ? role : null;
    state.isAdmin = state.adminRole !== null;
    if (a.exists() && !state.isAdmin) console.warn('admins/' + uid + ' has no valid "role" (super_admin | admin | moderator): no staff access.');
  } catch { state.adminRole = null; state.isAdmin = false; }

  // "last active" for the admin dashboard, written at most once an hour
  const last = profileData.lastActiveAt ? tsMs(profileData.lastActiveAt) : 0;
  if (Date.now() - last > 3600 * 1000) updateDoc(doc(db, 'users', uid), { lastActiveAt: serverTimestamp() }).catch(() => {});

  listen(doc(db, 'users', uid), (s) => {
    if (!s.exists()) return;
    state.profile = s.data();
    if (state.profile.banned || isSuspended(state.profile)) { signOut(auth); return; }
    emit();
  }, 'profile');

  // site-wide switches (maintenance mode) and announcements, both set from the Admin panel
  listen(doc(db, 'settings', 'global'), (s) => { state.site = s.exists() ? s.data() : {}; applySite(); emit(); }, 'site');
  listen(query(collection(db, 'announcements'), where('active', '==', true), limit(5)), (snap) => {
    state.announcements = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .filter((a) => !a.expiresAt || tsMs(a.expiresAt) > Date.now())
      .sort((x, y) => tsMs(y.createdAt) - tsMs(x.createdAt));
    emit();
  }, 'announcements');

  listen(query(collection(db, 'friendships'), where('members', 'array-contains', uid)), (snap) => {
    state.friends = new Set(snap.docs.map((d) => d.data().members.find((m) => m !== uid)));
    emit();
  }, 'friends');

  listen(query(collection(db, 'friendRequests'), where('to', '==', uid)), (snap) => {
    state.incomingRequests = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    emit();
  }, 'requests');

  listen(query(collection(db, 'follows'), where('follower', '==', uid)), (snap) => {
    state.following = new Set(snap.docs.map((d) => d.data().followed));
    emit();
  }, 'follows');

  listen(collection(db, 'users', uid, 'saved'), (snap) => {
    state.saved = new Set(snap.docs.map((d) => d.id));
    emit();
  }, 'saved');

  listen(query(collection(db, 'notifications'), where('to', '==', uid), where('read', '==', false), limit(50)), (snap) => {
    state.unreadNotifs = snap.size;
    emit();
  }, 'notifications');

  listen(query(collection(db, 'chats'), where('members', 'array-contains', uid), orderBy('lastAt', 'desc'), limit(30)), (snap) => {
    state.chats = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    state.unreadChats = state.chats.filter((c) => {
      if (!c.lastAt || !c.lastMessage || c.lastMessage.uid === uid) return false;
      const lr = c.lastRead && c.lastRead[uid];
      return !lr || tsMs(c.lastAt) > tsMs(lr);
    }).length;
    emit();
  }, 'chats');
}

// ---------------------------------------------------------------- maintenance mode + announcements
// NOTE: maintenance mode is enforced by this app's interface only. Firestore rules cannot switch the whole
// database off for non-staff without an extra read on every request, so a technical user could bypass it.
let maintenanceOn = false;
function applySite() {
  if (!state.user) return;
  const blocked = state.site.maintenance === true && !state.isAdmin;
  if (blocked && !maintenanceOn) {
    maintenanceOn = true;
    root.innerHTML = `<div class="auth-page maintenance"><div class="card auth-card"><h2>We'll be right back</h2>
      <p>${esc(state.site.maintenanceMessage || 'MeetBook is down for maintenance. Please try again soon.')}</p>
      <button class="btn btn-block" id="mt-out">Sign out</button></div></div>`;
    $('#mt-out').addEventListener('click', () => signOut(auth));
  } else if (!blocked && maintenanceOn) {
    location.reload();
  }
}

const dismissedKey = 'meetbook-dismissed-announcements';
const getDismissed = () => { try { return JSON.parse(sessionStorage.getItem(dismissedKey) || '[]'); } catch { return []; } };
function drawAnnouncements() {
  const bar = $('#announce-bar');
  if (!bar) return;
  const hidden = getDismissed();
  bar.innerHTML = state.announcements.filter((a) => !hidden.includes(a.id)).map((a) =>
    `<div class="announce announce-${a.level === 'warning' ? 'warning' : 'info'}" role="status"><span>${esc(a.text)}</span>
      <button class="icon-btn" data-dismiss-ann="${esc(a.id)}" aria-label="Dismiss announcement">${icon('x', 16)}</button></div>`).join('');
}

// ---------------------------------------------------------------- shell
const NAV = [
  ['feed', 'home', 'Home'],
  ['friends', 'users', 'Friends'],
  ['reels', 'play', 'Reels'],
  ['groups', 'grid', 'Groups'],
  ['messages', 'message', 'Messages'],
  ['notifications', 'bell', 'Notifications']
];

function renderShell() {
  root.innerHTML = `
  <header class="topbar">
    <a class="logo" href="#/feed" aria-label="MeetBook home">MeetBook</a>
    <div class="search">
      <span class="search-icon">${icon('search', 18)}</span>
      <input id="search-input" type="search" placeholder="Search people and groups" autocomplete="off" aria-label="Search">
      <div id="search-results" class="search-results" hidden></div>
    </div>
    <nav class="topnav" aria-label="Main">
      ${NAV.map(([k, ic, label]) => `<a class="navlink" data-nav="${k}" href="#/${k}" title="${label}" aria-label="${label}">
        ${icon(ic, 24)}<span class="badge" data-badge="${k}" hidden></span></a>`).join('')}
    </nav>
    <div class="top-actions">
      <button class="icon-btn" id="theme-btn" aria-label="Toggle dark mode"></button>
      <button class="avatar-btn" id="me-btn" aria-label="Account menu" aria-haspopup="true"></button>
      <div class="menu" id="me-menu" hidden></div>
    </div>
  </header>
  <div id="announce-bar"></div>
  <div class="layout">
    <aside class="left" id="left"></aside>
    <main id="main" class="main"></main>
    <aside class="right" id="right"></aside>
  </div>`;

  $('#theme-btn').addEventListener('click', () => { toggleTheme(); refreshChrome(); });
  $('#me-btn').addEventListener('click', (e) => { e.stopPropagation(); $('#me-menu').hidden = !$('#me-menu').hidden; });
  document.addEventListener('click', onDocClick);
  $('#me-menu').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'logout') { await signOut(auth); }
    $('#me-menu').hidden = true;
  });

  $('#announce-bar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-dismiss-ann]');
    if (!b) return;
    try { sessionStorage.setItem(dismissedKey, JSON.stringify([...getDismissed(), b.dataset.dismissAnn])); } catch { /* ignore */ }
    drawAnnouncements();
  });

  const input = $('#search-input');
  input.addEventListener('input', debounce(runSearch, 300));
  input.addEventListener('focus', () => { if (input.value.trim()) runSearch(); });

  if (unsubShell) unsubShell();
  unsubShell = subscribe(refreshChrome);
  refreshChrome();
}

function onDocClick(e) {
  const menu = $('#me-menu');
  if (menu && !menu.hidden && !e.target.closest('#me-menu')) menu.hidden = true;
  const sr = $('#search-results');
  if (sr && !sr.hidden && !e.target.closest('.search')) sr.hidden = true;
}

function refreshChrome() {
  if (!state.user || !$('#main')) return;
  const p = state.profile || {};
  const uid = state.user.uid;

  $('#me-btn').innerHTML = avatarHtml(p.name, p.photo, 36);
  $('#theme-btn').innerHTML = icon(effectiveTheme() === 'dark' ? 'sun' : 'moon', 20);

  $('#me-menu').innerHTML = `
    <a class="menu-item" href="#/profile/${uid}">${avatarHtml(p.name, p.photo, 32)}<span><b>${esc(p.name)}</b><small>View profile</small></span></a>
    <a class="menu-item" href="#/saved">${icon('bookmark')}<span>Saved posts</span></a>
    <a class="menu-item" href="#/settings">${icon('settings')}<span>Settings &amp; privacy</span></a>
    ${state.isAdmin ? `<a class="menu-item" href="#/admin">${icon('shield')}<span>Admin dashboard</span></a>` : ''}
    <button class="menu-item" data-act="logout">${icon('logout')}<span>Log out</span></button>`;

  const counts = { friends: state.incomingRequests.length, messages: state.unreadChats, notifications: state.unreadNotifs };
  $$('[data-badge]').forEach((b) => {
    const n = counts[b.dataset.badge] || 0;
    b.hidden = n === 0;
    b.textContent = n > 99 ? '99+' : String(n);
  });

  $('#left').innerHTML = `
    <a class="side-item" href="#/profile/${uid}">${avatarHtml(p.name, p.photo, 36)}<b>${esc(p.name)}</b></a>
    <a class="side-item" href="#/friends">${icon('users', 22)}<span>Friends</span></a>
    <a class="side-item" href="#/groups">${icon('grid', 22)}<span>Groups</span></a>
    <a class="side-item" href="#/reels">${icon('play', 22)}<span>Reels</span></a>
    <a class="side-item" href="#/messages">${icon('message', 22)}<span>Messages</span></a>
    <a class="side-item" href="#/saved">${icon('bookmark', 22)}<span>Saved</span></a>
    <a class="side-item" href="#/settings">${icon('settings', 22)}<span>Settings</span></a>
    ${state.isAdmin ? `<a class="side-item" href="#/admin">${icon('shield', 22)}<span>Admin</span></a>` : ''}`;

  drawAnnouncements();
  renderRight();
}

let rightToken = 0;
async function renderRight() {
  const token = ++rightToken;
  const right = $('#right');
  if (!right) return;
  const reqs = state.incomingRequests.slice(0, 5);
  const fr = [...state.friends].slice(0, 12);
  const users = await Promise.all([...reqs.map((r) => getUser(r.from)), ...fr.map(getUser)]);
  if (token !== rightToken) return;
  const reqUsers = users.slice(0, reqs.length);
  const frUsers = users.slice(reqs.length);
  right.innerHTML = `
    ${reqUsers.length ? `<h4>Friend requests</h4>${reqUsers.map((u) => `<a class="side-item" href="#/profile/${esc(u.uid)}">${avatarHtml(u.name, u.photo, 36)}<span>${esc(u.name)}</span></a>`).join('')}` : ''}
    <h4>Contacts</h4>
    ${frUsers.length ? frUsers.map((u) => `<a class="side-item" href="#/messages/with/${esc(u.uid)}" title="Message ${esc(u.name)}">${avatarHtml(u.name, u.photo, 32)}<span>${esc(u.name)}</span></a>`).join('')
      : '<p class="muted small">Add friends to see them here.</p>'}`;
}

async function runSearch() {
  const input = $('#search-input');
  const box = $('#search-results');
  if (!input || !box) return;
  const q = input.value.trim().toLowerCase();
  if (q.length < 2) { box.hidden = true; return; }
  try {
    const range = (col) => query(collection(db, col), where('nameLower', '>=', q), where('nameLower', '<=', q + ''), limit(6));
    const [u, bots, g] = await Promise.all([
      getDocs(range('publicDirectory')),
      getDocs(query(collection(db, 'publicProfiles'), where('isBot', '==', true), limit(6))),
      getDocs(range('groups'))
    ]);
    const people = new Map(u.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
    bots.docs.forEach((d) => people.set(d.id, { id: d.id, ...d.data() }));
    const rows = [
      ...[...people.values()].slice(0, 6).map((p) => `<a class="search-row" href="#/profile/${p.id}">${avatarHtml(p.name, p.photo, 32)}<span>${esc(p.name)}${botBadge(p)}</span></a>`),
      ...g.docs.map((d) => `<a class="search-row" href="#/group/${d.id}"><span class="avatar avatar-initial" style="width:32px;height:32px;background:var(--primary)">${icon('grid', 16)}</span><span>${esc(d.data().name)} <small class="muted">Group</small></span></a>`)
    ];
    box.innerHTML = rows.length ? rows.join('') : '<div class="search-row muted">No results</div>';
    box.hidden = false;
    box.onclick = () => { box.hidden = true; input.value = ''; };
  } catch (e) {
    box.innerHTML = `<div class="search-row muted">Search failed</div>`;
    box.hidden = false;
  }
}

// ---------------------------------------------------------------- router
function setActiveNav(name) {
  $$('.navlink').forEach((a) => a.classList.toggle('active', a.dataset.nav === name));
}

async function route() {
  if (!state.user) return;
  runCleanups();
  closeModal();
  const main = $('#main');
  if (!main) return;
  const hash = location.hash.replace(/^#/, '') || '/feed';
  const [name, a, b] = hash.split('/').filter(Boolean);
  const view = document.createElement('div');
  view.className = 'view';
  view.innerHTML = '<div class="loading">Loading…</div>';
  main.replaceChildren(view);
  window.scrollTo(0, 0);
  setActiveNav(name === 'saved' ? 'feed' : name === 'group' ? 'groups' : name);
  main.dataset.route = name || 'feed';
  try {
    switch (name) {
      case undefined:
      case 'feed': await feed.renderFeed(view); break;
      case 'post': await feed.renderPostPage(view, a); break;
      case 'saved': await feed.renderSaved(view); break;
      case 'profile': await profile.render(view, a || state.user.uid); break;
      case 'friends': await friends.render(view); break;
      case 'messages': await messages.render(view, a, b); break;
      case 'reels': await reels.render(view); break;
      case 'groups': await groups.renderList(view); break;
      case 'group': await groups.renderGroup(view, a); break;
      case 'notifications': await notifications.render(view); break;
      case 'settings': await settings.render(view); break;
      case 'admin': await admin.render(view, a); break;
      default: location.hash = '#/feed';
    }
  } catch (e) {
    console.error(e);
    view.innerHTML = errorBox(e);
  }
}

// ---------------------------------------------------------------- boot
function boot() {
  if (!configured) { renderSetupNeeded(root); return; }

  window.addEventListener('hashchange', route);

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      document.removeEventListener('click', onDocClick);
      maintenanceOn = false;
      stopSession();
      renderAuth(root);
      return;
    }
    root.innerHTML = '<div class="splash">MeetBook</div>';
    try {
      const data = await ensureProfile(user);
      if (data.banned || isSuspended(data)) {
        await signOut(auth);
        renderAuth(root, { bannedMessage: data.banned ? 'This account has been blocked by an administrator.' : `This account is suspended until ${fmtDate(data.suspendedUntil)}.` });
        return;
      }
      await startSession(user, data);
      renderShell();
      applySite();
      if (!maintenanceOn) await route();
    } catch (e) {
      console.error(e);
      root.innerHTML = `<div class="auth-page"><div class="card auth-card">${errorBox(e)}<button class="btn btn-block" id="retry-signout">Sign out</button></div></div>`;
      $('#retry-signout').addEventListener('click', () => signOut(auth));
    }
  });
}

boot();
