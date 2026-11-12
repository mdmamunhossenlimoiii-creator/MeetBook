// System activity logs: every staff action (adminLogs). Read-only; rules forbid edits and deletes.
import { db, collection, getDocs, query, orderBy, limit, startAfter } from '../firebase.js';
import { $, esc, errorBox, emptyState, debounce } from '../utils.js';
import { loading, when, ROLE_LABEL } from './common.js';

const PAGE = 30;
export async function render(body) {
  body.innerHTML = `<h2 class="page-title">Activity logs</h2>
    <input class="field" type="search" id="lg-q" placeholder="Filter loaded entries" aria-label="Filter logs">
    <div class="card" data-list>${loading()}</div><div class="center"><button class="btn" data-more hidden>Load more</button></div>`;
  const list = $('[data-list]', body), moreBtn = $('[data-more]', body);
  let rows = [], cursor = null, f = '';
  const paint = () => {
    const shown = rows.filter((r) => !f || `${r.action} ${r.target} ${r.details} ${r.actorName}`.toLowerCase().includes(f));
    list.innerHTML = shown.length ? `<table class="table"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Target</th><th>Details</th></tr></thead><tbody>${shown.map((r) =>
      `<tr><td>${when(r.createdAt)}</td><td>${esc(r.actorName || r.actorUid)}<div class="muted small">${esc(ROLE_LABEL[r.role] || r.role || '')}</div></td><td>${esc(r.action)}</td><td class="small">${esc(r.target || '')}</td><td class="small">${esc(r.details || '')}</td></tr>`).join('')}</tbody></table>` : emptyState('No log entries');
  };
  async function load(reset) {
    if (reset) { rows = []; cursor = null; }
    try {
      const snap = await getDocs(query(collection(db, 'adminLogs'), orderBy('createdAt', 'desc'), ...(cursor ? [startAfter(cursor)] : []), limit(PAGE)));
      rows.push(...snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      cursor = snap.docs[snap.docs.length - 1] || null;
      moreBtn.hidden = snap.docs.length < PAGE;
      paint();
    } catch (e) { list.innerHTML = errorBox(e); }
  }
  $('#lg-q', body).addEventListener('input', debounce((e) => { f = e.target.value.trim().toLowerCase(); paint(); }, 250));
  moreBtn.addEventListener('click', () => load(false));
  await load(true);
}
