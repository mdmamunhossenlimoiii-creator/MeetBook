// Profile page: header, relationship buttons, posts tab, about, edit profile.
import {
  db, doc, getDoc, updateDoc, collection, query, where, orderBy, limit, getCountFromServer, updateProfile
} from './firebase.js';
import { state, subscribe, onCleanup } from './state.js';
import {
  $, $$, esc, avatarHtml, botBadge, getUser, invalidateUser, toast, modal, closeModal, resizeImage, uploadImageToCloudinary, errMsg,
  emptyState, fullDate, confirmBox, errorBox
} from './utils.js';
import { icon } from './icons.js';
import { composerHtml, bindComposer, livePostList, openReport } from './feed.js';
import { sendRequest, cancelRequest, acceptRequest, declineRequest, unfriend, follow, unfollow } from './friends.js';

async function relationship(uid) {
  const me = state.user.uid;
  if (state.friends.has(uid)) return 'friends';
  if (state.incomingRequests.some((r) => r.from === uid)) return 'incoming';
  const sent = await getDoc(doc(db, 'friendRequests', `${me}_${uid}`)).catch(() => null);
  return sent && sent.exists() ? 'outgoing' : 'none';
}

function actionButtons(uid, rel) {
  const followBtn = state.following.has(uid)
    ? `<button class="btn" data-act="unfollow">Following</button>`
    : `<button class="btn" data-act="follow">Follow</button>`;
  const msg = `<a class="btn" href="#/messages/with/${esc(uid)}">${icon('message', 16)}${rel === 'bot' ? 'Chat with AI' : 'Message'}</a>`;
  const reportBtn = `<button class="btn" data-act="report" title="Report this profile">${icon('flag', 16)}Report</button>`;
  if (rel === 'bot') return `${followBtn}${msg}${reportBtn}`; // AI bots cannot be friended; they chat with automatic replies
  let main;
  if (rel === 'friends') main = `<button class="btn" data-act="unfriend">${icon('check', 16)}Friends</button>`;
  else if (rel === 'incoming') main = `<button class="btn btn-primary" data-act="accept">Confirm request</button><button class="btn" data-act="decline">Delete</button>`;
  else if (rel === 'outgoing') main = `<button class="btn" data-act="cancel">Cancel request</button>`;
  else main = `<button class="btn btn-primary" data-act="add">${icon('plus', 16)}Add friend</button>`;
  return `${main}${followBtn}${msg}${reportBtn}`;
}

export async function render(view, uid) {
  const me = state.user.uid;
  const isMe = uid === me;
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) { view.innerHTML = emptyState('Profile not found'); return; }
  const u = { uid, ...snap.data() };
  const rel = isMe ? 'me' : u.isBot ? 'bot' : await relationship(uid);
  const visibleToMe = isMe || (u.settings?.profileVisibility || 'everyone') === 'everyone' || rel === 'friends' || state.isAdmin;

  const [followers, following] = await Promise.all([
    getCountFromServer(query(collection(db, 'follows'), where('followed', '==', uid))).then((s) => s.data().count).catch(() => 0),
    getCountFromServer(query(collection(db, 'follows'), where('follower', '==', uid))).then((s) => s.data().count).catch(() => 0)
  ]);

  view.innerHTML = `
  <section class="card profile-head">
    <div class="cover" ${u.cover ? `style="background-image:url('${esc(u.cover)}')"` : ''}></div>
    <div class="profile-row">
      <div class="profile-avatar">${avatarHtml(u.name, u.photo, 120)}</div>
      <div class="profile-info">
        <h2>${esc(u.name)}${botBadge(u)}</h2>
        ${u.isBot ? '<div class="small muted">This is an automated AI bot account. It can chat using automatic, template-based replies (they may take a while) and cannot be a friend.</div>' : ''}
        <div class="muted">${followers} followers · ${following} following${isMe ? ` · ${state.friends.size} friends` : ''}</div>
        ${u.bio ? `<p class="bio">${esc(u.bio)}</p>` : ''}
      </div>
      <div class="profile-actions row gap wrap" data-actions>
        ${isMe ? `<button class="btn btn-primary" data-act="edit">${icon('settings', 16)}Edit profile</button>` : actionButtons(uid, rel)}
      </div>
    </div>
    <div class="tabs profile-tabs"><button class="tab active" data-tab="posts">Posts</button>${isMe ? '<button class="tab" data-tab="friends">Friends</button>' : ''}<button class="tab" data-tab="about">About</button></div>
  </section>
  <div data-pane></div>`;

  const pane = $('[data-pane]', view);
  let tab = 'posts';
  $$('.profile-tabs .tab', view).forEach((t) => t.addEventListener('click', () => {
    tab = t.dataset.tab;
    $$('.profile-tabs .tab', view).forEach((x) => x.classList.toggle('active', x === t));
    draw();
  }));

  async function draw() {
    if (tab === 'about') {
      pane.innerHTML = `<div class="card pad"><h3>About</h3>
        <p>${u.bio ? esc(u.bio) : '<span class="muted">No bio yet.</span>'}</p>
        <p class="muted small">Joined ${u.createdAt ? esc(fullDate(u.createdAt)) : 'recently'}</p></div>`;
      return;
    }
    if (tab === 'friends') {
      const list = await Promise.all([...state.friends].map(getUser));
      pane.innerHTML = list.length
        ? `<div class="grid-people">${list.map((f) => `<a class="card grid-person" href="#/profile/${esc(f.uid)}">${avatarHtml(f.name, f.photo, 72)}<b>${esc(f.name)}</b></a>`).join('')}</div>`
        : emptyState('No friends yet');
      return;
    }
    if (!visibleToMe) {
      pane.innerHTML = `<div class="card pad center">${icon('lock', 32)}<h3>This profile is private</h3><p class="muted">Only friends of ${esc(u.name)} can see their posts.</p></div>`;
      return;
    }
    pane.innerHTML = `${isMe ? composerHtml() : ''}<div data-list></div>`;
    if (isMe) bindComposer($('[data-composer]', pane));
    livePostList($('[data-list]', pane), (n) => [
      query(collection(db, 'posts'), where('uid', '==', uid), where('visibility', '==', 'public'), orderBy('createdAt', 'desc'), limit(n)),
      query(collection(db, 'posts'), where('uid', '==', uid), where('audience', 'array-contains', me), orderBy('createdAt', 'desc'), limit(n))
    ], { filter: (p) => !p.groupId, empty: isMe ? 'You have not posted yet.' : 'No posts to show.' });
  }

  $('[data-actions]', view).addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    b.disabled = true;
    try {
      switch (b.dataset.act) {
        case 'edit': openEdit(u, () => render(view, uid)); b.disabled = false; return;
        case 'add': await sendRequest(uid); toast('Friend request sent', 'success'); break;
        case 'cancel': await cancelRequest(uid); break;
        case 'accept': await acceptRequest(uid); toast('You are now friends', 'success'); break;
        case 'decline': await declineRequest(uid); break;
        case 'unfriend':
          if (!(await confirmBox(`Remove ${u.name} from your friends?`, 'Unfriend'))) { b.disabled = false; return; }
          await unfriend(uid); break;
        case 'report': openReport('user', { id: uid, uid }); b.disabled = false; return;
        case 'follow': await follow(uid); break;
        case 'unfollow': await unfollow(uid); break;
        default: break;
      }
      // refresh the buttons only
      const r = u.isBot ? 'bot' : await relationship(uid);
      $('[data-actions]', view).innerHTML = actionButtons(uid, r);
    } catch (err) { toast(errMsg(err), 'error'); b.disabled = false; }
  });

  // Keep the relationship buttons correct when friend state changes elsewhere.
  if (!isMe && !u.isBot) {
    const unsub = subscribe(async () => {
      if (!document.body.contains(view)) return;
      const r = await relationship(uid);
      const holder = $('[data-actions]', view);
      if (holder) holder.innerHTML = actionButtons(uid, r);
    });
    onCleanup(unsub);
  }

  await draw();
}

function openEdit(u, done) {
  let photo = u.photo || '';
  let cover = u.cover || '';
  const m = modal(`<h3>Edit profile</h3>
    <div class="field"><label for="ep-name">Name</label><input id="ep-name" maxlength="60" value="${esc(u.name)}"></div>
    <div class="field"><label for="ep-bio">Bio</label><textarea id="ep-bio" rows="3" maxlength="500">${esc(u.bio || '')}</textarea></div>
    <div class="field"><label>Profile photo</label>
      <div class="row gap"><span id="ep-photo-prev">${avatarHtml(u.name, photo, 56)}</span>
      <label class="btn">Change<input type="file" id="ep-photo" accept="image/*" hidden></label>
      <button class="btn" type="button" id="ep-photo-rm">Remove</button></div></div>
    <div class="field"><label>Cover photo</label>
      <div class="cover small" id="ep-cover-prev" ${cover ? `style="background-image:url('${esc(cover)}')"` : ''}></div>
      <div class="row gap"><label class="btn">Change<input type="file" id="ep-cover" accept="image/*" hidden></label>
      <button class="btn" type="button" id="ep-cover-rm">Remove</button></div></div>
    <div class="row end gap"><button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="ep-save">Save</button></div>`);

  const pick = (id, max, quality, apply) => $(id, m).addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try { apply(await resizeImage(f, max, quality)); } catch (err) { toast(err.message, 'error'); }
  });
  pick('#ep-photo', 256, 0.8, (d) => { photo = d; $('#ep-photo-prev', m).innerHTML = avatarHtml(u.name, photo, 56); });
  pick('#ep-cover', 1000, 0.7, (d) => { cover = d; $('#ep-cover-prev', m).style.backgroundImage = `url('${d}')`; });
  $('#ep-photo-rm', m).addEventListener('click', () => { photo = ''; $('#ep-photo-prev', m).innerHTML = avatarHtml(u.name, '', 56); });
  $('#ep-cover-rm', m).addEventListener('click', () => { cover = ''; $('#ep-cover-prev', m).style.backgroundImage = ''; });

  $('#ep-save', m).addEventListener('click', async () => {
    const name = $('#ep-name', m).value.trim();
    const bio = $('#ep-bio', m).value.trim();
    if (name.length < 2) return toast('Name must be at least 2 characters.', 'error');
    const btn = $('#ep-save', m);
    btn.disabled = true;
    try {
      const photoUrl = photo.startsWith('data:') ? await uploadImageToCloudinary(photo) : photo;
      const coverUrl = cover.startsWith('data:') ? await uploadImageToCloudinary(cover) : cover;
      await updateDoc(doc(db, 'users', state.user.uid), { name, nameLower: name.toLowerCase(), bio, photo: photoUrl, cover: coverUrl });
      try { await updateProfile(state.user, { displayName: name }); } catch { /* not critical */ }
      invalidateUser(state.user.uid);
      closeModal();
      toast('Profile updated', 'success');
      done();
    } catch (e) { toast(errMsg(e), 'error'); btn.disabled = false; }
  });
}

export { errorBox };
