// Admin panel shell: sidebar, role-based sections, routing between sections (#/admin/<section>).
import { state, navigate } from '../state.js';
import { $, $$, esc, emptyState, errorBox } from '../utils.js';
import { icon } from '../icons.js';
import { hasRole, ROLE_LABEL, loading } from './common.js';

// Each section is loaded on demand. `min` is the lowest role that sees it.
const SECTIONS = [
  { id: 'dashboard', label: 'Dashboard', ic: 'home', min: 'moderator', load: () => import('./dashboard.js') },
  { id: 'reports', label: 'Reports', ic: 'flag', min: 'moderator', load: () => import('./reports.js') },
  { id: 'users', label: 'Users', ic: 'users', min: 'moderator', load: () => import('./users.js') },
  { id: 'posts', label: 'Posts', ic: 'comment', min: 'moderator', load: () => import('./posts.js') },
  { id: 'content', label: 'Reels & Groups', ic: 'grid', min: 'moderator', load: () => import('./content.js') },
  { id: 'bots', label: 'AI Bots', ic: 'user', min: 'admin', load: () => import('./bots.js') },
  { id: 'announcements', label: 'Announcements', ic: 'bell', min: 'admin', load: () => import('./announcements.js') },
  { id: 'settings', label: 'Global settings', ic: 'settings', min: 'admin', load: () => import('./settings.js') },
  { id: 'logs', label: 'Activity logs', ic: 'check', min: 'admin', load: () => import('./logs.js') },
  { id: 'staff', label: 'Staff & roles', ic: 'shield', min: 'super_admin', load: () => import('./staff.js') },
  { id: 'server', label: 'Server jobs', ic: 'globe', min: 'super_admin', load: () => import('./server.js') }
];

let publicProfileBackfill = null;
async function ensurePublicProfileBackfill() {
  if (!['admin', 'super_admin'].includes(state.adminRole)) return;
  if (!publicProfileBackfill) {
    publicProfileBackfill = import('./public-profile-migration.js')
      .then((m) => m.backfillPublicProfiles())
      .catch((e) => { publicProfileBackfill = null; throw e; });
  }
  return publicProfileBackfill;
}

export async function render(view, section) {
  if (!state.isAdmin) {
    view.innerHTML = emptyState('Admins only', 'Your account is not listed as staff.');
    return;
  }
  const allowed = SECTIONS.filter((s) => hasRole(s.min));
  const current = allowed.find((s) => s.id === section) || allowed[0];
  view.classList.add('admin-view');
  view.innerHTML = `
  <div class="admin-shell">
    <nav class="admin-nav card" aria-label="Admin sections">
      <div class="admin-role small muted">Signed in as <b>${esc(ROLE_LABEL[state.adminRole] || 'Staff')}</b></div>
      ${allowed.map((s) => `<a class="admin-link ${s.id === current.id ? 'active' : ''}" href="#/admin/${s.id}">${icon(s.ic, 18)}<span>${esc(s.label)}</span></a>`).join('')}
    </nav>
    <section class="admin-body" data-body>${loading()}</section>
  </div>`;
  const body = $('[data-body]', view);
  try {
    await ensurePublicProfileBackfill().catch((e) => console.warn('Public profile migration did not finish:', e));
    const mod = await current.load();
    await mod.render(body);
  } catch (e) {
    console.error(e);
    body.innerHTML = errorBox(e);
  }
}

export { SECTIONS };
