// Shared helpers: DOM, formatting, images, modal/toast, user cache, notifications.
import { db, doc, getDoc, addDoc, collection, serverTimestamp } from './firebase.js';
import { state } from './state.js';
import { icon } from './icons.js';
import { cloudinaryImages } from './firebase-config.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export function debounce(fn, ms = 300) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export const pairId = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);

// ---------- time ----------
export function tsMs(ts) {
  if (!ts) return Date.now(); // pending serverTimestamp
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (ts instanceof Date) return ts.getTime();
  return Number(ts) || Date.now();
}

export function timeAgo(ts) {
  const s = Math.max(0, Math.floor((Date.now() - tsMs(ts)) / 1000));
  if (s < 45) return 'Just now';
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(tsMs(ts)).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function fullDate(ts) {
  return new Date(tsMs(ts)).toLocaleString();
}

// ---------- text ----------
export function linkify(text) {
  const safe = esc(text);
  return safe
    .replace(/(https?:\/\/[^\s<]+)/g, (u) => `<a href="${u}" target="_blank" rel="noopener noreferrer nofollow">${u}</a>`)
    .replace(/\n/g, '<br>');
}

// ---------- avatars ----------
function hue(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
  return h;
}

export function avatarHtml(name, photo, size = 40) {
  const n = name || '?';
  const style = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px`;
  if (photo && /^(data:image\/|https:\/\/)/.test(photo)) {
    return `<img class="avatar" style="${style}" src="${esc(photo)}" alt="${esc(n)}" loading="lazy">`;
  }
  return `<span class="avatar avatar-initial" style="${style};background:hsl(${hue(n)},55%,45%)">${esc(n.trim().charAt(0).toUpperCase())}</span>`;
}

// Badges shown next to an account name: "AI Bot" for bots, a blue check for verified accounts.
// (Name kept for the many existing call sites.)
export function botBadge(u) {
  if (!u) return '';
  return (u.isBot ? ' <span class="bot-badge" title="Automated AI bot account">AI Bot</span>' : '')
    + (u.verified ? ' <span class="verified-badge" title="Verified account" aria-label="Verified account">✔</span>' : '');
}
export const isSuspended = (p) => !!(p && p.suspendedUntil && tsMs(p.suspendedUntil) > Date.now());
export const fmtDate = (t) => (t ? new Date(tsMs(t)).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');

// ---------- user cache ----------
const userCache = new Map();

export async function getUser(uid) {
  if (!uid) return null;
  if (userCache.has(uid)) return userCache.get(uid);
  const p = getDoc(doc(db, 'users', uid)).then((s) => (s.exists() ? { uid, ...s.data() } : { uid, name: 'Unknown user' }))
    .catch(() => ({ uid, name: 'Unknown user' }));
  userCache.set(uid, p);
  const u = await p;
  userCache.set(uid, Promise.resolve(u));
  return u;
}

export async function prefetchUsers(uids) {
  const list = [...new Set(uids.filter(Boolean))];
  const users = await Promise.all(list.map(getUser));
  return Object.fromEntries(users.map((u) => [u.uid, u]));
}

export function invalidateUser(uid) {
  userCache.delete(uid);
}

// ---------- notifications ----------
export async function notify(to, type, extra = {}) {
  if (!state.user || !to || to === state.user.uid) return;
  if (/^bot_\d\d$/.test(to)) return; // AI bots have no inbox
  try {
    await addDoc(collection(db, 'notifications'), {
      to, type,
      from: state.user.uid,
      fromName: state.profile?.name || 'Someone',
      postId: extra.postId || null,
      extra: extra.extra || null,
      read: false,
      createdAt: serverTimestamp()
    });
  } catch (e) {
    console.warn('notify failed', e);
  }
}

// ---------- toast & modal ----------
export function toast(msg, type = 'info', ms = 4000) {
  let box = $('#toasts');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toasts';
    document.body.appendChild(box);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

// Firestore puts a "create this index" console link inside the error message.
export function indexLinkFrom(e) {
  const m = (e && e.message) || String(e || '');
  if (!/index/i.test(m)) return null;
  return (m.match(/https:\/\/console\.firebase\.google\.com[^\s"')]*/) || [])[0] || null;
}

export function isIndexError(e) {
  const m = (e && e.message) || String(e || '');
  return /requires an index|query requires/i.test(m) || (e && e.code === 'failed-precondition' && /index/i.test(m));
}

// One dismissible bar under the top bar, with one button per missing index.
export function showIndexNotice(url) {
  let bar = $('#index-notice');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'index-notice';
    bar.className = 'index-notice';
    bar.innerHTML = `<div><b>One-time setup:</b> a Firestore index is missing (free, takes 1-2 min to build).
      <span data-links></span> Then reload this page.</div>
      <button class="icon-btn" data-dismiss aria-label="Dismiss">${icon('x')}</button>`;
    bar.querySelector('[data-dismiss]').addEventListener('click', () => bar.remove());
    const top = $('.topbar');
    if (top) top.after(bar); else document.body.prepend(bar);
  }
  const holder = bar.querySelector('[data-links]');
  if (url && !holder.querySelector(`[href="${CSS.escape(url)}"]`)) {
    const n = holder.children.length + 1;
    const a = document.createElement('a');
    a.className = 'btn btn-primary';
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = `Create index ${n}`;
    holder.appendChild(a);
  }
}

export function errMsg(e) {
  const m = (e && e.message) || String(e);
  if (isIndexError(e)) return 'This view needs a one-time Firestore index. Use the "Create index" button, then reload.';
  if (e && e.code === 'permission-denied') return 'Permission denied. Check that firestore.rules are published.';
  return m;
}

export function modal(html, { wide = false, onClose } = {}) {
  closeModal();
  const wrap = document.createElement('div');
  wrap.id = 'modal-root';
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal${wide ? ' modal-wide' : ''}" role="dialog" aria-modal="true">
    <button class="icon-btn modal-close" data-close aria-label="Close">${icon('x')}</button>${html}</div>`;
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap || e.target.closest('[data-close]')) { closeModal(); if (onClose) onClose(); }
  });
  document.body.appendChild(wrap);
  document.body.classList.add('modal-open');
  return wrap.querySelector('.modal');
}

export function closeModal() {
  const m = $('#modal-root');
  if (m) m.remove();
  document.body.classList.remove('modal-open');
}

export function confirmBox(message, okLabel = 'Confirm') {
  return new Promise((resolve) => {
    const m = modal(`<h3>${esc(message)}</h3>
      <div class="row end gap"><button class="btn" data-close>Cancel</button><button class="btn btn-danger" id="cf-ok">${esc(okLabel)}</button></div>`,
      { onClose: () => resolve(false) });
    $('#cf-ok', m).addEventListener('click', () => { closeModal(); resolve(true); });
  });
}

// ---------- images ----------
export function resizeImage(file, max = 900, quality = 0.72) {
  return new Promise((resolve, reject) => {
    if (!file || !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) return reject(new Error('Choose a JPG, PNG, WebP, or GIF image.'));
    if (file.size > 10 * 1024 * 1024) return reject(new Error('Choose an image smaller than 10 MB.'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      let { width: w, height: h } = img;
      const scale = Math.min(1, max / Math.max(w, h));
      w = Math.round(w * scale); h = Math.round(h * scale);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      let q = quality;
      let out = c.toDataURL('image/jpeg', q);
      while (out.length > 700000 && q > 0.3) { q -= 0.1; out = c.toDataURL('image/jpeg', q); }
      if (out.length > 900000) return reject(new Error('Image is too large even after compression.'));
      resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read this image.')); };
    img.src = url;
  });
}


/**
 * Upload a compressed JPEG data URL to MeetBook's Cloudinary image endpoint.
 * Only an unsigned upload preset is used in the browser; never place an API secret here.
 */
export async function uploadImageToCloudinary(dataUrl) {
  const { cloudName, uploadPreset } = cloudinaryImages;
  if (!cloudName || !uploadPreset) {
    throw new Error('Photo upload is not configured yet. The MeetBook owner must finish the Cloudinary image setup.');
  }
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/jpeg;base64,')) {
    throw new Error('The selected photo could not be prepared. Please choose it again.');
  }
  const blob = await (await fetch(dataUrl)).blob();
  if (!blob.size || blob.size > 1024 * 1024) throw new Error('The compressed photo must be 1 MB or smaller.');
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`);
    xhr.onload = () => {
      try {
        const res = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && typeof res.secure_url === 'string' && res.secure_url.startsWith('https://res.cloudinary.com/')) {
          resolve(res.secure_url);
        } else {
          reject(new Error((res.error && res.error.message) || 'Photo upload failed.'));
        }
      } catch { reject(new Error('Photo upload failed.')); }
    };
    xhr.onerror = () => reject(new Error('Network error during photo upload.'));
    const fd = new FormData();
    fd.append('file', blob, 'meetbook-photo.jpg');
    fd.append('upload_preset', uploadPreset);
    xhr.send(fd);
  });
}

// ---------- video links ----------
// Returns {kind:'youtube', src} | {kind:'file', src} | null
export function parseVideoUrl(raw) {
  let u;
  try { u = new URL(String(raw).trim()); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.replace(/^www\./, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.slice(1);
  else if (host === 'youtube.com' || host === 'm.youtube.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else if (u.pathname.startsWith('/shorts/') || u.pathname.startsWith('/embed/')) id = u.pathname.split('/')[2];
  }
  if (id && /^[\w-]{6,15}$/.test(id)) {
    return { kind: 'youtube', src: `https://www.youtube-nocookie.com/embed/${id}?rel=0&playsinline=1` };
  }
  if (/\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(u.pathname + u.search) || host.endsWith('res.cloudinary.com')) {
    return { kind: 'file', src: u.href };
  }
  return null;
}

export function videoHtml(url, { lazy = false, autoplay = false } = {}) {
  const v = parseVideoUrl(url);
  if (!v) return '';
  if (v.kind === 'youtube') {
    const attr = lazy ? `data-src="${esc(v.src)}"` : `src="${esc(v.src)}"`;
    return `<iframe class="video-frame" ${attr} title="Video" loading="lazy" allow="accelerometer; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
  }
  return `<video class="video-el" src="${esc(v.src)}" controls playsinline preload="metadata" ${autoplay ? 'autoplay muted' : ''} loop></video>`;
}

export async function uploadVideoToCloudinary(file, { cloudName, uploadPreset }, onProgress) {
  if (!cloudName || !uploadPreset) throw new Error('Video upload is not configured.');
  if (!file.type.startsWith('video/')) throw new Error('Please choose a video file.');
  if (file.size > 50 * 1024 * 1024) throw new Error('Video must be 50 MB or smaller.');
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/video/upload`);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      try {
        const res = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && res.secure_url) resolve(res.secure_url);
        else reject(new Error((res.error && res.error.message) || 'Upload failed.'));
      } catch { reject(new Error('Upload failed.')); }
    };
    xhr.onerror = () => reject(new Error('Network error during upload.'));
    const fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', uploadPreset);
    xhr.send(fd);
  });
}

// ---------- reactions ----------
export const REACTIONS = {
  like: { emoji: '👍', label: 'Like' },
  love: { emoji: '❤️', label: 'Love' },
  haha: { emoji: '😂', label: 'Haha' },
  wow: { emoji: '😮', label: 'Wow' },
  sad: { emoji: '😢', label: 'Sad' },
  angry: { emoji: '😡', label: 'Angry' }
};

export function emptyState(title, text = '') {
  return `<div class="empty"><h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}</div>`;
}

export function errorBox(e) {
  if (isIndexError(e)) {
    const url = indexLinkFrom(e);
    if (url) showIndexNotice(url);
    return `<div class="notice notice-error"><b>This view needs a one-time Firestore index</b> (free).
      ${url ? `<p><a class="btn btn-primary" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Create index</a></p>` : ''}
      <span class="small">When the index status is "Enabled" in the Firebase console (1-2 minutes), reload this page.</span></div>`;
  }
  return `<div class="notice notice-error">${esc(errMsg(e))}</div>`;
}
