// Reels and Groups management (list, details, delete). Reports about them are handled in Reports.
import { db, collection, doc, getDocs, deleteDoc, query, orderBy, limit, startAfter } from '../firebase.js';
import { $, $$, esc, getUser, timeAgo, emptyState, errorBox, confirmBox, debounce } from '../utils.js';
import { act, hasRole, loading, short, tagHtml } from './common.js';

const PAGE = 20;
const CFG = {
  reels: { title: 'Reels', order: 'createdAt', row: (d, a) => `<div class="grow"><b>${esc(a.name)}</b> <span class="muted small">${timeAgo(d.createdAt)} · ${Object.keys(d.likes || {}).length} likes</span>
    <div>${esc(short(d.caption, 120)) || '<span class="muted">(no caption)</span>'}</div><div class="small muted">${esc(short(d.videoUrl, 90))}</div></div>
    <a class="btn" href="#/reels">Open</a>`, text: (d) => `${d.caption || ''} ${d.authorName || ''}`, who: (d) => d.uid, canDelete: () => true },
  groups: { title: 'Groups', order: 'createdAt', row: (d, a) => `<div class="grow"><a class="author" href="#/group/${esc(d.id)}">${esc(d.name)}</a> ${tagHtml(d.privacy)}
    <div class="muted small">${(d.members || []).length} members · owner ${esc(a.name)} · ${timeAgo(d.createdAt)}</div>
    <div class="small">${esc(short(d.description, 120))}</div></div>`, text: (d) => `${d.name} ${d.description || ''}`, who: (d) => d.ownerUid, canDelete: () => hasRole('admin') }
};

export async function render(body) {
  body.innerHTML = `<h2 class="page-title">Reels &amp; Groups</h2>
    <div class="tabs"><button class="tab active" data-kind="reels">Reels</button><button class="tab" data-kind="groups">Groups</button></div>
    <input class="field" type="search" id="ct-q" placeholder="Search loaded items" aria-label="Search">
    <div data-list>${loading()}</div><div class="center"><button class="btn" data-more hidden>Load more</button></div>`;
  const list = $('[data-list]', body), moreBtn = $('[data-more]', body);
  let kind = 'reels', items = [], cursor = null, filter = '';

  async function paint() {
    const c = CFG[kind], f = filter.toLowerCase();
    const shown = items.filter((d) => !f || c.text(d).toLowerCase().includes(f));
    const users = {};
    await Promise.all([...new Set(shown.map(c.who))].map(async (u) => { users[u] = await getUser(u); }));
    list.innerHTML = shown.length ? shown.map((d) => `<div class="person" data-id="${esc(d.id)}">${c.row(d, users[c.who(d)] || { name: '?' })}
      ${c.canDelete() ? '<button class="btn btn-danger" data-del>Delete</button>' : ''}</div>`).join('') : emptyState(`No ${kind} found`);
  }
  async function load(reset) {
    if (reset) { items = []; cursor = null; list.innerHTML = loading(); }
    try {
      const snap = await getDocs(query(collection(db, kind), orderBy(CFG[kind].order, 'desc'), ...(cursor ? [startAfter(cursor)] : []), limit(PAGE)));
      items.push(...snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      cursor = snap.docs[snap.docs.length - 1] || null;
      moreBtn.hidden = snap.docs.length < PAGE;
      await paint();
    } catch (e) { list.innerHTML = errorBox(e); }
  }
  $$('[data-kind]', body).forEach((t) => t.addEventListener('click', () => {
    kind = t.dataset.kind; $$('[data-kind]', body).forEach((x) => x.classList.toggle('active', x === t)); load(true);
  }));
  $('#ct-q', body).addEventListener('input', debounce((e) => { filter = e.target.value.trim(); paint(); }, 250));
  moreBtn.addEventListener('click', () => load(false));
  list.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-del]');
    if (!b) return;
    const id = b.closest('.person').dataset.id;
    const d = items.find((x) => x.id === id);
    if (!(await confirmBox(`Delete this ${kind === 'reels' ? 'reel' : 'group'}? This cannot be undone.`, 'Delete'))) return;
    if (await act(b, () => deleteDoc(doc(db, kind, id)), { ok: 'Deleted', log: [`${kind === 'reels' ? 'reel' : 'group'} deleted`, id, short(d.name || d.caption, 80)] })) load(true);
  });
  await load(true);
}
