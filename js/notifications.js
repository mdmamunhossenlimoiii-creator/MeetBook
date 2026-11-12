// Notifications page (realtime) with mark-as-read.
import {
  db, collection, doc, updateDoc, writeBatch, query, where, orderBy, limit, onSnapshot, getDocs
} from './firebase.js';
import { state, onCleanup, navigate } from './state.js';
import { $, esc, avatarHtml, prefetchUsers, timeAgo, emptyState, errorBox, REACTIONS, toast, errMsg } from './utils.js';

function describe(n) {
  switch (n.type) {
    case 'reaction': return { text: `reacted ${REACTIONS[n.extra]?.emoji || '👍'} to your post`, href: `#/post/${n.postId}` };
    case 'comment': return { text: 'commented on your post', href: `#/post/${n.postId}` };
    case 'share': return { text: 'shared your post', href: `#/post/${n.postId}` };
    case 'friend_request': return { text: 'sent you a friend request', href: '#/friends' };
    case 'friend_accept': return { text: 'accepted your friend request', href: `#/profile/${n.from}` };
    case 'follow': return { text: 'started following you', href: `#/profile/${n.from}` };
    case 'reel_like': return { text: 'liked your reel', href: '#/reels' };
    case 'group_approved': return { text: 'approved your request to join a group', href: `#/group/${n.extra}` };
    case 'notice': return { text: String(n.extra || 'sent you a notice'), href: '#/notifications' };
    default: return { text: 'sent you a notification', href: '#/notifications' };
  }
}

export async function render(view) {
  const me = state.user.uid;
  view.innerHTML = `<div class="row between"><h2 class="page-title">Notifications</h2>
    <button class="btn" data-readall>Mark all as read</button></div><div data-list class="card"><div class="loading">Loading…</div></div>`;
  const list = $('[data-list]', view);
  let items = [];

  const q = query(collection(db, 'notifications'), where('to', '==', me), orderBy('createdAt', 'desc'), limit(40));
  const unsub = onSnapshot(q, async (snap) => {
    items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const users = await prefetchUsers(items.map((n) => n.from));
    list.innerHTML = items.length ? items.map((n) => {
      const d = describe(n);
      const u = users[n.from] || { name: n.fromName };
      return `<a class="notif ${n.read ? '' : 'unread'}" data-id="${esc(n.id)}" href="${esc(d.href)}">
        ${avatarHtml(u.name, u.photo, 48)}
        <div class="grow"><b>${esc(u.name || n.fromName)}</b> ${esc(d.text)}<div class="small muted">${timeAgo(n.createdAt)}</div></div>
        ${n.read ? '' : '<span class="dot"></span>'}</a>`;
    }).join('') : emptyState('No notifications yet');
  }, (err) => { list.innerHTML = errorBox(err); });
  onCleanup(unsub);

  list.addEventListener('click', async (e) => {
    const a = e.target.closest('.notif');
    if (!a) return;
    const n = items.find((x) => x.id === a.dataset.id);
    if (n && !n.read) { try { await updateDoc(doc(db, 'notifications', n.id), { read: true }); } catch { /* ignore */ } }
  });

  $('[data-readall]', view).addEventListener('click', async () => {
    try {
      const snap = await getDocs(query(collection(db, 'notifications'), where('to', '==', me), where('read', '==', false), limit(100)));
      if (snap.empty) return toast('Everything is already read.', 'info');
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.update(d.ref, { read: true }));
      await batch.commit();
    } catch (err) { toast(errMsg(err), 'error'); }
  });
}

export { navigate };
