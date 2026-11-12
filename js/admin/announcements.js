// Site announcements (banner shown to everyone) and notices sent to one user (appears in their notifications).
import { db, collection, doc, getDocs, addDoc, updateDoc, deleteDoc, query, orderBy, limit, Timestamp, serverTimestamp } from '../firebase.js';
import { state } from '../state.js';
import { $, esc, errorBox, emptyState, confirmBox, toast, errMsg } from '../utils.js';
import { act, loading, tagHtml, when } from './common.js';

export async function render(body) {
  body.innerHTML = `<h2 class="page-title">Announcements &amp; notices</h2>
    <section class="card pad"><h3>New site announcement</h3>
      <p class="muted small">Shown as a banner to every signed-in user while it is active. Users can dismiss it for the session.</p>
      <div class="field"><textarea id="an-text" rows="2" maxlength="500" placeholder="Announcement text" aria-label="Announcement text"></textarea></div>
      <div class="row gap wrap"><select id="an-level" aria-label="Style"><option value="info">Information</option><option value="warning">Warning</option></select>
        <label class="small">Expires after <select id="an-exp"><option value="0">Never</option><option value="1">1 day</option><option value="7">7 days</option><option value="30">30 days</option></select></label>
        <button class="btn btn-primary" id="an-add">Publish</button></div></section>
    <section class="card pad"><h3>Send a notice to one user</h3>
      <p class="muted small">Appears in that user's Notifications. Broadcasting to everyone would cost one write per user, so use an announcement for that.</p>
      <div class="row gap wrap"><input class="grow" id="nt-uid" placeholder="User UID" aria-label="User UID"><input class="grow" id="nt-text" maxlength="200" placeholder="Message" aria-label="Notice text">
        <button class="btn" id="nt-send">Send</button></div></section>
    <div data-list>${loading()}</div>`;
  const list = $('[data-list]', body);

  async function draw() {
    try {
      const snap = await getDocs(query(collection(db, 'announcements'), orderBy('createdAt', 'desc'), limit(30)));
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.innerHTML = rows.length ? rows.map((a) => `<div class="card pad" data-id="${esc(a.id)}"><div class="row between wrap gap"><div class="grow">
        ${tagHtml(a.active ? 'Active' : 'Off', a.active ? '' : 'danger')} ${tagHtml(a.level || 'info')} <span class="muted small">${when(a.createdAt)}${a.expiresAt ? ` · expires ${when(a.expiresAt)}` : ''}</span>
        <div>${esc(a.text)}</div></div>
        <div class="row gap"><button class="btn" data-toggle>${a.active ? 'Turn off' : 'Turn on'}</button><button class="btn btn-danger" data-del>Delete</button></div></div></div>`).join('') : emptyState('No announcements yet');
      list._rows = rows;
    } catch (e) { list.innerHTML = errorBox(e); }
  }

  $('#an-add', body).addEventListener('click', async (e) => {
    const text = $('#an-text', body).value.trim();
    if (!text) { toast('Write the announcement first', 'error'); return; }
    const days = Number($('#an-exp', body).value);
    if (await act(e.target, () => addDoc(collection(db, 'announcements'), {
      text, level: $('#an-level', body).value, active: true, createdBy: state.user.uid, createdAt: serverTimestamp(),
      expiresAt: days ? Timestamp.fromMillis(Date.now() + days * 86400000) : null
    }), { ok: 'Announcement published', log: ['announcement published', '', text.slice(0, 120)] })) { $('#an-text', body).value = ''; e.target.disabled = false; draw(); }
  });
  $('#nt-send', body).addEventListener('click', async (e) => {
    const uid = $('#nt-uid', body).value.trim(), text = $('#nt-text', body).value.trim();
    if (!uid || !text) { toast('Enter a UID and a message', 'error'); return; }
    if (await act(e.target, () => addDoc(collection(db, 'notifications'), {
      to: uid, type: 'notice', from: state.user.uid, fromName: state.profile.name, postId: null, extra: text, read: false, createdAt: serverTimestamp()
    }), { ok: 'Notice sent', log: ['notice sent', uid, text.slice(0, 120)] })) { $('#nt-text', body).value = ''; e.target.disabled = false; }
  });
  list.addEventListener('click', async (e) => {
    const card = e.target.closest('[data-id]');
    if (!card) return;
    const a = list._rows.find((x) => x.id === card.dataset.id);
    if (e.target.closest('[data-toggle]')) { if (await act(e.target, () => updateDoc(doc(db, 'announcements', a.id), { active: !a.active }), { ok: 'Updated', log: [a.active ? 'announcement off' : 'announcement on', a.id, a.text.slice(0, 80)] })) draw(); }
    if (e.target.closest('[data-del]')) {
      if (!(await confirmBox('Delete this announcement?', 'Delete'))) return;
      if (await act(e.target, () => deleteDoc(doc(db, 'announcements', a.id)), { ok: 'Deleted', log: ['announcement deleted', a.id, a.text.slice(0, 80)] })) draw();
    }
  });
  await draw();
}
