// Posts management: list, search, details, hide / restore, comments on/off, delete, reports on a post.
// There is deliberately NO approve / reject workflow.
import { db, collection, doc, getDoc, getDocs, updateDoc, deleteDoc, query, where, orderBy, limit, startAfter } from '../firebase.js';
import { $, esc, getUser, avatarHtml, botBadge, timeAgo, emptyState, errorBox, confirmBox, modal, closeModal, debounce, linkify } from '../utils.js';
import { act, loading, tagHtml, short, when } from './common.js';

const PAGE = 20;

export async function render(body) {
  body.innerHTML = `<h2 class="page-title">Posts</h2>
    <div class="row gap wrap"><input class="grow" type="search" id="po-q" placeholder="Search loaded posts by text, or paste a post ID" aria-label="Search posts">
      <label class="small row gap"><input type="checkbox" id="po-hidden"> Hidden only</label></div>
    <div data-list>${loading()}</div><div class="center"><button class="btn" data-more hidden>Load more</button></div>`;
  const list = $('[data-list]', body), moreBtn = $('[data-more]', body);
  let posts = [], cursor = null, filter = '', hiddenOnly = false;

  const rowHtml = (p, users) => {
    const a = users[p.uid] || { name: p.authorName };
    return `<div class="card pad post-row" data-id="${esc(p.id)}"><div class="row gap">${avatarHtml(a.name, a.photo, 36)}
      <div class="grow"><b>${esc(a.name)}</b>${botBadge(a)} <span class="muted small">${timeAgo(p.createdAt)} · ${esc(p.visibility)}</span>
        ${p.hidden ? tagHtml('Hidden', 'danger') : ''}${p.commentsDisabled ? tagHtml('Comments off') : ''}
        <div>${esc(short(p.text, 160)) || '<span class="muted">(no text)</span>'}${p.image ? ' 📷' : ''}${p.videoUrl ? ' 🎬' : ''}</div>
        <div class="muted small">${p.commentCount || 0} comments · ${Object.keys(p.reactions || {}).length} reactions</div></div>
      <button class="btn" data-open>Details</button></div></div>`;
  };

  async function paint() {
    const f = filter.toLowerCase();
    const shown = posts.filter((p) => (!hiddenOnly || p.hidden) && (!f || (p.text || '').toLowerCase().includes(f) || p.id === filter || (p.authorName || '').toLowerCase().includes(f)));
    const users = {};
    await Promise.all([...new Set(shown.map((p) => p.uid))].map(async (uid) => { users[uid] = await getUser(uid); }));
    list.innerHTML = shown.length ? shown.map((p) => rowHtml(p, users)).join('') : emptyState('No posts match');
  }

  async function load(reset) {
    if (reset) { posts = []; cursor = null; list.innerHTML = loading(); }
    try {
      const snap = await getDocs(query(collection(db, 'posts'), orderBy('createdAt', 'desc'), ...(cursor ? [startAfter(cursor)] : []), limit(PAGE)));
      posts.push(...snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      cursor = snap.docs[snap.docs.length - 1] || null;
      moreBtn.hidden = snap.docs.length < PAGE;
      await paint();
    } catch (e) { list.innerHTML = errorBox(e); }
  }

  $('#po-q', body).addEventListener('input', debounce(async (e) => {
    filter = e.target.value.trim();
    if (/^[A-Za-z0-9]{16,}$/.test(filter) && !posts.some((p) => p.id === filter)) {            // post ID not loaded yet
      const s = await getDoc(doc(db, 'posts', filter)).catch(() => null);
      if (s && s.exists()) posts.unshift({ id: s.id, ...s.data() });
    }
    paint();
  }, 300));
  $('#po-hidden', body).addEventListener('change', (e) => { hiddenOnly = e.target.checked; paint(); });
  moreBtn.addEventListener('click', () => load(false));
  list.addEventListener('click', (e) => {
    const b = e.target.closest('[data-open]');
    if (b) openPost(posts.find((p) => p.id === b.closest('.post-row').dataset.id), () => load(true));
  });
  await load(true);
}

async function openPost(p, refresh) {
  const author = await getUser(p.uid);
  const reports = await getDocs(query(collection(db, 'reports'), where('targetId', '==', p.id), limit(20))).then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))).catch(() => []);
  const m = modal(`<h3>Post details</h3>
    <div class="small muted">ID <code>${esc(p.id)}</code> · ${when(p.createdAt)} · ${esc(p.visibility)}${p.groupId ? ' · in a group' : ''}</div>
    <p><a class="author" href="#/profile/${esc(p.uid)}">${esc(author.name)}</a>${botBadge(author)}</p>
    ${p.text ? `<div class="post-text">${linkify(p.text)}</div>` : ''}${p.image ? `<img class="thumb" style="max-height:260px" src="${esc(p.image)}" alt="">` : ''}
    ${p.videoUrl ? `<div class="small muted">Video: ${esc(p.videoUrl)}</div>` : ''}
    <div class="muted small">${p.commentCount || 0} comments · ${Object.keys(p.reactions || {}).length} reactions · ${p.shareCount || 0} shares</div>
    <h4>Reports on this post (${reports.length})</h4>
    ${reports.length ? reports.map((r) => `<div class="small">• ${esc(r.reason)} ${tagHtml(r.status)} ${esc(short(r.details, 80))}</div>`).join('') : '<div class="muted small">None.</div>'}
    <h4>Actions</h4><div class="row gap wrap">
      <button class="btn" data-do="hide">${p.hidden ? 'Restore post' : 'Hide post'}</button>
      <button class="btn" data-do="comments">${p.commentsDisabled ? 'Turn comments on' : 'Turn comments off'}</button>
      <a class="btn" href="#/post/${esc(p.id)}">Open post</a>
      <button class="btn btn-danger" data-do="delete">Delete post</button></div>
    <div class="row end"><button class="btn" data-close>Close</button></div>`, { wide: true });
  m.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-do]');
    if (!b) return;
    const ref = doc(db, 'posts', p.id);
    const done = () => { closeModal(); refresh(); };
    if (b.dataset.do === 'hide') { if (await act(b, () => updateDoc(ref, { hidden: !p.hidden }), { ok: p.hidden ? 'Post restored' : 'Post hidden', log: [p.hidden ? 'post restored' : 'post hidden', p.id, author.name] })) done(); }
    else if (b.dataset.do === 'comments') { if (await act(b, () => updateDoc(ref, { commentsDisabled: !p.commentsDisabled }), { ok: p.commentsDisabled ? 'Comments on' : 'Comments off', log: [p.commentsDisabled ? 'comments enabled' : 'comments disabled', p.id, author.name] })) done(); }
    else if (b.dataset.do === 'delete') {
      if (!(await confirmBox('Delete this post permanently?', 'Delete'))) return;
      if (await act(b, () => deleteDoc(ref), { ok: 'Post deleted', log: ['post deleted', p.id, `${author.name}: ${short(p.text, 80)}`] })) done();
    }
  });
}
