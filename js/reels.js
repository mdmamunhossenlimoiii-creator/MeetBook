// Short video feed: vertical snap-scroll, likes, share link, report, delete. Video uploads are disabled; links only.
import {
  db, collection, doc, addDoc, updateDoc, deleteDoc, query, orderBy, limit, onSnapshot, serverTimestamp, deleteField
} from './firebase.js';
import { state, onCleanup } from './state.js';
import {
  $, $$, esc, linkify, avatarHtml, prefetchUsers, toast, modal, closeModal, errMsg, emptyState, errorBox, confirmBox,
  parseVideoUrl, videoHtml, notify
} from './utils.js';
import { icon } from './icons.js';
import { openReport } from './feed.js';

const PAGE = 10;

function reelHtml(r, users) {
  const a = users[r.uid] || { name: r.authorName };
  const liked = !!(r.likes && r.likes[state.user.uid]);
  const n = Object.keys(r.likes || {}).length;
  const mine = r.uid === state.user.uid;
  return `<article class="reel" data-id="${esc(r.id)}">
    <div class="reel-media">${videoHtml(r.videoUrl, { lazy: true })}</div>
    <div class="reel-info">
      <a class="reel-author" href="#/profile/${esc(r.uid)}">${avatarHtml(a.name, a.photo, 32)}<b>${esc(a.name)}</b></a>
      ${r.caption ? `<div class="reel-caption">${linkify(r.caption)}</div>` : ''}
    </div>
    <div class="reel-actions">
      <button class="reel-btn ${liked ? 'liked' : ''}" data-act="like" aria-label="Like">${icon('like', 26)}<span>${n}</span></button>
      <button class="reel-btn" data-act="share" aria-label="Copy link">${icon('share', 26)}<span>Share</span></button>
      ${mine || state.isAdmin ? `<button class="reel-btn" data-act="delete" aria-label="Delete">${icon('trash', 26)}<span>Delete</span></button>`
        : `<button class="reel-btn" data-act="report" aria-label="Report">${icon('flag', 26)}<span>Report</span></button>`}
    </div>
  </article>`;
}

export async function render(view) {
  view.innerHTML = `<div class="row between"><h2 class="page-title">Reels</h2>
    <button class="btn btn-primary" data-new>${icon('plus', 16)}New reel</button></div>
    <div class="reels" data-reels><div class="loading">Loading…</div></div>
    <div class="center"><button class="btn" data-more hidden>Load more</button></div>`;
  const wrap = $('[data-reels]', view);
  const moreBtn = $('[data-more]', view);
  let size = PAGE;
  let unsub = null;
  let observer = null;
  const store = new Map();

  function observe() {
    if (observer) observer.disconnect();
    observer = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        const el = en.target;
        const frame = el.querySelector('iframe[data-src]');
        const vid = el.querySelector('video');
        if (en.isIntersecting) {
          if (frame && !frame.src) frame.src = frame.dataset.src;
          if (vid) { vid.muted = true; vid.play().catch(() => {}); }
        } else if (vid) {
          vid.pause();
        }
      });
    }, { threshold: 0.6 });
    $$('.reel', wrap).forEach((el) => observer.observe(el));
  }

  function subscribeReels() {
    if (unsub) unsub();
    unsub = onSnapshot(query(collection(db, 'reels'), orderBy('createdAt', 'desc'), limit(size)), async (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      items.forEach((r) => store.set(r.id, r));
      const users = await prefetchUsers(items.map((r) => r.uid));
      // Don't rebuild while a video is playing unless the list itself changed.
      const sig = items.map((r) => r.id).join(',');
      if (wrap.dataset.sig === sig && wrap.children.length) {
        items.forEach((r) => {
          const card = wrap.querySelector(`[data-id="${CSS.escape(r.id)}"]`);
          if (!card) return;
          const liked = !!(r.likes && r.likes[state.user.uid]);
          const btn = $('[data-act="like"]', card);
          btn.classList.toggle('liked', liked);
          btn.querySelector('span').textContent = Object.keys(r.likes || {}).length;
        });
        return;
      }
      wrap.dataset.sig = sig;
      wrap.innerHTML = items.length ? items.map((r) => reelHtml(r, users)).join('')
        : emptyState('No reels yet', 'Be the first to share a short video link.');
      moreBtn.hidden = snap.size < size;
      observe();
    }, (err) => { wrap.innerHTML = errorBox(err); });
  }
  subscribeReels();
  onCleanup(() => { if (unsub) unsub(); if (observer) observer.disconnect(); });

  moreBtn.addEventListener('click', () => { size += PAGE; subscribeReels(); });
  $('[data-new]', view).addEventListener('click', openCreator);

  wrap.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const card = b.closest('.reel');
    const r = store.get(card.dataset.id);
    try {
      if (b.dataset.act === 'like') {
        const uid = state.user.uid;
        const liked = !!(r.likes && r.likes[uid]);
        await updateDoc(doc(db, 'reels', r.id), { [`likes.${uid}`]: liked ? deleteField() : true });
        if (!liked) notify(r.uid, 'reel_like', { extra: r.id });
      } else if (b.dataset.act === 'share') {
        const link = `${location.origin}${location.pathname}#/reels`;
        try { await navigator.clipboard.writeText(link); toast('Link copied', 'success'); } catch { toast(link, 'info', 8000); }
      } else if (b.dataset.act === 'report') {
        openReport('reel', r);
      } else if (b.dataset.act === 'delete') {
        if (await confirmBox('Delete this reel?', 'Delete')) { await deleteDoc(doc(db, 'reels', r.id)); toast('Reel deleted', 'success'); }
      }
    } catch (err) { toast(errMsg(err), 'error'); }
  });
}

function openCreator() {
  const m = modal(`<h3>New reel</h3>
    <div class="field"><label for="rl-url">Video link (uploads are disabled)</label>
      <input id="rl-url" type="url" placeholder="YouTube / Shorts link or direct https .mp4 link"></div>
    <p class="muted small">MeetBook currently accepts video links only. Uploading video files is disabled.</p>
    <div class="field"><label for="rl-cap">Caption</label><textarea id="rl-cap" rows="2" maxlength="500"></textarea></div>
    <div class="row end gap"><button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="rl-go">Share reel</button></div>`);
  $('#rl-go', m).addEventListener('click', async () => {
    const btn = $('#rl-go', m);
    const url = $('#rl-url', m).value.trim();
    btn.disabled = true;
    try {
      if (!url) throw new Error('Add a supported video link.');
      if (!parseVideoUrl(url)) throw new Error('Unsupported link. Use a YouTube link or a direct https .mp4/.webm link.');
      await addDoc(collection(db, 'reels'), {
        uid: state.user.uid, authorName: state.profile.name, videoUrl: url,
        caption: $('#rl-cap', m).value.trim(), likes: {}, createdAt: serverTimestamp()
      });
      closeModal();
      toast('Reel shared', 'success');
    } catch (e) { toast(errMsg(e), 'error', 7000); btn.disabled = false; }
  });
}
