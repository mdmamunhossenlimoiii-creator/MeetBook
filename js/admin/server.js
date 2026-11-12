// Server jobs (Super Admin): status of the deletion queue and the scheduled encrypted backup.
// The jobs themselves run in GitHub Actions with a service-account secret, never in the browser.
import { db, doc, getDoc, getDocs, collection, query, limit } from '../firebase.js';
import { $, esc, errorBox, emptyState } from '../utils.js';
import { loading, tagHtml, when } from './common.js';

export async function render(body) {
  body.innerHTML = `<h2 class="page-title">Server jobs</h2>${loading()}`;
  try {
    const [bk, dr] = await Promise.all([getDoc(doc(db, 'system', 'backups')), getDocs(query(collection(db, 'deletionRequests'), limit(50)))]);
    const b = bk.exists() ? bk.data() : null;
    const reqs = dr.docs.map((d) => ({ id: d.id, ...d.data() }));
    body.innerHTML = `<h2 class="page-title">Server jobs</h2>
    <section class="card pad"><h3>Database backup</h3>
      <p class="muted small">A GitHub Action runs every Sunday (02:30 UTC) or on demand (GitHub → Actions → "Weekly encrypted backup" → Run workflow). The file is AES-256 encrypted with your <code>BACKUP_PASSPHRASE</code> secret before it is stored as a workflow artifact (30 days). Embedded images are left out to keep it small.</p>
      ${b ? `<div>${tagHtml(b.status || 'ok')} Last backup <b>${when(b.lastRunAt)}</b> · ${esc(b.lastFile || '')} · ${Math.round((b.sizeBytes || 0) / 1024)} KB</div>
        <div class="small muted">${Object.entries(b.counts || {}).map(([k, v]) => `${esc(k)}: ${v}`).join(' · ')}</div>`
        : '<div class="muted">No backup has run yet (or the secrets are not set up).</div>'}</section>
    <section class="card pad"><h3>Permanent deletion queue</h3>
      <p class="muted small">Processed every ~30 minutes by the "Account deletion queue" Action. Queue a deletion from Users → Manage.</p>
      ${reqs.length ? reqs.map((r) => `<div class="small">• <code>${esc(r.id)}</code> ${esc(r.name || '')} ${tagHtml(r.status || 'pending', r.status === 'refused' ? 'danger' : '')} ${esc(r.note || '')} <span class="muted">${when(r.finishedAt || r.createdAt)}</span></div>`).join('') : emptyState('Queue is empty')}</section>`;
  } catch (e) { body.innerHTML = errorBox(e); }
}
