// News feed, composer, post cards (reactions, comments, share, save, report) and single-post page.
import {
  db, collection, doc, getDoc, addDoc, updateDoc, deleteDoc, setDoc, query, where, orderBy, limit,
  onSnapshot, serverTimestamp, increment, deleteField
} from './firebase.js';
import { state, onCleanup, navigate } from './state.js';
import {
  $, $$, esc, linkify, timeAgo, fullDate, avatarHtml, prefetchUsers, getUser, toast, modal, closeModal,
  confirmBox, resizeImage, uploadImageToCloudinary, parseVideoUrl, videoHtml, notify, tsMs, errMsg, errorBox, emptyState, REACTIONS, botBadge
} from './utils.js';
import { icon } from './icons.js';
import { renderStories } from './stories.js';
import { isBotId } from './bots-data.js';

const PAGE = 20;

// ------------------------------------------------------------------ data
export async function createPost({ text = '', image = '', videoUrl = '', visibility = 'public', groupId = null, groupPrivacy = null, sharedFrom = null }) {
  const uid = state.user.uid;
  if (image && image.startsWith('data:')) image = await uploadImageToCloudinary(image);
  let vis = visibility;
  let audience = [];
  if (groupId) {
    vis = groupPrivacy === 'private' ? 'group' : 'public';
  } else if (vis === 'friends') {
    audience = [uid, ...state.friends];
  } else if (vis === 'me') {
    audience = [uid];
  }
  const data = {
    uid,
    authorName: state.profile.name,
    text: text.trim(),
    image: image || '',
    videoUrl: videoUrl || '',
    visibility: vis,
    audience,
    groupId: groupId || null,
    sharedFrom: sharedFrom || null,
    reactions: {},
    commentCount: 0,
    shareCount: 0,
    createdAt: serverTimestamp()
  };
  return addDoc(collection(db, 'posts'), data);
}

export async function setReaction(post, type) {
  const uid = state.user.uid;
  const ref = doc(db, 'posts', post.id);
  const current = post.reactions && post.reactions[uid];
  if (current === type) {
    await updateDoc(ref, { [`reactions.${uid}`]: deleteField() });
    delete post.reactions[uid];
  } else {
    await updateDoc(ref, { [`reactions.${uid}`]: type });
    post.reactions = { ...(post.reactions || {}), [uid]: type };
    if (!current) notify(post.uid, 'reaction', { postId: post.id, extra: type });
  }
}

export async function toggleSave(postId) {
  const ref = doc(db, 'users', state.user.uid, 'saved', postId);
  if (state.saved.has(postId)) await deleteDoc(ref);
  else await setDoc(ref, { createdAt: serverTimestamp() });
}

export async function reportContent(kind, target, reason, details) {
  await addDoc(collection(db, 'reports'), {
    kind, targetId: target.id, targetUid: target.uid || null,
    postId: target.postId || null,
    reason, details: details.slice(0, 1000),
    reporterUid: state.user.uid, status: 'open', createdAt: serverTimestamp()
  });
}

// ------------------------------------------------------------------ rendering
function reactionSummary(post) {
  // Reactions from AI bots are shown separately and never counted as people's reactions.
  const entries = Object.entries(post.reactions || {});
  const vals = entries.filter(([k]) => !isBotId(k)).map(([, t]) => t);
  const bots = entries.length - vals.length;
  let out = '';
  if (vals.length) {
    const counts = {};
    vals.forEach((t) => { counts[t] = (counts[t] || 0) + 1; });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => REACTIONS[t]?.emoji || '').join('');
    out += `<span class="react-summary">${top} ${vals.length}</span>`;
  }
  if (bots) out += ` <span class="react-summary ai" title="Reactions from labelled AI bots. Not counted as people.">🤖 ${bots} AI</span>`;
  return out;
}

function mediaHtml(post) {
  let out = '';
  if (post.image) out += `<img class="post-image" src="${esc(post.image)}" alt="Post image" loading="lazy">`;
  if (post.videoUrl) out += `<div class="post-video">${videoHtml(post.videoUrl)}</div>`;
  return out;
}

export function postHtml(post, users, { detail = false } = {}) {
  // Hidden by staff: only staff still see it (this is applied by the interface, see README).
  if (post.hidden && !state.isAdmin) return '';
  const author = users[post.uid] || { name: post.authorName };
  const uid = state.user.uid;
  const mine = post.uid === uid;
  const my = post.reactions && post.reactions[uid];
  const visIcon = post.groupId ? 'grid' : post.visibility === 'public' ? 'globe' : 'lock';
  const visLabel = post.groupId ? 'Group' : post.visibility === 'public' ? 'Public' : post.visibility === 'friends' ? 'Friends' : 'Only me';
  const sf = post.sharedFrom;
  return `
  <article class="card post" data-id="${esc(post.id)}">
    <header class="post-head">
      <a href="#/profile/${esc(post.uid)}">${avatarHtml(author.name, author.photo, 40)}</a>
      <div class="post-meta">
        <a class="author" href="#/profile/${esc(post.uid)}">${esc(author.name)}</a>${botBadge(author)}${post.hidden ? ' <span class="tag danger" title="Hidden from everyone except staff">Hidden</span>' : ''}
        <a class="muted small" href="#/post/${esc(post.id)}" title="${esc(fullDate(post.createdAt))}">${timeAgo(post.createdAt)}</a>
        <span class="muted small" title="${visLabel}">${icon(visIcon, 12)}</span>
      </div>
      <div class="post-menu-wrap">
        <button class="icon-btn" data-act="menu" aria-label="Post options">${icon('more')}</button>
        <div class="menu menu-small" data-menu hidden>
          <button class="menu-item" data-act="save">${icon('bookmark')}<span>${state.saved.has(post.id) ? 'Unsave post' : 'Save post'}</span></button>
          <button class="menu-item" data-act="copy">${icon('share')}<span>Copy link</span></button>
          ${mine ? '' : `<button class="menu-item" data-act="report">${icon('flag')}<span>Report post</span></button>`}
          ${mine || state.isAdmin ? `<button class="menu-item danger" data-act="delete">${icon('trash')}<span>Delete post</span></button>` : ''}
        </div>
      </div>
    </header>
    ${post.text ? `<div class="post-text${post.text.length < 90 && !post.image && !post.videoUrl && !sf ? ' big' : ''}">${linkify(post.text)}</div>` : ''}
    ${sf ? `<div class="shared"><a class="author" href="#/profile/${esc(sf.uid)}">${esc(sf.authorName)}</a>
      <div class="post-text">${linkify(sf.text || '')}</div>
      <a class="small" href="#/post/${esc(sf.postId)}">View original post</a></div>` : ''}
    ${mediaHtml(post)}
    <div class="post-stats small muted">
      <span data-role="reactions">${reactionSummary(post)}</span>
      <span class="grow"></span>
      <button class="link-btn muted" data-act="comments">${post.commentCount || 0} comments</button>
      <span data-role="shares">${post.shareCount || 0} shares</span>
    </div>
    <div class="post-actions">
      <div class="react-wrap">
        <button class="act ${my ? 'active' : ''}" data-act="like">${my ? `<span class="emoji">${REACTIONS[my]?.emoji || '👍'}</span>${REACTIONS[my]?.label || 'Like'}` : `${icon('like')}Like`}</button>
        <button class="act narrow" data-act="picker" aria-label="Choose a reaction">${icon('smile')}</button>
        <div class="reaction-picker" data-picker hidden>
          ${Object.entries(REACTIONS).map(([k, v]) => `<button data-react="${k}" title="${v.label}">${v.emoji}</button>`).join('')}
        </div>
      </div>
      <button class="act" data-act="comments">${icon('comment')}Comment</button>
      <button class="act" data-act="share">${icon('share')}Share</button>
    </div>
    <section class="comments" data-comments hidden></section>
  </article>`;
}

// Update a card in place (keeps open comment boxes and pickers alive).
function updateCard(card, post) {
  const my = post.reactions && post.reactions[state.user.uid];
  const likeBtn = $('[data-act="like"]', card);
  likeBtn.classList.toggle('active', !!my);
  likeBtn.innerHTML = my ? `<span class="emoji">${REACTIONS[my]?.emoji || '👍'}</span>${REACTIONS[my]?.label || 'Like'}` : `${icon('like')}Like`;
  $('[data-role="reactions"]', card).innerHTML = reactionSummary(post);
  $('.post-stats [data-act="comments"]', card).textContent = `${post.commentCount || 0} comments`;
  $('[data-role="shares"]', card).textContent = `${post.shareCount || 0} shares`;
}

// Attach delegated handlers once on a container that holds post cards.
export function bindPostEvents(container, getPost) {
  container.addEventListener('click', async (e) => {
    const card = e.target.closest('.post');
    if (!card) return;
    const post = getPost(card.dataset.id);
    if (!post) return;

    const reactBtn = e.target.closest('[data-react]');
    const actBtn = e.target.closest('[data-act]');

    if (!e.target.closest('.react-wrap')) $$('[data-picker]', card).forEach((p) => { p.hidden = true; });
    if (!e.target.closest('.post-menu-wrap')) $$('[data-menu]', card).forEach((m) => { m.hidden = true; });

    try {
      if (reactBtn) {
        await setReaction(post, reactBtn.dataset.react);
        $('[data-picker]', card).hidden = true;
        updateCard(card, post);
        return;
      }
      if (!actBtn) return;
      switch (actBtn.dataset.act) {
        case 'like':
          await setReaction(post, 'like'); updateCard(card, post); break;
        case 'picker': {
          const p = $('[data-picker]', card); p.hidden = !p.hidden; break;
        }
        case 'menu': {
          const m = $('[data-menu]', card); m.hidden = !m.hidden; break;
        }
        case 'save':
          $('[data-menu]', card).hidden = true;
          await toggleSave(post.id);
          toast(state.saved.has(post.id) ? 'Post saved' : 'Removed from saved', 'success');
          break;
        case 'copy':
          $('[data-menu]', card).hidden = true;
          await copyText(`${location.origin}${location.pathname}#/post/${post.id}`);
          toast('Link copied', 'success');
          break;
        case 'report': $('[data-menu]', card).hidden = true; openReport('post', post); break;
        case 'delete': {
          $('[data-menu]', card).hidden = true;
          if (await confirmBox('Delete this post permanently?', 'Delete')) {
            await deleteDoc(doc(db, 'posts', post.id));
            card.remove();
            toast('Post deleted', 'success');
          }
          break;
        }
        case 'comments': toggleComments(card, post); break;
        case 'share': openShare(post); break;
        default: break;
      }
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  });
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); } catch {
    const t = document.createElement('textarea');
    t.value = text; document.body.appendChild(t); t.select();
    document.execCommand('copy'); t.remove();
  }
}

// ------------------------------------------------------------------ comments
function commentHtml(c, post, users) {
  const a = users[c.uid] || { name: c.authorName };
  const can = c.uid === state.user.uid || post.uid === state.user.uid || state.isAdmin;
  return `<div class="comment" data-cid="${esc(c.id)}" data-uid="${esc(c.uid)}">
    <a href="#/profile/${esc(c.uid)}">${avatarHtml(a.name, a.photo, 32)}</a>
    <div class="bubble"><a class="author" href="#/profile/${esc(c.uid)}">${esc(a.name)}</a>${botBadge(a)}<div>${linkify(c.text)}</div>
      <div class="small muted">${timeAgo(c.createdAt)}${c.uid !== state.user.uid ? ` · <button class="link-btn" data-report-comment>Report</button>` : ''}${can ? ` · <button class="link-btn danger-text" data-del-comment>Delete</button>` : ''}</div></div>
  </div>`;
}

function toggleComments(card, post) {
  const box = $('[data-comments]', card);
  if (!box.hidden) { box.hidden = true; if (box._unsub) { box._unsub(); box._unsub = null; } return; }
  box.hidden = false;
  box.innerHTML = `<div class="comment-list" data-list><div class="muted small">Loading comments…</div></div>
    ${post.commentsDisabled ? '<div class="muted small comments-off">Comments are turned off for this post.</div>' : `<form class="comment-form" data-form>
      ${avatarHtml(state.profile.name, state.profile.photo, 32)}
      <input type="text" maxlength="2000" placeholder="Write a comment…" aria-label="Write a comment" required>
      <button class="icon-btn primary" type="submit" aria-label="Send comment">${icon('send')}</button>
    </form>`}`;
  const list = $('[data-list]', box);
  const q = query(collection(db, 'posts', post.id, 'comments'), orderBy('createdAt', 'asc'), limit(100));
  const unsub = onSnapshot(q, async (snap) => {
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const users = await prefetchUsers(items.map((c) => c.uid));
    list.innerHTML = items.length ? items.map((c) => commentHtml(c, post, users)).join('') : '<div class="muted small">No comments yet. Be the first.</div>';
    const countBtn = $('[data-act="comments"]', card);
    if (countBtn && countBtn.classList.contains('link-btn')) countBtn.textContent = `${items.length} comments`;
  }, (err) => { list.innerHTML = errorBox(err); });
  box._unsub = unsub;
  onCleanup(unsub);

  const form = $('[data-form]', box);
  if (form) form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = e.target.querySelector('input');
    const text = input.value.trim();
    if (!text) return;
    input.disabled = true;
    try {
      await addDoc(collection(db, 'posts', post.id, 'comments'), {
        uid: state.user.uid, authorName: state.profile.name, text, createdAt: serverTimestamp()
      });
      await updateDoc(doc(db, 'posts', post.id), { commentCount: increment(1) });
      post.commentCount = (post.commentCount || 0) + 1;
      input.value = '';
      notify(post.uid, 'comment', { postId: post.id });
    } catch (err) { toast(errMsg(err), 'error'); }
    input.disabled = false;
    input.focus();
  });

  list.addEventListener('click', async (e) => {
    const rep = e.target.closest('[data-report-comment]');
    if (rep) { const c = rep.closest('.comment'); openReport('comment', { id: c.dataset.cid, uid: c.dataset.uid, postId: post.id }); return; }
    const btn = e.target.closest('[data-del-comment]');
    if (!btn) return;
    const cid = btn.closest('.comment').dataset.cid;
    try {
      await deleteDoc(doc(db, 'posts', post.id, 'comments', cid));
      await updateDoc(doc(db, 'posts', post.id), { commentCount: increment(-1) });
      post.commentCount = Math.max(0, (post.commentCount || 1) - 1);
    } catch (err) { toast(errMsg(err), 'error'); }
  });
}

// ------------------------------------------------------------------ share & report
function openShare(post) {
  const m = modal(`<h3>Share post</h3>
    <textarea id="share-text" rows="3" maxlength="1000" placeholder="Say something about this…"></textarea>
    <div class="field"><label for="share-vis">Who can see it</label>
      <select id="share-vis"><option value="public">Public</option><option value="friends">Friends</option><option value="me">Only me</option></select></div>
    <div class="row end gap">
      <button class="btn" id="share-copy">Copy link</button>
      <button class="btn btn-primary" id="share-go">Share now</button>
    </div>`);
  $('#share-vis', m).value = state.profile?.settings?.defaultVisibility || 'public';
  $('#share-copy', m).addEventListener('click', async () => {
    await copyText(`${location.origin}${location.pathname}#/post/${post.id}`);
    toast('Link copied', 'success');
  });
  $('#share-go', m).addEventListener('click', async () => {
    const btn = $('#share-go', m);
    btn.disabled = true;
    try {
      if (post.visibility !== 'public') throw new Error('Only public posts can be shared to your feed.');
      await createPost({
        text: $('#share-text', m).value,
        visibility: $('#share-vis', m).value,
        sharedFrom: { postId: post.id, uid: post.uid, authorName: post.authorName, text: (post.text || '').slice(0, 400) }
      });
      await updateDoc(doc(db, 'posts', post.id), { shareCount: increment(1) });
      post.shareCount = (post.shareCount || 0) + 1;
      notify(post.uid, 'share', { postId: post.id });
      closeModal();
      toast('Shared to your feed', 'success');
    } catch (e) { toast(errMsg(e), 'error'); btn.disabled = false; }
  });
}

export function openReport(kind, target) {
  const m = modal(`<h3>Report ${kind}</h3>
    <div class="field"><label for="rp-reason">Reason</label>
      <select id="rp-reason">
        <option>Spam</option><option>Harassment or bullying</option><option>Hate speech</option>
        <option>Violence</option><option>Nudity or sexual content</option><option>False information</option><option>Other</option>
      </select></div>
    <div class="field"><label for="rp-details">Details (optional)</label><textarea id="rp-details" rows="3" maxlength="1000"></textarea></div>
    <div class="row end gap"><button class="btn" data-close>Cancel</button><button class="btn btn-danger" id="rp-go">Submit report</button></div>`);
  $('#rp-go', m).addEventListener('click', async () => {
    const btn = $('#rp-go', m);
    btn.disabled = true;
    try {
      await reportContent(kind, target, $('#rp-reason', m).value, $('#rp-details', m).value);
      closeModal();
      toast('Thanks. Our admins will review this report.', 'success');
    } catch (e) { toast(errMsg(e), 'error'); btn.disabled = false; }
  });
}

// ------------------------------------------------------------------ composer
export function composerHtml({ placeholder = `What's on your mind, ${state.profile?.name?.split(' ')[0] || ''}?`, showVisibility = true } = {}) {
  return `
  <form class="card composer" data-composer>
    <div class="composer-top">
      ${avatarHtml(state.profile.name, state.profile.photo, 40)}
      <textarea name="text" rows="2" maxlength="5000" placeholder="${esc(placeholder)}" aria-label="Create post"></textarea>
    </div>
    <div class="composer-preview" data-preview hidden></div>
    <div class="composer-video field" data-video-field hidden>
      <input type="url" name="video" placeholder="Paste a YouTube link or a direct .mp4 / .webm link" aria-label="Video link">
    </div>
    <div class="composer-bar">
      <label class="btn btn-ghost" title="Add photo">${icon('image')}<span>Photo</span>
        <input type="file" name="photo" accept="image/*" hidden></label>
      <button type="button" class="btn btn-ghost" data-toggle-video title="Add video link">${icon('video')}<span>Video link</span></button>
      ${showVisibility ? `<select name="visibility" aria-label="Who can see this post">
        <option value="public">Public</option><option value="friends">Friends</option><option value="me">Only me</option></select>` : ''}
      <span class="grow"></span>
      <button class="btn btn-primary" type="submit">Post</button>
    </div>
  </form>`;
}

export function bindComposer(form, { groupId = null, groupPrivacy = null, onPosted } = {}) {
  let image = '';
  const preview = $('[data-preview]', form);
  const vis = $('[name="visibility"]', form);
  if (vis) vis.value = state.profile?.settings?.defaultVisibility || 'public';

  function renderPreview() {
    if (!image) { preview.hidden = true; preview.innerHTML = ''; return; }
    preview.hidden = false;
    preview.innerHTML = `<img src="${esc(image)}" alt="Selected photo"><button type="button" class="icon-btn" data-remove-image aria-label="Remove photo">${icon('x')}</button>`;
  }
  preview.addEventListener('click', (e) => { if (e.target.closest('[data-remove-image]')) { image = ''; renderPreview(); } });

  $('[name="photo"]', form).addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try { image = await resizeImage(f, 900, 0.72); renderPreview(); } catch (err) { toast(err.message, 'error'); }
  });
  $('[data-toggle-video]', form).addEventListener('click', () => {
    const f = $('[data-video-field]', form);
    f.hidden = !f.hidden;
    if (!f.hidden) f.querySelector('input').focus();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = $('[name="text"]', form).value.trim();
    const video = $('[name="video"]', form).value.trim();
    if (video && !parseVideoUrl(video)) return toast('That video link is not supported. Use a YouTube link or a direct https .mp4/.webm link.', 'error', 6000);
    if (!text && !image && !video) return toast('Write something or add a photo or video first.', 'error');
    const btn = form.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      await createPost({ text, image, videoUrl: video, visibility: vis ? vis.value : 'public', groupId, groupPrivacy });
      form.reset();
      image = ''; renderPreview();
      $('[data-video-field]', form).hidden = true;
      if (vis) vis.value = state.profile?.settings?.defaultVisibility || 'public';
      toast('Posted', 'success');
      if (onPosted) onPosted();
    } catch (err) { toast(errMsg(err), 'error', 7000); }
    btn.disabled = false;
  });
}

// ------------------------------------------------------------------ feed
// Generic live post list. `queries` is a list of Firestore queries whose results are merged.
export function livePostList(container, makeQueries, { filter = null, empty = 'No posts yet.' } = {}) {
  let size = PAGE;
  const store = new Map(); // post id -> post, per query index
  const maps = [];
  let unsubs = [];
  let renderToken = 0;

  container.innerHTML = '<div data-posts></div><div class="center" data-more></div>';
  const list = $('[data-posts]', container);
  const more = $('[data-more]', container);
  const byId = (id) => store.get(id);
  bindPostEvents(container, byId);

  async function render() {
    const token = ++renderToken;
    let posts = [...new Map(maps.flatMap((m) => [...m.values()]).map((p) => [p.id, p])).values()];
    if (filter) posts = posts.filter(filter);
    if (!state.isAdmin) posts = posts.filter((p) => !p.hidden); // staff-hidden posts (UI-level; see README)
    posts.sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt));
    const visible = posts.slice(0, size);
    visible.forEach((p) => store.set(p.id, p));
    const users = await prefetchUsers(visible.map((p) => p.uid));
    if (token !== renderToken) return;
    // Patch the DOM instead of replacing it so open comment boxes survive live updates.
    const existing = new Map($$('.post', list).map((c) => [c.dataset.id, c]));
    if (!visible.length) {
      list.innerHTML = emptyState(empty);
    } else {
      $$('.empty', list).forEach((n) => n.remove());
      visible.forEach((p, i) => {
        let card = existing.get(p.id);
        if (card) {
          updateCard(card, p);
          existing.delete(p.id);
        } else {
          const tmp = document.createElement('div');
          tmp.innerHTML = postHtml(p, users);
          card = tmp.firstElementChild;
        }
        const ref = list.children[i] || null;
        if (ref !== card) list.insertBefore(card, ref);
      });
      existing.forEach((c) => {
        const box = $('[data-comments]', c);
        if (box && box._unsub) box._unsub();
        c.remove();
      });
    }
    more.innerHTML = posts.length > size || maps.some((m) => m.size >= size)
      ? `<button class="btn" data-more-btn>Load more</button>` : '';
  }

  function subscribeAll() {
    unsubs.forEach((u) => u());
    unsubs = [];
    const qs = makeQueries(size);
    qs.forEach((q, i) => {
      maps[i] = maps[i] || new Map();
      unsubs.push(onSnapshot(q, (snap) => {
        // Don't clobber the UI while the user is typing a comment.
        const m = new Map();
        snap.docs.forEach((d) => m.set(d.id, { id: d.id, ...d.data() }));
        maps[i] = m;
        render();
      }, (err) => { list.innerHTML = errorBox(err); }));
    });
  }

  more.addEventListener('click', (e) => {
    if (e.target.closest('[data-more-btn]')) { size += PAGE; subscribeAll(); }
  });

  subscribeAll();
  const stop = () => unsubs.forEach((u) => u());
  onCleanup(stop);
  return { refresh: render, stop };
}

export async function renderFeed(view) {
  const uid = state.user.uid;
  view.innerHTML = `
    <div data-stories></div>
    ${composerHtml()}
    <div class="tabs feed-tabs" role="tablist">
      <button class="tab active" data-scope="all">Everyone</button>
      <button class="tab" data-scope="mine">Friends &amp; following</button>
    </div>
    <div data-list></div>`;
  renderStories($('[data-stories]', view));
  bindComposer($('[data-composer]', view));

  let scope = 'all';
  const handle = livePostList($('[data-list]', view), (n) => [
    query(collection(db, 'posts'), where('visibility', '==', 'public'), orderBy('createdAt', 'desc'), limit(n)),
    query(collection(db, 'posts'), where('audience', 'array-contains', uid), orderBy('createdAt', 'desc'), limit(n))
  ], {
    filter: (p) => !p.groupId && (scope === 'all' || p.uid === uid || state.friends.has(p.uid) || state.following.has(p.uid)),
    empty: 'No posts yet. Add friends or write the first post!'
  });

  $$('.feed-tabs .tab', view).forEach((t) => t.addEventListener('click', () => {
    scope = t.dataset.scope;
    $$('.feed-tabs .tab', view).forEach((x) => x.classList.toggle('active', x === t));
    handle.refresh();
  }));
}

export async function renderSaved(view) {
  view.innerHTML = '<h2 class="page-title">Saved posts</h2><div data-list><div class="loading">Loading…</div></div>';
  const ids = [...state.saved];
  const list = $('[data-list]', view);
  if (!ids.length) { list.innerHTML = emptyState('Nothing saved yet', 'Use the ⋯ menu on a post to save it for later.'); return; }
  const snaps = await Promise.all(ids.slice(0, 50).map((id) => getDoc(doc(db, 'posts', id)).catch(() => null)));
  const posts = snaps.filter((s) => s && s.exists()).map((s) => ({ id: s.id, ...s.data() }));
  const users = await prefetchUsers(posts.map((p) => p.uid));
  const map = new Map(posts.map((p) => [p.id, p]));
  list.innerHTML = posts.length ? posts.map((p) => postHtml(p, users)).join('') : emptyState('Saved posts are no longer available');
  bindPostEvents(list, (id) => map.get(id));
}

export async function renderPostPage(view, id) {
  view.innerHTML = '<div class="loading">Loading…</div>';
  const snap = await getDoc(doc(db, 'posts', id)).catch((e) => { throw e; });
  if (!snap.exists() || (snap.data().hidden && !state.isAdmin)) { view.innerHTML = emptyState('This post is not available', 'It may have been deleted or you may not have permission to see it.'); return; }
  const post = { id: snap.id, ...snap.data() };
  const users = await prefetchUsers([post.uid]);
  view.innerHTML = `<a class="back" href="#/feed">${icon('arrowLeft')} Back to feed</a><div data-wrap>${postHtml(post, users, { detail: true })}</div>`;
  const wrap = $('[data-wrap]', view);
  bindPostEvents(wrap, () => post);
  toggleComments($('.post', wrap), post);
}

export { navigate, getUser };
