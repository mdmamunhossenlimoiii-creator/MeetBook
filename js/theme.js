// Light / dark / system theme.
const KEY = 'mysocial-theme';
const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export function getThemePref() {
  try { return localStorage.getItem(KEY) || 'system'; } catch { return 'system'; }
}

export function effectiveTheme(pref = getThemePref()) {
  if (pref === 'system') return mq && mq.matches ? 'dark' : 'light';
  return pref;
}

export function applyTheme(pref = getThemePref()) {
  document.documentElement.dataset.theme = effectiveTheme(pref);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', effectiveTheme(pref) === 'dark' ? '#18191a' : '#1877f2');
}

export function setThemePref(pref) {
  try { localStorage.setItem(KEY, pref); } catch { /* storage blocked */ }
  applyTheme(pref);
}

export function toggleTheme() {
  setThemePref(effectiveTheme() === 'dark' ? 'light' : 'dark');
}

if (mq && mq.addEventListener) {
  mq.addEventListener('change', () => { if (getThemePref() === 'system') applyTheme(); });
}
applyTheme();
