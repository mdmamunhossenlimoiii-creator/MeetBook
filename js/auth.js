// Sign in / sign up / password reset screens and profile bootstrap.
import {
  auth, db, doc, getDoc, setDoc, serverTimestamp,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail,
  updateProfile, GoogleAuthProvider, signInWithPopup
} from './firebase.js';
import { esc, $, toast } from './utils.js';

export const DEFAULT_SETTINGS = {
  profileVisibility: 'everyone', // everyone | friends
  allowMessages: 'everyone',     // everyone | friends
  defaultVisibility: 'public',   // public | friends | me
  allowBotEngagement: false      // true = AI bots may react / comment on my posts (always labelled AI)
};

// Name typed in the sign-up form; read by ensureProfile because Firebase signs the user in
// (and fires onAuthStateChanged) before the sign-up handler has finished.
const reg = { name: null };
const inflight = new Map();

export function ensureProfile(user, fallbackName) {
  if (!inflight.has(user.uid)) {
    const p = createProfileIfMissing(user, fallbackName).finally(() => setTimeout(() => inflight.delete(user.uid), 5000));
    inflight.set(user.uid, p);
  }
  return inflight.get(user.uid);
}

function publicProfileData(data) {
  return {
    name: data.name || 'Unknown user',
    nameLower: String(data.name || '').toLowerCase(),
    bio: String(data.bio || '').slice(0, 500),
    photo: data.photo || '',
    cover: data.cover || '',
    isBot: data.isBot === true,
    roleEmoji: data.roleEmoji || '',
    verified: data.verified === true,
    profileVisibility: data.settings?.profileVisibility === 'friends' ? 'friends' : 'everyone',
    createdAt: data.createdAt || serverTimestamp()
  };
}

async function ensureProfileProjections(uid, data) {
  await Promise.all([
    setDoc(doc(db, 'publicProfiles', uid), publicProfileData(data), { merge: true }),
    setDoc(doc(db, 'botEngagement', uid), {
      allowBotEngagement: data.settings?.allowBotEngagement === true,
      updatedAt: serverTimestamp()
    }, { merge: true })
  ]);
}

async function createProfileIfMissing(user, fallbackName) {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const existing = snap.data();
    await ensureProfileProjections(user.uid, existing);
    return existing;
  }
  const name = (fallbackName || reg.name || user.displayName || (user.email || 'User').split('@')[0]).trim().slice(0, 60);
  const data = {
    name: name.length >= 2 ? name : `${name} User`,
    nameLower: '',
    bio: '',
    photo: '',
    cover: '',
    banned: false,
    createdAt: serverTimestamp(),
    settings: { ...DEFAULT_SETTINGS }
  };
  data.nameLower = data.name.toLowerCase();
  await setDoc(ref, data);
  await ensureProfileProjections(user.uid, data);
  return data;
}

function friendlyAuthError(e) {
  const map = {
    'auth/invalid-credential': 'Wrong email or password.',
    'auth/wrong-password': 'Wrong email or password.',
    'auth/user-not-found': 'No account found with this email.',
    'auth/email-already-in-use': 'An account with this email already exists.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/too-many-requests': 'Too many attempts. Please try again later.',
    'auth/popup-closed-by-user': 'Sign-in was cancelled.',
    'auth/operation-not-allowed': 'This sign-in method is not enabled in Firebase Authentication.',
    'auth/network-request-failed': 'Network error. Check your connection.',
    'app/registration-closed': 'New sign-ups are closed right now. Please try again later.'
  };
  return map[e && e.code] || (e && e.message) || 'Something went wrong.';
}

export function renderAuth(root, { bannedMessage } = {}) {
  root.innerHTML = `
  <div class="auth-page">
    <div class="auth-hero">
      <h1 class="logo-big">MeetBook</h1>
      <p>Connect with friends, share moments and discover what is happening around you.</p>
    </div>
    <div class="card auth-card">
      ${bannedMessage ? `<div class="notice notice-error">${esc(bannedMessage)}</div>` : ''}
      <div class="tabs" role="tablist">
        <button class="tab active" data-mode="login" role="tab">Sign in</button>
        <button class="tab" data-mode="register" role="tab">Create account</button>
      </div>
      <form id="auth-form" novalidate>
        <div class="field" id="f-name" hidden>
          <label for="a-name">Full name</label>
          <input id="a-name" type="text" autocomplete="name" maxlength="60">
        </div>
        <div class="field">
          <label for="a-email">Email</label>
          <input id="a-email" type="email" autocomplete="email" required>
        </div>
        <div class="field" id="f-pass">
          <label for="a-pass">Password</label>
          <input id="a-pass" type="password" autocomplete="current-password" minlength="6" required>
        </div>
        <div class="notice notice-error" id="auth-error" hidden></div>
        <button class="btn btn-primary btn-block" id="auth-submit" type="submit">Sign in</button>
        <button class="link-btn" id="forgot" type="button">Forgot password?</button>
      </form>
      <div class="divider"><span>or</span></div>
      <button class="btn btn-block" id="google-btn" type="button">Continue with Google</button>
    </div>
  </div>`;

  let mode = 'login';
  const form = $('#auth-form', root);
  const errBox = $('#auth-error', root);
  const submit = $('#auth-submit', root);

  function setMode(m) {
    mode = m;
    root.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.mode === m));
    $('#f-name', root).hidden = m !== 'register';
    $('#a-pass', root).autocomplete = m === 'register' ? 'new-password' : 'current-password';
    submit.textContent = m === 'register' ? 'Create account' : 'Sign in';
    $('#forgot', root).hidden = m !== 'login';
    errBox.hidden = true;
  }
  root.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => setMode(t.dataset.mode)));

  function showError(msg) { errBox.textContent = msg; errBox.hidden = false; }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.hidden = true;
    const email = $('#a-email', root).value.trim();
    const pass = $('#a-pass', root).value;
    const name = $('#a-name', root).value.trim();
    if (!email || !pass) return showError('Please enter your email and password.');
    if (mode === 'register' && name.length < 2) return showError('Please enter your full name (at least 2 characters).');
    submit.disabled = true;
    try {
      if (mode === 'register') {
        // Admin can close sign-ups. Enforced by this interface only (Firebase Auth sign-up is client-side).
        const site = await getDoc(doc(db, 'settings', 'global')).then((s) => (s.exists() ? s.data() : {})).catch(() => ({}));
        if (site.registrationOpen === false) throw Object.assign(new Error('closed'), { code: 'app/registration-closed' });
        reg.name = name;
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        await updateProfile(cred.user, { displayName: name });
        await ensureProfile(cred.user, name);
      } else {
        await signInWithEmailAndPassword(auth, email, pass);
      }
      // onAuthStateChanged in app.js takes over from here.
    } catch (err) {
      showError(friendlyAuthError(err));
      submit.disabled = false;
    }
  });

  $('#forgot', root).addEventListener('click', async () => {
    const email = $('#a-email', root).value.trim();
    if (!email) return showError('Enter your email above first, then press "Forgot password?".');
    try {
      await sendPasswordResetEmail(auth, email);
      toast('Password reset email sent. Check your inbox.', 'success');
    } catch (err) {
      showError(friendlyAuthError(err));
    }
  });

  $('#google-btn', root).addEventListener('click', async () => {
    errBox.hidden = true;
    try {
      const cred = await signInWithPopup(auth, new GoogleAuthProvider());
      await ensureProfile(cred.user);
    } catch (err) {
      showError(friendlyAuthError(err));
    }
  });
}

export function renderSetupNeeded(root) {
  root.innerHTML = `
  <div class="auth-page">
    <div class="card auth-card setup">
      <h2>MeetBook setup needed</h2>
      <p>Firebase is not configured yet. Open <code>js/firebase-config.js</code> and fill in your Firebase web app settings
      (Firebase console → Project settings → Your apps → Web app).</p>
      <ol>
        <li>Enable <b>Authentication</b> → Email/Password (and Google if you want it).</li>
        <li>Create a <b>Cloud Firestore</b> database.</li>
        <li>Publish <code>firestore.rules</code> and create the indexes from <code>firestore.indexes.json</code>.</li>
        <li>Add your GitHub Pages domain under Authentication → Settings → Authorized domains.</li>
      </ol>
      <p>Full instructions are in <code>README.md</code>.</p>
    </div>
  </div>`;
}
