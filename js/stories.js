// 24-hour stories: strip on the feed, creator, full-screen viewer.
import { db, collection, addDoc, deleteDoc, doc, getDocs, query, where, serverTimestamp, Timestamp } from './firebase.js';
import { state } from './state.js';
import {
  $, $$, esc, avatarHtml, prefetchUsers, toast, modal, closeModal, resizeImage, uploadImageToCloudinary, tsMs, timeAgo, errMsg,
  isIndexError, indexLinkFrom, showIndexNotice
} from './utils.js';
import { icon } from './icons.js';

const VIEWED_KEY = 'mysocial-viewed-stories';
const DURATION = 5000;
const BACKGROUNDS = [
  'linear-gradient(135deg,#1877f2,#0a4dad)', 'linear-gradient(135deg,#e91e63,#ff7043)',
  'linear-gradient(135deg,#43a047,#00695c)', 'linear-gradient(135deg,#8e24aa,#3949ab)',
  'linear-gradient(135deg,#212121,#546e7a)'
];

function viewedSet() {
  try { return new Set(JSON.parse(localStorage.getItem(VIEWED_KEY) || '[]')); } catch { return new Set(); }
}
function markViewed(id) {
  const s = viewedSet();
  s.add(id);
  try { localStorage.setItem(VIEWED_KEY, JSON.stringify([...s].slice(-300))); } catch { /* storage blocked */ }
}

async function loadStories() {
  const q = query(
    collection(db, 'stories'),
    where('audience', 'array-contains', state.user.uid),
    where('expiresAt', '>', Timestamp.now())
  );
  const snap = await getDocs(q);
  const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  items.sort((a, b) => tsMs(a.createdAt) - tsMs(b.createdAt));
  return items;
}

export async function renderStories(container) {
  container.innerHTML = `<div class="stories card"><div class="loading small">Loading stories…</div></div>`;
  let items = [];
  try {
    items = await loadStories();
  } catch (e) {
    const url = isIndexError(e) ? indexLinkFrom(e) : null;
    if (url) showIndexNotice(url);
    container.innerHTML = `<div class="stories card"><button class="story add" data-add><span class="story-plus">${icon('plus', 22)}</span><small>Add story</small></button>
      <span class="muted small">${isIndexError(e) ? 'Stories need a one-time index (see the bar at the top).' : `Stories unavailable: ${esc(errMsg(e)).slice(0, 100)}`}</span></div>`;
    $('[data-add]', container).addEventListener('click', () => openCreator(() => renderStories(container)));
    return;
  }
  const users = await prefetchUsers(items.map((s) => s.uid));
  const viewed = viewedSet();
  const byUser = new Map();
  items.forEach((s) => { if (!byUser.has(s.uid)) byUser.set(s.uid, []); byUser.get(s.uid).push(s); });
  const groups = [...byUser.entries()].map(([uid, list]) => ({
    uid, list, unseen: list.some((s) => !viewed.has(s.id)), latest: tsMs(list[list.length - 1].createdAt)
  }));
  groups.sort((a, b) => (a.uid === state.user.uid ? -1 : b.uid === state.user.uid ? 1 : 0) || (b.unseen - a.unseen) || (b.latest - a.latest));

  container.innerHTML = `<div class="stories card" role="list">
    <button class="story add" data-add role="listitem" aria-label="Add a story"><span class="story-plus">${icon('plus', 22)}</span><small>Add story</small></button>
    ${groups.map((g) => {
      const u = users[g.uid] || { name: 'User' };
      return `<button class="story ${g.unseen ? 'unseen' : 'seen'}" data-uid="${esc(g.uid)}" role="listitem" aria-label="View story by ${esc(u.name)}">
        <span class="story-ring">${avatarHtml(u.name, u.photo, 52)}</span><small>${g.uid === state.user.uid ? 'Your story' : esc(u.name.split(' ')[0])}</small></button>`;
    }).join('')}
  </div>`;

  $('[data-add]', container).addEventListener('click', () => openCreator(() => renderStories(container)));
  $$('[data-uid]', container).forEach((b) => b.addEventListener('click', () => {
    const g = groups.find((x) => x.uid === b.dataset.uid);
    // start at the first unseen story of that person
    const start = Math.max(0, g.list.findIndex((s) => !viewed.has(s.id)));
    openViewer(g.list, start, users[g.uid] || { name: 'User' }, () => renderStories(container));
  }));
}

// ------------------------------------------------------------------ creator
function openCreator(done) {
  let image = '';
  let bg = BACKGROUNDS[0];
  let mode = 'photo';
  const m = modal(`<h3>Create story</h3>
    <div class="tabs"><button class="tab active" data-mode="photo">Photo</button><button class="tab" data-mode="text">Text</button></div>
    <div data-pane-photo>
      <label class="btn btn-block">${icon('image')}<span>Choose a photo</span><input type="file" id="st-file" accept="image/*" hidden></label>
      <div class="story-preview" id="st-preview" hidden></div>
    </div>
    <div data-pane-text hidden>
      <div class="story-preview text" id="st-text-preview" style="background:${BACKGROUNDS[0]}">
        <textarea id="st-text" maxlength="200" rows="4" placeholder="Type something…" aria-label="Story text"></textarea>
      </div>
      <div class="swatches">${BACKGROUNDS.map((b, i) => `<button class="swatch ${i === 0 ? 'active' : ''}" style="background:${b}" data-bg="${i}" aria-label="Background ${i + 1}"></button>`).join('')}</div>
    </div>
    <div class="field"><label for="st-caption">Caption (optional)</label><input id="st-caption" maxlength="150"></div>
    <p class="muted small">Visible to you and your friends for 24 hours.</p>
    <div class="row end gap"><button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="st-go">Share story</button></div>`);

  $$('.tab', m).forEach((t) => t.addEventListener('click', () => {
    mode = t.dataset.mode;
    $$('.tab', m).forEach((x) => x.classList.toggle('active', x === t));
    $('[data-pane-photo]', m).hidden = mode !== 'photo';
    $('[data-pane-text]', m).hidden = mode !== 'text';
  }));
  $('#st-file', m).addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      image = await resizeImage(f, 720, 0.72);
      const p = $('#st-preview', m);
      p.hidden = false;
      p.innerHTML = `<img src="${esc(image)}" alt="Story preview">`;
    } catch (err) { toast(err.message, 'error'); }
  });
  $$('.swatch', m).forEach((s) => s.addEventListener('click', () => {
    bg = BACKGROUNDS[Number(s.dataset.bg)];
    $('#st-text-preview', m).style.background = bg;
    $$('.swatch', m).forEach((x) => x.classList.toggle('active', x === s));
  }));
  $('#st-go', m).addEventListener('click', async () => {
    const text = $('#st-text', m).value.trim();
    const caption = $('#st-caption', m).value.trim();
    if (mode === 'photo' && !image) return toast('Choose a photo first.', 'error');
    if (mode === 'text' && !text) return toast('Type something for your story.', 'error');
    const btn = $('#st-go', m);
    btn.disabled = true;
    try {
      const imageUrl = mode === 'photo' ? await uploadImageToCloudinary(image) : '';
      await addDoc(collection(db, 'stories'), {
        uid: state.user.uid,
        authorName: state.profile.name,
        image: imageUrl,
        text: mode === 'text' ? text : '',
        bg: mode === 'text' ? bg : '',
        caption,
        audience: [state.user.uid, ...state.friends],
        createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + 24 * 3600 * 1000)
      });
      closeModal();
      toast('Story shared', 'success');
      done();
    } catch (e) { toast(errMsg(e), 'error'); btn.disabled = false; }
  });
}

// ------------------------------------------------------------------ viewer
function openViewer(list, startIndex, author, done) {
  let i = startIndex;
  let timer = null;
  const el = document.createElement('div');
  el.className = 'story-viewer';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Story viewer');
  document.body.appendChild(el);
  document.body.classList.add('modal-open');

  function close() {
    clearTimeout(timer);
    document.removeEventListener('keydown', onKey);
    el.remove();
    document.body.classList.remove('modal-open');
    done();
  }
  function onKey(e) {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') next();
    else if (e.key === 'ArrowLeft') prev();
  }
  function next() { if (i < list.length - 1) { i++; show(); } else close(); }
  function prev() { if (i > 0) { i--; show(); } else show(); }

  function show() {
    clearTimeout(timer);
    const s = list[i];
    markViewed(s.id);
    const mine = s.uid === state.user.uid;
    el.innerHTML = `
      <div class="story-frame" style="${s.image ? '' : `background:${esc(s.bg || BACKGROUNDS[0])}`}">
        <div class="story-bars">${list.map((_, k) => `<span class="${k < i ? 'done' : k === i ? 'run' : ''}"><i style="animation-duration:${DURATION}ms"></i></span>`).join('')}</div>
        <div class="story-top">
          ${avatarHtml(author.name, author.photo, 36)}
          <div><b>${esc(author.name)}</b><small>${timeAgo(s.createdAt)}</small></div>
          <span class="grow"></span>
          ${mine ? `<button class="icon-btn light" data-del aria-label="Delete story">${icon('trash')}</button>` : ''}
          <button class="icon-btn light" data-x aria-label="Close">${icon('x')}</button>
        </div>
        ${s.image ? `<img class="story-img" src="${esc(s.image)}" alt="Story">` : `<div class="story-text">${esc(s.text)}</div>`}
        ${s.caption ? `<div class="story-caption">${esc(s.caption)}</div>` : ''}
        <button class="story-nav left" data-prev aria-label="Previous"></button>
        <button class="story-nav right" data-next aria-label="Next"></button>
      </div>`;
    $('[data-x]', el).addEventListener('click', close);
    $('[data-prev]', el).addEventListener('click', prev);
    $('[data-next]', el).addEventListener('click', next);
    const del = $('[data-del]', el);
    if (del) del.addEventListener('click', async () => {
      clearTimeout(timer);
      try {
        await deleteDoc(doc(db, 'stories', s.id));
        toast('Story deleted', 'success');
        list.splice(i, 1);
        if (!list.length) return close();
        i = Math.min(i, list.length - 1);
        show();
      } catch (e) { toast(errMsg(e), 'error'); }
    });
    timer = setTimeout(next, DURATION);
  }

  document.addEventListener('keydown', onKey);
  show();
}
