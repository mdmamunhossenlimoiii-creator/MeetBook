// Settings: appearance, privacy, account.
import { auth, db, doc, collection, query, where, getDocs, writeBatch, serverTimestamp, sendPasswordResetEmail, signOut } from './firebase.js';
import { state } from './state.js';
import { $, esc, toast, errMsg } from './utils.js';
import { getThemePref, setThemePref } from './theme.js';
import { DEFAULT_SETTINGS } from './auth.js';
import { icon } from './icons.js';

export async function render(view) {
  const s = { ...DEFAULT_SETTINGS, ...(state.profile.settings || {}) };
  const theme = getThemePref();
  view.innerHTML = `
  <h2 class="page-title">Settings &amp; privacy</h2>

  <section class="card pad">
    <h3>Appearance</h3>
    <div class="field"><label for="st-theme">Theme</label>
      <select id="st-theme">
        <option value="system" ${theme === 'system' ? 'selected' : ''}>Match my device</option>
        <option value="light" ${theme === 'light' ? 'selected' : ''}>Light</option>
        <option value="dark" ${theme === 'dark' ? 'selected' : ''}>Dark</option>
      </select></div>
  </section>

  <section class="card pad">
    <h3>Privacy</h3>
    <div class="field"><label for="st-profile">Who can see my posts on my profile</label>
      <select id="st-profile">
        <option value="everyone" ${s.profileVisibility === 'everyone' ? 'selected' : ''}>Everyone</option>
        <option value="friends" ${s.profileVisibility === 'friends' ? 'selected' : ''}>Friends only</option></select></div>
    <div class="field"><label for="st-msg">Who can start a private chat with me</label>
      <select id="st-msg">
        <option value="everyone" ${s.allowMessages === 'everyone' ? 'selected' : ''}>Everyone</option>
        <option value="friends" ${s.allowMessages === 'friends' ? 'selected' : ''}>Friends only</option></select></div>
    <div class="field"><label for="st-vis">Default audience for new posts</label>
      <select id="st-vis">
        <option value="public" ${s.defaultVisibility === 'public' ? 'selected' : ''}>Public</option>
        <option value="friends" ${s.defaultVisibility === 'friends' ? 'selected' : ''}>Friends</option>
        <option value="me" ${s.defaultVisibility === 'me' ? 'selected' : ''}>Only me</option></select></div>
    <div class="field"><label for="st-bots">AI bots on my posts</label>
      <select id="st-bots">
        <option value="off" ${s.allowBotEngagement ? '' : 'selected'}>Off: bots never react or comment on my posts</option>
        <option value="on" ${s.allowBotEngagement ? 'selected' : ''}>On: allow labelled AI bots to react and comment sometimes</option></select>
      <div class="muted small">Bot reactions and comments always show the "AI Bot" label and are counted separately from people.</div></div>
    <div class="field"><label for="st-memory">Long-term memory for AI bot chats</label>
      <select id="st-memory">
        <option value="off" ${s.allowBotMemory ? '' : 'selected'}>Off: do not save bot memories</option>
        <option value="on" ${s.allowBotMemory ? 'selected' : ''}>On: allow each of the first three bots to save a private summary for me</option>
      </select>
      <div class="muted small">Off by default. If enabled, each of the first three AI bots may save a short summary of non-sensitive preferences you explicitly share. Memories are separated by bot and user, are not raw chat transcripts, and can be cleared here. Avoid sharing sensitive information.</div>
    </div>
    <p class="muted small">Profile details (bio and cover information) are restricted by database rules when you choose Friends only. Your display name remains in the limited people directory so friends can find you. Public posts may still appear in feeds according to each post's own audience.</p>
    <button class="btn" id="st-clear-memory" type="button">Clear all saved bot memories</button>
    <button class="btn btn-primary" id="st-save">Save privacy settings</button>
  </section>

  <section class="card pad">
    <h3>Account</h3>
    <p>Signed in as <b>${esc(state.user.email || state.profile.name)}</b></p>
    <div class="row gap wrap">
      <a class="btn" href="#/profile/${esc(state.user.uid)}">${icon('user', 16)}Edit profile</a>
      <a class="btn" href="#/saved">${icon('bookmark', 16)}Saved posts</a>
      ${state.user.email ? '<button class="btn" id="st-reset">Send password reset email</button>' : ''}
      <button class="btn btn-danger" id="st-logout">${icon('logout', 16)}Log out</button>
    </div>
  </section>`;

  $('#st-theme', view).addEventListener('change', (e) => setThemePref(e.target.value));

  $('#st-save', view).addEventListener('click', async () => {
    const btn = $('#st-save', view);
    btn.disabled = true;
    try {
      const next = {
        ...s,
        profileVisibility: $('#st-profile', view).value,
        allowMessages: $('#st-msg', view).value,
        defaultVisibility: $('#st-vis', view).value,
        allowBotEngagement: $('#st-bots', view).value === 'on',
        allowBotMemory: $('#st-memory', view).value === 'on'
      };
      const batch = writeBatch(db);
      batch.update(doc(db, 'users', state.user.uid), { settings: next });
      batch.set(doc(db, 'publicProfiles', state.user.uid), { profileVisibility: next.profileVisibility }, { merge: true });
      batch.set(doc(db, 'botEngagement', state.user.uid), {
        allowBotEngagement: next.allowBotEngagement,
        allowBotMemory: next.allowBotMemory,
        updatedAt: serverTimestamp()
      }, { merge: true });
      // Turning memory off revokes Runner access and deletes the user's stored summaries.
      if (s.allowBotMemory === true && next.allowBotMemory === false) {
        const memories = await getDocs(query(collection(db, 'botMemories'), where('ownerUid', '==', state.user.uid)));
        memories.docs.forEach((memory) => batch.delete(memory.ref));
      }
      await batch.commit();
      toast('Settings saved', 'success');
    } catch (e) { toast(errMsg(e), 'error'); }
    btn.disabled = false;
  });

  $('#st-clear-memory', view).addEventListener('click', async () => {
    const btn = $('#st-clear-memory', view);
    btn.disabled = true;
    try {
      const memories = await getDocs(query(collection(db, 'botMemories'), where('ownerUid', '==', state.user.uid)));
      const batch = writeBatch(db);
      memories.docs.forEach((memory) => batch.delete(memory.ref));
      if (memories.size) await batch.commit();
      toast(`Cleared ${memories.size} saved bot memory record(s)`, 'success');
    } catch (e) { toast(errMsg(e), 'error'); }
    btn.disabled = false;
  });

  const reset = $('#st-reset', view);
  if (reset) reset.addEventListener('click', async () => {
    try { await sendPasswordResetEmail(auth, state.user.email); toast('Password reset email sent.', 'success'); }
    catch (e) { toast(errMsg(e), 'error'); }
  });
  $('#st-logout', view).addEventListener('click', () => signOut(auth));
}
