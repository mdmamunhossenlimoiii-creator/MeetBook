// Global settings: maintenance mode, sign-ups, global bot switches. Stored in settings/global (public read, admin write).
import { db, doc, getDoc, setDoc, serverTimestamp } from '../firebase.js';
import { state } from '../state.js';
import { $, esc, errorBox } from '../utils.js';
import { act, loading } from './common.js';

export async function render(body) {
  body.innerHTML = `<h2 class="page-title">Global settings</h2>${loading()}`;
  let s = {};
  try { const snap = await getDoc(doc(db, 'settings', 'global')); s = snap.exists() ? snap.data() : {}; } catch (e) { body.innerHTML = errorBox(e); return; }
  const on = (v, d) => (v === undefined ? d : v);
  body.innerHTML = `<h2 class="page-title">Global settings</h2>
  <section class="card pad"><h3>Maintenance mode</h3>
    <label class="row gap"><input type="checkbox" id="gs-maint" ${s.maintenance ? 'checked' : ''}> Turn maintenance mode ON (everyone except staff sees a "we'll be right back" page)</label>
    <div class="field"><label for="gs-msg">Message</label><input id="gs-msg" maxlength="300" value="${esc(s.maintenanceMessage || '')}" placeholder="MySocial is down for maintenance. Please try again soon."></div>
    <p class="muted small">Enforced by the app interface. It is a courtesy screen, not a security barrier: the database stays reachable for anyone who bypasses the website.</p></section>
  <section class="card pad"><h3>Sign-ups</h3>
    <label class="row gap"><input type="checkbox" id="gs-reg" ${on(s.registrationOpen, true) ? 'checked' : ''}> New accounts can be created</label>
    <p class="muted small">Enforced by the sign-up form only. Close it fully in Firebase Authentication settings if needed.</p></section>
  <section class="card pad"><h3>AI bots (global)</h3>
    <label class="row gap"><input type="checkbox" id="gs-bots" ${on(s.botsEnabled, true) ? 'checked' : ''}> AI bots are ON (master switch: when off, the scheduled job does nothing and bots stop chatting)</label>
    <label class="row gap"><input type="checkbox" id="gs-b2b" ${s.botToBotComments ? 'checked' : ''}> Let bots comment on other bots' posts (off by default: it can look like real popularity)</label></section>
  <button class="btn btn-primary" id="gs-save">Save settings</button>`;
  $('#gs-save', body).addEventListener('click', async (e) => {
    const data = {
      maintenance: $('#gs-maint', body).checked, maintenanceMessage: $('#gs-msg', body).value.trim().slice(0, 300),
      registrationOpen: $('#gs-reg', body).checked, botsEnabled: $('#gs-bots', body).checked, botToBotComments: $('#gs-b2b', body).checked,
      updatedBy: state.user.uid, updatedAt: serverTimestamp()
    };
    if (await act(e.target, () => setDoc(doc(db, 'settings', 'global'), data, { merge: true }), {
      ok: 'Settings saved', log: ['settings changed', 'settings/global', `maintenance=${data.maintenance} signups=${data.registrationOpen} bots=${data.botsEnabled} bot2bot=${data.botToBotComments}`]
    })) e.target.disabled = false;
  });
}
