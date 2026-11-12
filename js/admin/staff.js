// Staff & roles (Super Admin only). Rules also forbid everyone else from writing /admins, and nobody can edit their own entry.
import { db, collection, doc, getDoc, getDocs, setDoc, deleteDoc, serverTimestamp } from '../firebase.js';
import { state } from '../state.js';
import { $, esc, getUser, avatarHtml, confirmBox, errorBox, emptyState } from '../utils.js';
import { act, loading, ROLE_LABEL, when } from './common.js';

export async function render(body) {
  body.innerHTML = `<h2 class="page-title">Staff &amp; roles</h2>
    <section class="card pad"><h3>Permissions</h3>
      <ul class="small">
        <li><b>Super Admin</b>: everything, including staff, permanent deletion and server jobs.</li>
        <li><b>Admin</b>: users (block, verify, edit), posts, reports, groups/reels, announcements, bots, settings, logs.</li>
        <li><b>Moderator</b>: reports, hide/restore/delete posts, delete reels, temporary suspension. No settings, no staff, no logs.</li>
      </ul></section>
    <section class="card pad"><h3>Add or change a staff member</h3>
      <p class="muted small">The person must already have an account. Paste their UID (Firebase console → Authentication → Users, or the Users page here).</p>
      <div class="row gap wrap"><input class="grow" id="st-uid" placeholder="User UID" aria-label="User UID">
        <select id="st-role" aria-label="Role"><option value="moderator">Moderator</option><option value="admin">Admin</option><option value="super_admin">Super Admin</option></select>
        <button class="btn btn-primary" id="st-add">Save</button></div></section>
    <div data-list>${loading()}</div>`;
  const list = $('[data-list]', body);

  async function draw() {
    try {
      const snap = await getDocs(collection(db, 'admins'));
      const rows = await Promise.all(snap.docs.map(async (d) => ({ id: d.id, ...d.data(), user: await getUser(d.id) })));
      list.innerHTML = rows.length ? rows.map((r) => `<div class="person" data-uid="${esc(r.id)}">${avatarHtml(r.user.name, r.user.photo, 40)}
        <div class="grow"><b>${esc(r.user.name)}</b> ${ROLE_LABEL[r.role] ? `<span class="tag">${esc(ROLE_LABEL[r.role])}</span>` : '<span class="tag danger" title="No valid role: this person has NO staff access until a role is set">no valid role</span>'}
          <div class="muted small">${esc(r.id)}${r.addedAt ? ` · added ${when(r.addedAt)}` : ''}</div></div>
        ${r.id === state.user.uid ? '<span class="muted small">you</span>' : '<button class="btn btn-danger" data-rm>Remove</button>'}</div>`).join('') : emptyState('No staff documents');
    } catch (e) { list.innerHTML = errorBox(e); }
  }

  $('#st-add', body).addEventListener('click', async (e) => {
    const uid = $('#st-uid', body).value.trim(), role = $('#st-role', body).value;
    if (!uid) return;
    if (uid === state.user.uid) { (await import('../utils.js')).toast('You cannot change your own role.', 'error'); return; }
    const u = await getDoc(doc(db, 'users', uid)).catch(() => null);
    if (!u || !u.exists()) { (await import('../utils.js')).toast('No user with that UID.', 'error'); return; }
    if (u.data().isBot) { (await import('../utils.js')).toast('AI bots cannot be staff.', 'error'); return; }
    if (await act(e.target, () => setDoc(doc(db, 'admins', uid), { role, addedBy: state.user.uid, addedAt: serverTimestamp() }), { ok: 'Saved', log: ['staff role set', uid, `${u.data().name} → ${role}`] })) { $('#st-uid', body).value = ''; e.target.disabled = false; draw(); }
  });
  list.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-rm]');
    if (!b) return;
    const row = b.closest('.person');
    if (!(await confirmBox('Remove this person from staff?', 'Remove'))) return;
    if (await act(b, () => deleteDoc(doc(db, 'admins', row.dataset.uid)), { ok: 'Removed', log: ['staff removed', row.dataset.uid, ''] })) draw();
  });
  await draw();
}
