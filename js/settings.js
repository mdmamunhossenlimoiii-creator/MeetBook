// Settings: appearance, privacy, account.
import { auth, db, doc, updateDoc, sendPasswordResetEmail, signOut } from './firebase.js';
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
    <div class="field"><label for="st-msg">Who can start a chat with me</label>
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
    <p class="muted small">Post, story, and chat access are checked by database rules. The profile choice only hides posts on your profile page in this app; profile details remain visible to signed-in users, and public posts can still appear in feeds.</p>
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
      await updateDoc(doc(db, 'users', state.user.uid), {
        settings: {
          ...s,
          profileVisibility: $('#st-profile', view).value,
          allowMessages: $('#st-msg', view).value,
          defaultVisibility: $('#st-vis', view).value,
          allowBotEngagement: $('#st-bots', view).value === 'on'
        }
      });
      toast('Settings saved', 'success');
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
