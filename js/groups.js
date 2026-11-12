// Groups: discover, create, join (public) / request (private), group feed, owner tools.
import {
  db, collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, where, orderBy, limit,
  serverTimestamp, arrayUnion, arrayRemove
} from './firebase.js';
import { state, navigate } from './state.js';
import {
  $, $$, esc, avatarHtml, getUser, toast, modal, closeModal, errMsg, emptyState, errorBox, confirmBox, notify
} from './utils.js';
import { icon } from './icons.js';
import { composerHtml, bindComposer, livePostList, openReport } from './feed.js';

function groupCard(g) {
  const mine = g.members.includes(state.user.uid);
  return `<a class="card group-card" href="#/group/${esc(g.id)}">
    <span class="avatar avatar-initial" style="width:56px;height:56px;background:var(--primary)">${icon('grid', 26)}</span>
    <div class="grow"><b>${esc(g.name)}</b>
      <div class="muted small">${g.privacy === 'private' ? 'Private' : 'Public'} · ${g.members.length} member${g.members.length === 1 ? '' : 's'}${mine ? ' · Joined' : ''}</div>
      ${g.description ? `<div class="muted small clamp">${esc(g.description)}</div>` : ''}</div></a>`;
}

export async function renderList(view) {
  view.innerHTML = `<div class="row between"><h2 class="page-title">Groups</h2>
    <button class="btn btn-primary" data-new>${icon('plus', 16)}Create group</button></div>
    <h3>Your groups</h3><div data-mine><div class="loading">Loading…</div></div>
    <h3>Discover</h3><div data-all><div class="loading">Loading…</div></div>`;
  $('[data-new]', view).addEventListener('click', openCreator);
  try {
    const [mine, all] = await Promise.all([
      getDocs(query(collection(db, 'groups'), where('members', 'array-contains', state.user.uid))),
      getDocs(query(collection(db, 'groups'), orderBy('createdAt', 'desc'), limit(30)))
    ]);
    const mineList = mine.docs.map((d) => ({ id: d.id, ...d.data() }));
    const mineIds = new Set(mineList.map((g) => g.id));
    const others = all.docs.map((d) => ({ id: d.id, ...d.data() })).filter((g) => !mineIds.has(g.id));
    $('[data-mine]', view).innerHTML = mineList.length ? mineList.map(groupCard).join('') : emptyState('You have not joined any groups yet');
    $('[data-all]', view).innerHTML = others.length ? others.map(groupCard).join('') : emptyState('No other groups to discover');
  } catch (e) {
    $('[data-mine]', view).innerHTML = errorBox(e);
    $('[data-all]', view).innerHTML = '';
  }
}

function openCreator() {
  const m = modal(`<h3>Create group</h3>
    <div class="field"><label for="g-name">Group name</label><input id="g-name" maxlength="80"></div>
    <div class="field"><label for="g-desc">Description</label><textarea id="g-desc" rows="3" maxlength="500"></textarea></div>
    <div class="field"><label for="g-priv">Privacy</label>
      <select id="g-priv"><option value="public">Public — anyone can join and see posts</option>
      <option value="private">Private — members approve requests, only members see posts</option></select></div>
    <div class="row end gap"><button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="g-go">Create</button></div>`);
  $('#g-go', m).addEventListener('click', async () => {
    const name = $('#g-name', m).value.trim();
    if (name.length < 2) return toast('Group name must be at least 2 characters.', 'error');
    const btn = $('#g-go', m);
    btn.disabled = true;
    try {
      const ref = await addDoc(collection(db, 'groups'), {
        name, nameLower: name.toLowerCase(), description: $('#g-desc', m).value.trim(),
        privacy: $('#g-priv', m).value, ownerUid: state.user.uid, members: [state.user.uid], createdAt: serverTimestamp()
      });
      closeModal();
      navigate(`/group/${ref.id}`);
    } catch (e) { toast(errMsg(e), 'error'); btn.disabled = false; }
  });
}

export async function renderGroup(view, id) {
  const me = state.user.uid;
  const gref = doc(db, 'groups', id);
  const snap = await getDoc(gref);
  if (!snap.exists()) { view.innerHTML = emptyState('Group not found'); return; }
  let g = { id, ...snap.data() };
  const isOwner = g.ownerUid === me;
  const isMember = g.members.includes(me);
  let requested = false;
  if (!isMember && g.privacy === 'private') {
    requested = (await getDoc(doc(db, 'groups', id, 'requests', me)).catch(() => null))?.exists() || false;
  }
  const owner = await getUser(g.ownerUid);

  function headerHtml() {
    let btn = '';
    if (isOwner) btn = `<button class="btn btn-danger" data-act="delete">Delete group</button>`;
    else if (isMember) btn = `<button class="btn" data-act="leave">Leave group</button>`;
    else if (g.privacy === 'public') btn = `<button class="btn btn-primary" data-act="join">Join group</button>`;
    else btn = requested ? `<button class="btn" data-act="cancel-request">Cancel request</button>` : `<button class="btn btn-primary" data-act="request">Request to join</button>`;
    if (!isOwner) btn += `<button class="btn" data-act="report">Report</button>`;
    return `<section class="card pad group-head">
      <a class="back" href="#/groups">${icon('arrowLeft')} Groups</a>
      <div class="row between wrap gap"><div><h2>${esc(g.name)}</h2>
        <div class="muted">${g.privacy === 'private' ? icon('lock', 14) + ' Private' : icon('globe', 14) + ' Public'} group · ${g.members.length} member${g.members.length === 1 ? '' : 's'} · created by <a href="#/profile/${esc(owner.uid)}">${esc(owner.name)}</a></div>
        ${g.description ? `<p>${esc(g.description)}</p>` : ''}</div>
      <div class="row gap">${btn}</div></div></section>`;
  }

  view.innerHTML = `${headerHtml()}<div data-owner-tools></div><div data-body></div>`;

  async function drawOwnerTools() {
    const box = $('[data-owner-tools]', view);
    if (!isOwner) { box.innerHTML = ''; return; }
    const reqSnap = await getDocs(collection(db, 'groups', id, 'requests')).catch(() => null);
    const reqs = reqSnap ? reqSnap.docs.map((d) => d.id) : [];
    const users = await Promise.all([...reqs, ...g.members.filter((m) => m !== me)].map(getUser));
    const reqUsers = users.slice(0, reqs.length);
    const memUsers = users.slice(reqs.length);
    box.innerHTML = `<section class="card pad"><h3>Manage group</h3>
      ${reqUsers.length ? `<h4>Join requests</h4>${reqUsers.map((u) => `<div class="person" data-uid="${esc(u.uid)}">${avatarHtml(u.name, u.photo, 40)}<span class="grow">${esc(u.name)}</span>
        <button class="btn btn-primary" data-act="approve">Approve</button><button class="btn" data-act="deny">Deny</button></div>`).join('')}` : ''}
      <h4>Members</h4>
      ${memUsers.length ? memUsers.map((u) => `<div class="person" data-uid="${esc(u.uid)}">${avatarHtml(u.name, u.photo, 40)}<span class="grow">${esc(u.name)}</span>
        <button class="btn" data-act="remove">Remove</button></div>`).join('') : '<p class="muted small">You are the only member so far.</p>'}</section>`;
  }

  async function drawBody() {
    const body = $('[data-body]', view);
    const canSee = isMember || g.privacy === 'public';
    if (!canSee) {
      body.innerHTML = `<div class="card pad center">${icon('lock', 32)}<h3>This group is private</h3><p class="muted">Join the group to see its posts.</p></div>`;
      return;
    }
    body.innerHTML = `${isMember ? composerHtml({ placeholder: 'Write something to the group…', showVisibility: false }) : ''}<div data-list></div>`;
    if (isMember) bindComposer($('[data-composer]', body), { groupId: id, groupPrivacy: g.privacy });
    const vis = g.privacy === 'private' ? 'group' : 'public';
    livePostList($('[data-list]', body), (n) => [
      query(collection(db, 'posts'), where('groupId', '==', id), where('visibility', '==', vis), orderBy('createdAt', 'desc'), limit(n))
    ], { empty: 'No posts in this group yet.' });
  }

  async function reload() { await renderGroup(view, id); }

  view.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.closest('.post')) return;
    const uid = b.closest('.person')?.dataset.uid;
    b.disabled = true;
    try {
      switch (b.dataset.act) {
        case 'report': openReport('group', { id, uid: g.ownerUid }); b.disabled = false; return;
        case 'join': await updateDoc(gref, { members: arrayUnion(me) }); toast('You joined the group', 'success'); await reload(); return;
        case 'leave':
          if (!(await confirmBox('Leave this group?', 'Leave'))) { b.disabled = false; return; }
          await updateDoc(gref, { members: arrayRemove(me) }); await reload(); return;
        case 'request': await setDoc(doc(db, 'groups', id, 'requests', me), { createdAt: serverTimestamp() }); toast('Request sent', 'success'); await reload(); return;
        case 'cancel-request': await deleteDoc(doc(db, 'groups', id, 'requests', me)); await reload(); return;
        case 'delete':
          if (!(await confirmBox('Delete this group? Posts stay hidden but are not removed.', 'Delete group'))) { b.disabled = false; return; }
          await deleteDoc(gref); navigate('/groups'); return;
        case 'approve':
          await updateDoc(gref, { members: arrayUnion(uid) });
          await deleteDoc(doc(db, 'groups', id, 'requests', uid));
          notify(uid, 'group_approved', { extra: id });
          g.members = [...g.members, uid]; await drawOwnerTools(); return;
        case 'deny': await deleteDoc(doc(db, 'groups', id, 'requests', uid)); await drawOwnerTools(); return;
        case 'remove':
          if (!(await confirmBox('Remove this member?', 'Remove'))) { b.disabled = false; return; }
          await updateDoc(gref, { members: arrayRemove(uid) });
          g.members = g.members.filter((m) => m !== uid); await drawOwnerTools(); return;
        default: b.disabled = false;
      }
    } catch (err) { toast(errMsg(err), 'error'); b.disabled = false; }
  });

  await Promise.all([drawOwnerTools(), drawBody()]);
}

export { $$ };
