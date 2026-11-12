// Shared helpers for the Admin panel: roles, activity log, small UI pieces.
// Real enforcement is in firestore.rules. The checks here only hide buttons a role cannot use.
import { db, collection, addDoc, serverTimestamp } from '../firebase.js';
import { state } from '../state.js';
import { esc, toast, errMsg, tsMs } from '../utils.js';

const RANK = { moderator: 1, admin: 2, super_admin: 3 };
export const ROLE_LABEL = { super_admin: 'Super Admin', admin: 'Admin', moderator: 'Moderator' };
export const hasRole = (min) => (RANK[state.adminRole] || 0) >= RANK[min];

// Every staff action is written to adminLogs (rules: create-only, nobody can edit or delete a log).
export async function logAction(action, target = '', details = '') {
  try {
    await addDoc(collection(db, 'adminLogs'), {
      actorUid: state.user.uid, actorName: state.profile?.name || '', role: state.adminRole || '',
      action: String(action).slice(0, 120), target: String(target || '').slice(0, 200), details: String(details || '').slice(0, 500),
      createdAt: serverTimestamp()
    });
  } catch (e) { console.warn('admin log failed', e); }
}

// Run an admin action: disables the button, reports errors as a toast, logs on success.
export async function act(btn, fn, { ok = 'Done', log } = {}) {
  if (btn) btn.disabled = true;
  try {
    const r = await fn();
    if (r === false) { if (btn) btn.disabled = false; return false; } // cancelled
    if (log) await logAction(...log);
    if (ok) toast(ok, 'success');
    return true;
  } catch (e) { toast(errMsg(e), 'error', 7000); if (btn) btn.disabled = false; return false; }
}

export const loading = () => '<div class="loading">Loading…</div>';
export const dateOnly = (d) => new Date(d).toISOString().slice(0, 10);
export const startOfDay = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const daysAgo = (n) => new Date(Date.now() - n * 86400000);
export const short = (s, n = 140) => { const t = String(s || ''); return t.length > n ? `${t.slice(0, n)}…` : t; };
export const tagHtml = (text, kind = '') => `<span class="tag ${kind}">${esc(text)}</span>`;
export const when = (t) => (t ? new Date(tsMs(t)).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');

// Simple inline-SVG bar chart (no library). rows = [{label, value}]
export function barChart(rows, { title = '', height = 140 } = {}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const w = 100 / Math.max(1, rows.length);
  const bars = rows.map((r, i) => {
    const h = Math.round((r.value / max) * (height - 34));
    return `<g><rect x="${i * w + w * 0.15}%" y="${height - 20 - h}" width="${w * 0.7}%" height="${h}" rx="3" class="bar"><title>${esc(r.label)}: ${r.value}</title></rect>`
      + `<text x="${i * w + w / 2}%" y="${height - 6}" text-anchor="middle" class="bar-label">${esc(r.label)}</text>`
      + `<text x="${i * w + w / 2}%" y="${height - 24 - h}" text-anchor="middle" class="bar-val">${r.value}</text></g>`;
  }).join('');
  return `<figure class="chart" role="img" aria-label="${esc(title)}"><figcaption class="small muted">${esc(title)}</figcaption>
    <svg viewBox="0 0 300 ${height}" preserveAspectRatio="none" width="100%" height="${height}">${bars}</svg></figure>`;
}
