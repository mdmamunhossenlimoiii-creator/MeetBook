// Private and group messaging (Firestore realtime).
import {
  db, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, collection, query, orderBy, limit, onSnapshot, serverTimestamp
} from './firebase.js';
import { state, subscribe, onCleanup, navigate } from './state.js';
import {
  $, $$, esc, linkify, avatarHtml, getUser, prefetchUsers, toast, modal, closeModal, resizeImage, errMsg,
  pairId, timeAgo, tsMs, emptyState, errorBox, confirmBox
} from './utils.js';
import { icon } from './icons.js';

export async function render(view, a, b) {
  const me = state.user.uid;
  view.innerHTML = `<div class="chat-layout card">
    <aside class="chat-list" data-list></aside>
    <section class="chat-pane" data-pane></section></div>`;
  const layout = $('.chat-layout', view);
  const listEl = $('[data-list]', view);
  const pane = $('[data-pane]', view);
  let activeId = null;
  let paneUnsub = null;
  let listToken = 0;

  // ---------------------------------------------------------- list
  async function drawList() {
    const token = ++listToken;
    const chats = state.chats || [];
    const others = chats.filter((c) => c.type === 'private').map((c) => c.members.find((m) => m !== me));
    const users = await prefetchUsers(others);
    if (token !== listToken) return;
    listEl.innerHTML = `
      <div class="chat-list-head"><h3>Chats</h3><button class="btn btn-primary" data-new-group>${icon('plus', 16)}Group</button></div>
      ${chats.length ? chats.map((c) => {
        const other = c.type === 'private' ? users[c.members.find((m) => m !== me)] : null;
        const title = c.type === 'group' ? c.name : (other ? other.name : 'Chat');
        const unread = c.lastMessage && c.lastMessage.uid !== me && (!c.lastRead || !c.lastRead[me] || tsMs(c.lastAt) > tsMs(c.lastRead[me]));
        const av = c.type === 'group'
          ? `<span class="avatar avatar-initial" style="width:48px;height:48px;background:var(--primary)">${icon('users', 22)}</span>`
          : avatarHtml(other?.name, other?.photo, 48);
        return `<a class="chat-item ${c.id === activeId ? 'active' : ''} ${unread ? 'unread' : ''}" href="#/messages/${esc(c.id)}">
          ${av}<div class="chat-item-info"><b>${esc(title)}</b>
          <small class="clamp">${c.lastMessage ? `${c.lastMessage.uid === me ? 'You: ' : ''}${esc(c.lastMessage.text)}` : 'No messages yet'}</small></div>
          ${unread ? '<span class="dot"></span>' : ''}</a>`;
      }).join('') : '<p class="muted pad">No conversations yet. Open a friend\'s profile and press Message, or create a group.</p>'}`;
    $('[data-new-group]', listEl).addEventListener('click', openGroupCreator);
  }
  onCleanup(subscribe(drawList));

  // ---------------------------------------------------------- group creator
  async function openGroupCreator() {
    const friends = await Promise.all([...state.friends].map(getUser));
    const m = modal(`<h3>New group chat</h3>
      <div class="field"><label for="gc-name">Group name</label><input id="gc-name" maxlength="60"></div>
      <div class="field"><label>Add friends</label>
      <div class="pick-list">${friends.length ? friends.map((f) => `<label class="pick"><input type="checkbox" value="${esc(f.uid)}">${avatarHtml(f.name, f.photo, 28)}<span>${esc(f.name)}</span></label>`).join('') : '<span class="muted">You need friends first.</span>'}</div></div>
      <div class="row end gap"><button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="gc-go">Create</button></div>`);
    $('#gc-go', m).addEventListener('click', async () => {
      const name = $('#gc-name', m).value.trim();
      const picked = $$('input[type=checkbox]:checked', m).map((i) => i.value);
      if (name.length < 2) return toast('Give the group a name.', 'error');
      if (!picked.length) return toast('Pick at least one friend.', 'error');
      $('#gc-go', m).disabled = true;
      try {
        const ref = doc(collection(db, 'chats'));
        await setDoc(ref, {
          type: 'group', name, members: [me, ...picked], createdBy: me,
          lastMessage: null, lastAt: serverTimestamp(), lastRead: {}, createdAt: serverTimestamp()
        });
        closeModal();
        navigate(`/messages/${ref.id}`);
      } catch (e) { toast(errMsg(e), 'error'); $('#gc-go', m).disabled = false; }
    });
  }

  // ---------------------------------------------------------- conversation
  async function openChat({ id, chat, otherUid }) {
    activeId = id;
    layout.classList.add('has-active');
    drawList();
    if (paneUnsub) { paneUnsub(); paneUnsub = null; }

    const isGroup = chat && chat.type === 'group';
    const other = otherUid ? await getUser(otherUid) : null;
    const title = isGroup ? chat.name : other?.name || 'Chat';
    let exists = !!chat;
    let size = 40;

    pane.innerHTML = `
      <header class="chat-head">
        <a class="icon-btn back-btn" href="#/messages" aria-label="Back to chats">${icon('arrowLeft')}</a>
        ${isGroup ? `<span class="avatar avatar-initial" style="width:40px;height:40px;background:var(--primary)">${icon('users', 20)}</span>` : `<a href="#/profile/${esc(otherUid)}">${avatarHtml(other?.name, other?.photo, 40)}</a>`}
        <div><b>${esc(title)}</b>${isGroup ? `<small class="muted">${chat.members.length} members</small>` : ''}</div>
      </header>
      ${other?.isBot ? '<div class="notice small">You are chatting with an <b>AI bot</b>. Its replies are automatic, template-based and can take a few minutes. It is not a person and can make mistakes.</div>' : ''}
      <div class="chat-messages" data-msgs><div class="loading">Loading…</div></div>
      <form class="chat-form" data-form>
        <label class="icon-btn" title="Send a photo">${icon('image')}<input type="file" accept="image/*" hidden data-photo></label>
        <input type="text" maxlength="4000" placeholder="Aa" aria-label="Message" autocomplete="off" data-text>
        <button class="icon-btn primary" type="submit" aria-label="Send">${icon('send')}</button>
      </form>
      <div class="chat-preview" data-preview hidden></div>`;

    const msgsEl = $('[data-msgs]', pane);
    let image = '';
    let lastMarked = 0;

    async function markRead(c) {
      if (!c || !c.lastMessage || c.lastMessage.uid === me) return;
      const lr = c.lastRead && c.lastRead[me];
      if (lr && tsMs(lr) >= tsMs(c.lastAt)) return;
      if (Date.now() - lastMarked < 1500) return;
      lastMarked = Date.now();
      try { await updateDoc(doc(db, 'chats', id), { [`lastRead.${me}`]: serverTimestamp() }); } catch { /* not critical */ }
    }

    function subscribeMessages() {
      if (paneUnsub) paneUnsub();
      const q = query(collection(db, 'chats', id, 'messages'), orderBy('createdAt', 'desc'), limit(size));
      paneUnsub = onSnapshot(q, async (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() })).reverse();
        const users = isGroup ? await prefetchUsers(items.map((i) => i.uid)) : {};
        const nearBottom = msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < 120;
        msgsEl.innerHTML = `${snap.size >= size ? '<button class="link-btn center" data-older>Load older messages</button>' : ''}
          ${items.length ? items.map((m) => {
            const mine = m.uid === me;
            return `<div class="msg ${mine ? 'mine' : ''}" data-mid="${esc(m.id)}">
              ${!mine && isGroup ? `<small class="muted">${esc(users[m.uid]?.name || '')}</small>` : ''}
              <div class="msg-bubble">${m.image ? `<img src="${esc(m.image)}" alt="Photo" loading="lazy">` : ''}${m.text ? `<div>${linkify(m.text)}</div>` : ''}</div>
              <small class="muted msg-time">${timeAgo(m.createdAt)}${mine ? ' · <button class="link-btn" data-del>Unsend</button>' : ''}</small></div>`;
          }).join('') : '<div class="muted center pad">Say hello 👋</div>'}`;
        if (nearBottom) msgsEl.scrollTop = msgsEl.scrollHeight;
        const c = (state.chats || []).find((x) => x.id === id);
        markRead(c);
      }, (err) => { msgsEl.innerHTML = errorBox(err); });
    }
    if (exists) subscribeMessages();
    else msgsEl.innerHTML = '<div class="muted center pad">Say hello 👋</div>';

    msgsEl.addEventListener('click', async (e) => {
      if (e.target.closest('[data-older]')) { size += 40; subscribeMessages(); return; }
      const del = e.target.closest('[data-del]');
      if (!del) return;
      if (!(await confirmBox('Unsend this message?', 'Unsend'))) return;
      try { await deleteDoc(doc(db, 'chats', id, 'messages', del.closest('.msg').dataset.mid)); } catch (err) { toast(errMsg(err), 'error'); }
    });

    const preview = $('[data-preview]', pane);
    $('[data-photo]', pane).addEventListener('change', async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      try {
        image = await resizeImage(f, 700, 0.7);
        preview.hidden = false;
        preview.innerHTML = `<img src="${esc(image)}" alt="Selected"><button class="icon-btn" data-rm aria-label="Remove photo">${icon('x')}</button>`;
      } catch (err) { toast(err.message, 'error'); }
    });
    preview.addEventListener('click', (e) => { if (e.target.closest('[data-rm]')) { image = ''; preview.hidden = true; preview.innerHTML = ''; } });

    $('[data-form]', pane).addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = $('[data-text]', pane);
      const text = input.value.trim();
      if (!text && !image) return;
      input.disabled = true;
      try {
        if (!exists) {
          await setDoc(doc(db, 'chats', id), {
            type: 'private', members: [me, otherUid].sort(), createdBy: me,
            lastMessage: null, lastAt: serverTimestamp(), lastRead: {}, createdAt: serverTimestamp()
          });
          exists = true;
          subscribeMessages();
        }
        await addDoc(collection(db, 'chats', id, 'messages'), { uid: me, text, image, createdAt: serverTimestamp() });
        // a bot has no browser: the scheduled bot job answers from this inbox
        if (other?.isBot && text) {
          await addDoc(collection(db, 'botInbox'), { fromUid: me, botId: otherUid, chatId: id, text: text.slice(0, 500), handled: false, createdAt: serverTimestamp() });
        }
        await updateDoc(doc(db, 'chats', id), {
          lastMessage: { text: (text || '📷 Photo').slice(0, 120), uid: me },
          lastAt: serverTimestamp(),
          [`lastRead.${me}`]: serverTimestamp()
        });
        input.value = '';
        image = ''; preview.hidden = true; preview.innerHTML = '';
      } catch (err) { toast(errMsg(err), 'error'); }
      input.disabled = false;
      input.focus();
    });
  }

  onCleanup(() => { if (paneUnsub) paneUnsub(); });

  // ---------------------------------------------------------- routing inside the page
  drawList();
  if (a === 'with' && b) {
    if (b === me) { navigate('/messages'); return; }
    const other = await getUser(b);
    if (other.isBot && (other.chatEnabled === false || other.active === false || state.site.botsEnabled === false)) {
      toast(`${other.name} is not chatting right now.`, 'info', 5000);
      navigate(`/profile/${b}`);
      return;
    }
    if ((other.settings?.allowMessages || 'everyone') === 'friends' && !state.friends.has(b)) {
      toast(`${other.name} only accepts messages from friends.`, 'error', 6000);
      navigate(`/profile/${b}`);
      return;
    }
    const id = pairId(me, b);
    const snap = await getDoc(doc(db, 'chats', id));
    await openChat({ id, chat: snap.exists() ? { id, ...snap.data() } : null, otherUid: b });
  } else if (a) {
    const snap = await getDoc(doc(db, 'chats', a));
    if (!snap.exists()) { pane.innerHTML = emptyState('Conversation not found'); return; }
    const chat = { id: a, ...snap.data() };
    if (!chat.members.includes(me)) { pane.innerHTML = emptyState('You are not part of this conversation'); return; }
    await openChat({ id: a, chat, otherUid: chat.type === 'private' ? chat.members.find((m) => m !== me) : null });
  } else {
    pane.innerHTML = `<div class="empty">${icon('message', 48)}<h3>Select a conversation</h3><p>Or start one from a friend's profile.</p></div>`;
  }
}
