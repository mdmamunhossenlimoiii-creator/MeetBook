// User management: search (name or UID), details, edit, block / unblock, temporary suspension, verification,
// activity history and a queued permanent deletion (done server-side by the GitHub Action).
import {
  db, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch, query, where, orderBy, limit, startAfter, Timestamp, serverTimestamp, getCountFromServer
} from '../firebase.js';
import { state } from '../state.js';
import { $, esc, avatarHtml, botBadge, emptyState, errorBox, confirmBox, modal, closeModal, debounce, isSuspended, tsMs, timeAgo, toast, errMsg } from '../utils.js';
import { act, hasRole, loading, tagHtml, when, short } from './common.js';

const PAGE = 20;

async function updateUserProfile(uid, patch) {
  const current = await getDoc(doc(db, 'users', uid));
  if (!current.exists()) throw new Error('User profile no longer exists.');
  const next = { ...current.data(), ...patch };
  const publicProfile = {
    name: next.name, nameLower: String(next.name || '').toLowerCase(),
    bio: String(next.bio || '').slice(0, 500), photo: next.photo || '', cover: next.cover || '',
    isBot: next.isBot === true, roleEmoji: next.roleEmoji || '', verified: next.verified === true,
    profileVisibility: next.settings?.profileVisibility === 'friends' ? 'friends' : 'everyone',
    createdAt: next.createdAt || serverTimestamp()
  };
  const batch = writeBatch(db);
  batch.update(doc(db, 'users', uid), patch);
  batch.set(doc(db, 'publicProfiles', uid), publicProfile, { merge: true });
  await batch.commit();
}

export async function render(body) {
  body.innerHTML = `<h2 class="page-title">Users</h2>
    <div class="field"><input type="search" id="ad-q" placeholder="Search by name, or paste a UID" aria-label="Search users"></div>
    <div data-results>${loading()}</div><div class="center"><button class="btn" data-more hidden>Load more</button></div>`;
  const input = $('#ad-q', body), results = $('[data-results]', body), moreBtn = $('[data-more]', body);
  let cursor = null, term = '', token = 0;

  const row = (id, u) => `<div class="person" data-uid="${esc(id)}">${avatarHtml(u.name, u.photo, 44)}
    <div class="grow"><a class="author" href="#/profile/${esc(id)}">${esc(u.name)}</a>${botBadge(u)}
      ${u.banned ? tagHtml('Blocked', 'danger') : ''}${isSuspended(u) ? tagHtml('Suspended', 'danger') : ''}
      <div class="muted small">${esc(id)}${u.lastActiveAt ? ` · active ${timeAgo(u.lastActiveAt)}` : ''}</div></div>
    <button class="btn" data-open>Manage</button></div>`;

  async function load(reset) {
    const my = ++token;
    if (reset) { cursor = null; results.innerHTML = loading(); }
    moreBtn.hidden = true;
    try {
      let docs = [];
      if (reset && term.length >= 20 && /^[\w-]+$/.test(term)) {            // looks like a UID
        const s = await getDoc(doc(db, 'users', term));
        docs = s.exists() ? [s] : [];
      } else if (reset && /^bot_\d\d$/.test(term)) {
        const s = await getDoc(doc(db, 'users', term)); docs = s.exists() ? [s] : [];
      } else {
        const base = collection(db, 'users');
        const q = term.length >= 2
          ? query(base, where('nameLower', '>=', term), where('nameLower', '<=', `${term}`), orderBy('nameLower'), ...(cursor ? [startAfter(cursor)] : []), limit(PAGE))
          : query(base, orderBy('nameLower'), ...(cursor ? [startAfter(cursor)] : []), limit(PAGE));
        const snap = await getDocs(q);
        docs = snap.docs;
        cursor = docs[docs.length - 1] || null;
        moreBtn.hidden = docs.length < PAGE;
      }
      if (my !== token) return;
      const html = docs.map((d) => row(d.id, d.data())).join('');
      if (reset) results.innerHTML = html || emptyState('No users found');
      else results.insertAdjacentHTML('beforeend', html);
    } catch (e) { if (my === token) results.innerHTML = errorBox(e); }
  }

  input.addEventListener('input', debounce(() => { term = input.value.trim().toLowerCase(); if (/^[A-Za-z0-9]{20,}$/.test(input.value.trim())) term = input.value.trim(); load(true); }, 350));
  moreBtn.addEventListener('click', () => load(false));
  results.addEventListener('click', (e) => {
    const b = e.target.closest('[data-open]');
    if (b) openUser(b.closest('.person').dataset.uid, () => load(true));
  });
  await load(true);
}

async function openUser(uid, refresh) {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) { toast('User not found', 'error'); return; }
  const u = snap.data();
  const self = uid === state.user.uid;
  const staffSnap = await getDoc(doc(db, 'admins', uid)).catch(() => null);
  const isStaffUser = !!(staffSnap && staffSnap.exists());
  const delSnap = hasRole('super_admin') ? await getDoc(doc(db, 'deletionRequests', uid)).catch(() => null) : null;
  const canAdmin = hasRole('admin') && !self && !(isStaffUser && !hasRole('super_admin'));
  const canSuspend = !self && !isStaffUser && !u.isBot;

  const m = modal(`<h3>${esc(u.name)}${botBadge(u)}</h3>
    <div class="row gap">${avatarHtml(u.name, u.photo, 64)}<div class="small"><div><code>${esc(uid)}</code></div>
      <div class="muted">Joined ${when(u.createdAt)} · last active ${when(u.lastActiveAt)}</div>
      <div>${u.banned ? tagHtml('Blocked', 'danger') : tagHtml('Active')} ${isSuspended(u) ? tagHtml(`Suspended until ${when(u.suspendedUntil)}`, 'danger') : ''} ${u.verified ? tagHtml('Verified') : ''} ${isStaffUser ? tagHtml('Staff') : ''}</div></div></div>
    ${hasRole('admin') && !u.isBot ? `<div class="field"><label for="u-name">Name</label><input id="u-name" maxlength="60" value="${esc(u.name)}" ${canAdmin ? '' : 'disabled'}></div>
    <div class="field"><label for="u-bio">Bio</label><textarea id="u-bio" rows="2" maxlength="500" ${canAdmin ? '' : 'disabled'}>${esc(u.bio || '')}</textarea></div>
    ${canAdmin ? '<button class="btn btn-primary" data-do="save">Save changes</button>' : ''}` : `<p>${esc(u.bio || '')}</p>`}
    <h4>Actions</h4><div class="row gap wrap">
      ${canAdmin && !u.isBot ? `<button class="btn ${u.banned ? '' : 'btn-danger'}" data-do="${u.banned ? 'unblock' : 'block'}">${u.banned ? 'Unblock' : 'Block account'}</button>` : ''}
      ${canAdmin && !u.isBot ? `<button class="btn" data-do="verify">${u.verified ? 'Remove verified badge' : 'Give verified badge'}</button>` : ''}
      ${canSuspend ? `<select data-dur aria-label="Suspension length"><option value="1">1 day</option><option value="3">3 days</option><option value="7" selected>7 days</option><option value="30">30 days</option></select>
        <button class="btn" data-do="suspend">Suspend</button>${isSuspended(u) ? '<button class="btn" data-do="lift">Lift suspension</button>' : ''}` : ''}
    </div>
    ${hasRole('super_admin') && !self && !isStaffUser && !u.isBot ? `<h4>Permanent deletion</h4>
      <p class="muted small">Queues the account for deletion. A scheduled server job (GitHub Action with a service account) removes the sign-in account and the user's data within about 30 minutes. This cannot be undone.</p>
      ${delSnap && delSnap.exists() ? `<p>${tagHtml(delSnap.data().status || 'pending')} ${esc(delSnap.data().note || '')}</p>
        ${delSnap.data().status === 'pending' ? '<button class="btn" data-do="undelete">Cancel the request</button>' : ''}`
        : '<button class="btn btn-danger" data-do="delete">Queue permanent deletion</button>'}` : ''}
    <h4>Recent activity</h4><div data-activity class="small">${loading()}</div>
    <div class="row end"><button class="btn" data-close>Close</button></div>`, { wide: true });

  // activity history: latest posts + reports against this user + counts
  (async () => {
    const box = $('[data-activity]', m);
    try {
      const [posts, against, made] = await Promise.all([
        getDocs(query(collection(db, 'posts'), where('uid', '==', uid), orderBy('createdAt', 'desc'), limit(5))),
        getCountFromServer(query(collection(db, 'reports'), where('targetUid', '==', uid))).then((s) => s.data().count).catch(() => '—'),
        getCountFromServer(query(collection(db, 'reports'), where('reporterUid', '==', uid))).then((s) => s.data().count).catch(() => '—')
      ]);
      box.innerHTML = `<div class="muted">Reports against: <b>${against}</b> · reports filed: <b>${made}</b></div>`
        + (posts.docs.length ? posts.docs.map((d) => `<div>• <a href="#/post/${esc(d.id)}">${esc(short(d.data().text || (d.data().image ? '[photo]' : '[post]'), 80))}</a> <span class="muted">${timeAgo(d.data().createdAt)}${d.data().hidden ? ' · hidden' : ''}</span></div>`).join('') : '<div class="muted">No posts.</div>');
    } catch (e) { box.innerHTML = `<span class="muted">${esc(errMsg(e))}</span>`; }
  })();

  m.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-do]');
    if (!b) return;
    const ref = doc(db, 'users', uid);
    const done = () => { closeModal(); refresh(); };
    switch (b.dataset.do) {
      case 'save': {
        const name = $('#u-name', m).value.trim();
        if (name.length < 2) { toast('Name needs at least 2 characters', 'error'); return; }
        if (await act(b, () => updateUserProfile(uid, { name, nameLower: name.toLowerCase(), bio: $('#u-bio', m).value.trim().slice(0, 500) }), { ok: 'User updated', log: ['user edited', uid, `name: ${name}`] })) done();
        break;
      }
      case 'block':
        if (!(await confirmBox(`Block ${u.name}? They are signed out and cannot sign in until unblocked.`, 'Block'))) return;
        if (await act(b, () => updateDoc(ref, { banned: true }), { ok: 'User blocked', log: ['user blocked', uid, u.name] })) done();
        break;
      case 'unblock': if (await act(b, () => updateDoc(ref, { banned: false }), { ok: 'User unblocked', log: ['user unblocked', uid, u.name] })) done(); break;
      case 'verify': if (await act(b, () => updateUserProfile(uid, { verified: !u.verified }), { ok: u.verified ? 'Badge removed' : 'Badge given', log: [u.verified ? 'verification removed' : 'user verified', uid, u.name] })) done(); break;
      case 'suspend': {
        const days = Number($('[data-dur]', m).value);
        if (!(await confirmBox(`Suspend ${u.name} for ${days} day(s)?`, 'Suspend'))) return;
        if (await act(b, () => updateDoc(ref, { suspendedUntil: Timestamp.fromMillis(Date.now() + days * 86400000) }), { ok: 'User suspended', log: ['user suspended', uid, `${days} day(s)`] })) done();
        break;
      }
      case 'lift': if (await act(b, () => updateDoc(ref, { suspendedUntil: null }), { ok: 'Suspension lifted', log: ['suspension lifted', uid, u.name] })) done(); break;
      case 'delete':
        if (!(await confirmBox(`Permanently delete ${u.name} and their data? This cannot be undone once the server job runs.`, 'Queue deletion'))) return;
        if (await act(b, () => setDoc(doc(db, 'deletionRequests', uid), { status: 'pending', requestedBy: state.user.uid, name: u.name, createdAt: serverTimestamp() }), { ok: 'Deletion queued', log: ['deletion queued', uid, u.name] })) done();
        break;
      case 'undelete': if (await act(b, () => deleteDoc(doc(db, 'deletionRequests', uid)), { ok: 'Request cancelled', log: ['deletion cancelled', uid, u.name] })) done(); break;
      default: break;
    }
  });
}
