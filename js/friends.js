// Friend requests, friendships, follow/unfollow, and the Friends page.
import {
  db, collection, doc, getDoc, getDocs, setDoc, deleteDoc, writeBatch, query, where, orderBy, limit,
  onSnapshot, serverTimestamp
} from './firebase.js';
import { state, onCleanup, subscribe } from './state.js';
import { $, $$, esc, avatarHtml, botBadge, getUser, prefetchUsers, toast, errMsg, notify, emptyState, errorBox, debounce, confirmBox } from './utils.js';
import { pairId } from './utils.js';
import { icon } from './icons.js';

// ------------------------------------------------------------------ actions
export async function sendRequest(to) {
  const me = state.user.uid;
  await setDoc(doc(db, 'friendRequests', `${me}_${to}`), { from: me, to, createdAt: serverTimestamp() });
  notify(to, 'friend_request');
}

export async function cancelRequest(to) {
  await deleteDoc(doc(db, 'friendRequests', `${state.user.uid}_${to}`));
}

export async function acceptRequest(from) {
  const me = state.user.uid;
  const batch = writeBatch(db);
  batch.set(doc(db, 'friendships', pairId(me, from)), { members: [me, from].sort(), createdAt: serverTimestamp() });
  batch.delete(doc(db, 'friendRequests', `${from}_${me}`));
  await batch.commit();
  notify(from, 'friend_accept');
}

export async function declineRequest(from) {
  await deleteDoc(doc(db, 'friendRequests', `${from}_${state.user.uid}`));
}

export async function unfriend(uid) {
  await deleteDoc(doc(db, 'friendships', pairId(state.user.uid, uid)));
}

export async function follow(uid) {
  const me = state.user.uid;
  await setDoc(doc(db, 'follows', `${me}_${uid}`), { follower: me, followed: uid, createdAt: serverTimestamp() });
  notify(uid, 'follow');
}

export async function unfollow(uid) {
  await deleteDoc(doc(db, 'follows', `${state.user.uid}_${uid}`));
}

// ------------------------------------------------------------------ page
function personRow(u, buttons) {
  return `<div class="person" data-uid="${esc(u.uid)}">
    <a href="#/profile/${esc(u.uid)}">${avatarHtml(u.name, u.photo, 56)}</a>
    <div class="person-info"><a class="author" href="#/profile/${esc(u.uid)}">${esc(u.name)}</a>${botBadge(u)}
      ${u.bio ? `<div class="muted small clamp">${esc(u.bio)}</div>` : ''}</div>
    <div class="row gap">${buttons}</div>
  </div>`;
}

export async function render(view) {
  const me = state.user.uid;
  view.innerHTML = `
    <h2 class="page-title">Friends</h2>
    <div class="tabs" role="tablist">
      <button class="tab active" data-tab="requests">Requests <span class="count" data-count-req></span></button>
      <button class="tab" data-tab="friends">All friends</button>
      <button class="tab" data-tab="sent">Sent</button>
      <button class="tab" data-tab="find">Find people</button>
    </div>
    <div data-pane></div>`;
  const pane = $('[data-pane]', view);
  let tab = 'requests';

  const tabs = $$('.tab', view);
  tabs.forEach((t) => t.addEventListener('click', () => {
    tab = t.dataset.tab;
    tabs.forEach((x) => x.classList.toggle('active', x === t));
    draw();
  }));

  async function draw() {
    const mine = tab;
    pane.innerHTML = '<div class="loading">Loading…</div>';
    try {
      if (mine === 'requests') {
        const reqs = state.incomingRequests;
        const users = await Promise.all(reqs.map((r) => getUser(r.from)));
        if (tab !== mine) return;
        pane.innerHTML = users.length
          ? users.map((u) => personRow(u, `<button class="btn btn-primary" data-act="accept">Confirm</button><button class="btn" data-act="decline">Delete</button>`)).join('')
          : emptyState('No pending requests');
      } else if (mine === 'friends') {
        const users = await Promise.all([...state.friends].map(getUser));
        if (tab !== mine) return;
        users.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        pane.innerHTML = users.length
          ? users.map((u) => personRow(u, `<a class="btn" href="#/messages/with/${esc(u.uid)}">${icon('message', 16)}Message</a><button class="btn" data-act="unfriend">Unfriend</button>`)).join('')
          : emptyState('No friends yet', 'Use "Find people" to send your first request.');
      } else if (mine === 'sent') {
        const snap = await getDocs(query(collection(db, 'friendRequests'), where('from', '==', me)));
        const users = await Promise.all(snap.docs.map((d) => getUser(d.data().to)));
        if (tab !== mine) return;
        pane.innerHTML = users.length
          ? users.map((u) => personRow(u, `<button class="btn" data-act="cancel">Cancel request</button>`)).join('')
          : emptyState('No sent requests');
      } else {
        drawFind();
      }
    } catch (e) { pane.innerHTML = errorBox(e); }
  }

  async function drawFind() {
    pane.innerHTML = `<div class="field"><input type="search" id="find-q" placeholder="Search by name" aria-label="Search people" autocomplete="off"></div><div data-results></div>`;
    const input = $('#find-q', pane);
    const results = $('[data-results]', pane);

    async function run() {
      const q = input.value.trim().toLowerCase();
      results.innerHTML = '<div class="loading">Searching…</div>';
      try {
        const base = collection(db, 'users');
        const snap = q.length >= 2
          ? await getDocs(query(base, where('nameLower', '>=', q), where('nameLower', '<=', q + ''), limit(20)))
          : await getDocs(query(base, orderBy('nameLower'), limit(20)));
        const outgoing = await getDocs(query(collection(db, 'friendRequests'), where('from', '==', me)));
        const sent = new Set(outgoing.docs.map((d) => d.data().to));
        const incoming = new Set(state.incomingRequests.map((r) => r.from));
        const users = snap.docs.filter((d) => d.id !== me).map((d) => ({ uid: d.id, ...d.data() }));
        results.innerHTML = users.length ? users.map((u) => {
          let btn;
          if (u.isBot) btn = `<a class="btn" href="#/profile/${esc(u.uid)}">View profile</a>`;
          else if (state.friends.has(u.uid)) btn = `<span class="muted small">Friends</span>`;
          else if (sent.has(u.uid)) btn = `<button class="btn" data-act="cancel">Cancel request</button>`;
          else if (incoming.has(u.uid)) btn = `<button class="btn btn-primary" data-act="accept">Confirm</button>`;
          else btn = `<button class="btn btn-primary" data-act="add">${icon('plus', 16)}Add friend</button>`;
          return personRow(u, btn);
        }).join('') : emptyState('No people found');
      } catch (e) { results.innerHTML = errorBox(e); }
    }
    input.addEventListener('input', debounce(run, 350));
    run();
  }

  pane.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const row = btn.closest('.person');
    const uid = row.dataset.uid;
    btn.disabled = true;
    try {
      switch (btn.dataset.act) {
        case 'accept': await acceptRequest(uid); toast('You are now friends', 'success'); break;
        case 'decline': await declineRequest(uid); break;
        case 'unfriend':
          if (!(await confirmBox('Remove this friend?', 'Unfriend'))) { btn.disabled = false; return; }
          await unfriend(uid); break;
        case 'cancel': await cancelRequest(uid); break;
        case 'add': await sendRequest(uid); toast('Friend request sent', 'success'); break;
        default: break;
      }
      row.remove();
      if (btn.dataset.act === 'add' || btn.dataset.act === 'cancel') draw();
    } catch (err) { toast(errMsg(err), 'error'); btn.disabled = false; }
  });

  const count = $('[data-count-req]', view);
  const refreshCount = () => { count.textContent = state.incomingRequests.length || ''; };
  refreshCount();
  onCleanup(subscribe(refreshCount));

  draw();
}

export { prefetchUsers, getDoc, onSnapshot };
