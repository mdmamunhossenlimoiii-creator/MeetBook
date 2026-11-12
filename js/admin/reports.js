// Reports: user / post / comment / group / reel reports with details, resolve / dismiss and history.
import {
  db, collection, doc, getDoc, updateDoc, deleteDoc, query, where, orderBy, limit, getDocs, serverTimestamp, increment
} from '../firebase.js';
import { state } from '../state.js';
import { $, $$, esc, getUser, timeAgo, emptyState, errorBox, confirmBox, linkify } from '../utils.js';
import { act, loading, tagHtml, hasRole } from './common.js';

const KINDS = ['all', 'user', 'post', 'comment', 'group', 'reel'];

async function loadTarget(r) {
  try {
    if (r.kind === 'user') { const s = await getDoc(doc(db, 'users', r.targetId)); return s.exists() ? { title: s.data().name, text: s.data().bio || '', link: `#/profile/${r.targetId}` } : null; }
    if (r.kind === 'group') { const s = await getDoc(doc(db, 'groups', r.targetId)); return s.exists() ? { title: s.data().name, text: s.data().description || '', link: `#/group/${r.targetId}` } : null; }
    if (r.kind === 'comment') { const s = await getDoc(doc(db, 'posts', r.postId, 'comments', r.targetId)); return s.exists() ? { text: s.data().text, link: `#/post/${r.postId}` } : null; }
    const s = await getDoc(doc(db, r.kind === 'reel' ? 'reels' : 'posts', r.targetId));
    if (!s.exists()) return null;
    const d = s.data();
    return { text: d.text || d.caption || '', image: d.image || '', video: d.videoUrl || '', hidden: d.hidden, link: r.kind === 'post' ? `#/post/${r.targetId}` : '#/reels' };
  } catch { return null; }
}

export async function render(body) {
  let status = 'open';
  let kind = 'all';
  body.innerHTML = `<h2 class="page-title">Reports</h2>
    <div class="row gap wrap"><div class="tabs grow" style="margin:0"><button class="tab active" data-status="open">Open</button><button class="tab" data-status="resolved">History</button></div>
      <select data-kind aria-label="Report type">${KINDS.map((k) => `<option value="${k}">${k === 'all' ? 'All types' : k[0].toUpperCase() + k.slice(1)} reports</option>`).join('')}</select></div>
    <div data-list>${loading()}</div>`;
  const list = $('[data-list]', body);

  async function draw() {
    list.innerHTML = loading();
    try {
      const snap = await getDocs(query(collection(db, 'reports'), where('status', '==', status), orderBy('createdAt', 'desc'), limit(40)));
      let reports = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (kind !== 'all') reports = reports.filter((r) => r.kind === kind);
      if (!reports.length) { list.innerHTML = emptyState(status === 'open' ? 'No open reports' : 'No resolved reports yet'); return; }
      const cards = await Promise.all(reports.map(async (r) => {
        const [t, reporter, author] = await Promise.all([loadTarget(r), getUser(r.reporterUid), r.targetUid ? getUser(r.targetUid) : null]);
        return `<div class="card pad report" data-id="${esc(r.id)}" data-kind="${esc(r.kind)}" data-target="${esc(r.targetId)}" data-post="${esc(r.postId || '')}" data-author="${esc(r.targetUid || '')}">
          <div class="row between wrap"><span><b>${esc(r.reason)}</b> ${tagHtml(r.kind)}${r.status !== 'open' ? tagHtml(r.action || 'resolved') : ''}</span>
            <span class="muted small">${timeAgo(r.createdAt)} · reported by ${esc(reporter.name)}</span></div>
          ${r.details ? `<p>${esc(r.details)}</p>` : ''}
          <div class="reported">${t ? `${t.title ? `<b>${esc(t.title)}</b>` : ''}<div class="muted small">By ${esc(author?.name || 'unknown')} ${t.hidden ? tagHtml('hidden', 'danger') : ''}</div>
            ${t.text ? `<div>${linkify(t.text)}</div>` : ''}${t.image ? `<img class="thumb" src="${esc(t.image)}" alt="">` : ''}${t.video ? `<div class="muted small">Video: ${esc(t.video)}</div>` : ''}
            <a class="small" href="${esc(t.link)}">Open</a>` : '<div class="muted">The reported content no longer exists.</div>'}</div>
          ${r.status === 'open' ? `<div class="row gap wrap">
            ${t && ['post', 'comment', 'reel', 'group'].includes(r.kind) && (r.kind !== 'group' || hasRole('admin')) ? `<button class="btn btn-danger" data-act="delete">Delete ${esc(r.kind)}</button>` : ''}
            ${t && r.kind === 'post' ? '<button class="btn" data-act="hide">Hide post</button>' : ''}
            <button class="btn" data-act="resolve">Mark resolved</button>
            <button class="btn" data-act="dismiss">Dismiss</button>
            ${r.targetUid ? `<a class="btn" href="#/admin/users" title="Open Users and search the UID ${esc(r.targetUid)}">Find user</a>` : ''}</div>`
            : `<div class="muted small">Handled${r.resolvedBy ? ' by ' + esc((await getUser(r.resolvedBy)).name) : ''}</div>`}</div>`;
      }));
      list.innerHTML = cards.join('');
    } catch (e) { list.innerHTML = errorBox(e); }
  }

  const finish = async (card, action) => {
    await updateDoc(doc(db, 'reports', card.dataset.id), { status: 'resolved', action, resolvedBy: state.user.uid, resolvedAt: serverTimestamp() });
    card.remove();
  };

  body.addEventListener('click', async (e) => {
    const st = e.target.closest('[data-status]');
    if (st) { status = st.dataset.status; $$('[data-status]', body).forEach((x) => x.classList.toggle('active', x === st)); draw(); return; }
    const b = e.target.closest('[data-act]');
    const card = b && b.closest('.report');
    if (!card) return;
    const { kind: k, target, post, id } = card.dataset;
    const log = (a) => [`report ${a}`, `${k}:${target}`, `report ${id}`];
    switch (b.dataset.act) {
      case 'resolve': await act(b, () => finish(card, 'resolved'), { ok: 'Report resolved', log: log('resolved') }); break;
      case 'dismiss': await act(b, () => finish(card, 'dismissed'), { ok: 'Report dismissed', log: log('dismissed') }); break;
      case 'hide': await act(b, async () => { await updateDoc(doc(db, 'posts', target), { hidden: true }); await finish(card, 'hidden'); }, { ok: 'Post hidden', log: log('post hidden') }); break;
      case 'delete':
        if (!(await confirmBox(`Delete this ${k} permanently?`, 'Delete'))) return;
        await act(b, async () => {
          if (k === 'comment') { await deleteDoc(doc(db, 'posts', post, 'comments', target)); await updateDoc(doc(db, 'posts', post), { commentCount: increment(-1) }); }
          else await deleteDoc(doc(db, k === 'reel' ? 'reels' : k === 'group' ? 'groups' : 'posts', target));
          await finish(card, 'deleted');
        }, { ok: `${k} deleted`, log: log(`${k} deleted`) });
        break;
      default: break;
    }
  });
  $('[data-kind]', body).addEventListener('change', (e) => { kind = e.target.value; draw(); });
  await draw();
}
