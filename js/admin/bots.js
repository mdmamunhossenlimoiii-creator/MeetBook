// AI Bots admin: global switches, create / edit / delete, per-bot controls and activity logs, manual post / comment tools.
import { db, doc, getDoc, setDoc, collection, query, where, orderBy, limit, getDocs, serverTimestamp } from '../firebase.js';
import { state } from '../state.js';
import { $, $$, esc, avatarHtml, botBadge, errorBox, confirmBox, modal, closeModal, toast, errMsg, resizeImage, emptyState } from '../utils.js';
import { listBots, seedBots, createBot, saveBot, deleteBot, MAX_BOTS } from '../bots.js';
import { BOTS, ROLE_EMOJIS, botAvatar, botCover } from '../bots-data.js';
import { PERSONALITIES, LANGUAGES, TOPICS } from '../bots-brain.js';
import { act, loading, tagHtml, when, short } from './common.js';

const lines = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 30);

export async function render(body) {
  body.innerHTML = `<h2 class="page-title">AI Bots</h2>${loading()}`;
  let bots = [], site = {};
  const draw = async () => {
    try {
      [bots, site] = await Promise.all([listBots(), getDoc(doc(db, 'settings', 'global')).then((s) => (s.exists() ? s.data() : {}))]);
    } catch (e) { body.innerHTML = errorBox(e); return; }
    const botsOn = site.botsEnabled === true;
    body.innerHTML = `<h2 class="page-title">AI Bots</h2>
    <section class="card pad">
      <div class="row between wrap gap"><div><h3>Global switch: ${botsOn ? tagHtml('ON') : tagHtml('OFF', 'danger')}</h3>
        <p class="muted small">Bots are always labelled "AI Bot", cannot log in, cannot post video and never touch a person's post unless that person turned on <i>Settings → AI bots on my posts</i>.
          ${bots.length} of ${MAX_BOTS} bot accounts exist.</p></div>
        <div class="row gap wrap"><button class="btn ${botsOn ? 'btn-danger' : 'btn-primary'}" data-do="global">${botsOn ? 'Turn all bots OFF' : 'Turn all bots ON'}</button>
          <button class="btn" data-do="seed">Create missing built-in bots (${BOTS.length})</button>
          <button class="btn btn-primary" data-do="new" ${bots.length >= MAX_BOTS ? 'disabled' : ''}>New bot</button></div></div>
      <p class="muted small">Automatic activity runs from GitHub Actions (every 6 hours for posts and comments, every ~20 minutes for chat replies). Text comes from ready-made templates in English and Bengali, not from an AI model.</p>
    </section>
    <div data-cards>${bots.length ? bots.map((b) => `<div class="card pad bot-card" data-id="${esc(b.id)}"><div class="row gap wrap">
      ${avatarHtml(b.name, b.photo, 48)}<div class="grow"><b>${esc(b.name)}</b>${botBadge(b)} <span class="muted small">@${esc(b.username || b.id)} · ${esc(b.id)}</span>
        <div class="small">${esc(PERSONALITIES[b.personality]?.label || b.personality || '—')} · ${esc(LANGUAGES[b.lang] || 'Both')} · limit ${b.dailyLimit ?? 6}/day</div>
        <div class="small">${b.active === true ? tagHtml('Active') : tagHtml('Inactive', 'danger')} ${[['autoPost', 'Posts'], ['autoComment', 'Comments'], ['autoReaction', 'Reactions'], ['chatEnabled', 'Chat']].map(([k, l]) => tagHtml(`${l} ${b[k] === true ? 'on' : 'off'}`, b[k] === true ? '' : 'danger')).join(' ')}</div></div>
      <div class="row gap wrap"><button class="btn" data-do="logs">Activity</button><button class="btn btn-primary" data-do="edit">Edit</button></div></div></div>`).join('') : emptyState('No bots yet', 'Use "Create missing built-in bots" to start.')}</div>
    <section class="card pad"><h3>Latest bot activity (all bots)</h3><div data-log>${loading()}</div></section>`;
    loadLogs();
  };

  async function loadLogs() {
    const box = $('[data-log]', body);
    try {
      const snap = await getDocs(query(collection(db, 'botLogs'), orderBy('createdAt', 'desc'), limit(25)));
      box.innerHTML = snap.docs.length ? logTable(snap.docs.map((d) => d.data())) : '<div class="muted">Nothing yet. The scheduled job writes here.</div>';
    } catch (e) { box.innerHTML = errorBox(e); }
  }

  body.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-do]');
    if (!b) return;
    const card = b.closest('.bot-card');
    const bot = card && bots.find((x) => x.id === card.dataset.id);
    switch (b.dataset.do) {
      case 'global': {
        const next = site.botsEnabled !== true;
        if (await act(b, () => setDoc(doc(db, 'settings', 'global'), { botsEnabled: next, updatedBy: state.user.uid, updatedAt: serverTimestamp() }, { merge: true }), { ok: next ? 'Bots are ON' : 'Bots are OFF', log: ['bots global switch', 'settings/global', next ? 'on' : 'off'] })) draw();
        break;
      }
      case 'seed': if (await act(b, async () => { const r = await seedBots(); toast(`${r.created} created, ${r.existing} already existed`, 'success'); }, { ok: '', log: ['built-in bots created', '', ''] })) draw(); break;
      case 'new': editBot(null); break;
      case 'edit': editBot(bot); break;
      case 'logs': showLogs(bot); break;
      default: break;
    }
  });

  function logTable(rows) {
    return `<table class="table"><thead><tr><th>When</th><th>Bot</th><th>Type</th><th>Text</th></tr></thead><tbody>${rows.map((r) =>
      `<tr><td>${when(r.createdAt)}</td><td>${esc(r.botName || r.botId)}</td><td>${esc(r.kind)}</td><td class="small">${esc(short(r.text, 120))}</td></tr>`).join('')}</tbody></table>`;
  }

  async function showLogs(bot) {
    const m = modal(`<h3>${esc(bot.name)}: activity</h3><div data-l>${loading()}</div><div class="row end"><button class="btn" data-close>Close</button></div>`, { wide: true });
    try {
      const snap = await getDocs(query(collection(db, 'botLogs'), where('botId', '==', bot.id), orderBy('createdAt', 'desc'), limit(30)));
      $('[data-l]', m).innerHTML = snap.docs.length ? logTable(snap.docs.map((d) => d.data())) : '<div class="muted">No activity logged for this bot yet.</div>';
    } catch (e) { $('[data-l]', m).innerHTML = errorBox(e); }
  }

  function editBot(bot) {
    const isNew = !bot;
    const v = bot || { name: '', username: '', bio: '', roleEmoji: '✨', personality: 'friendly', lang: 'both', interests: [], dailyLimit: 6, active: true, autoPost: true, autoComment: true, autoReaction: true, chatEnabled: true, ideas: [], ideasBn: [] };
    const tog = (k, label) => `<label class="row gap small"><input type="checkbox" data-k="${k}" ${v[k] === true ? 'checked' : ''}> ${label}</label>`;
    const m = modal(`<h3>${isNew ? 'New AI bot' : `Edit ${esc(v.name)}`}</h3>
      <div class="field"><label for="b-name">Name</label><input id="b-name" maxlength="60" value="${esc(v.name)}"></div>
      <div class="field"><label for="b-user">Username</label><input id="b-user" maxlength="30" value="${esc(v.username || '')}" placeholder="e.g. travel_buddy"></div>
      <div class="field"><label for="b-emoji">Character symbol</label><select id="b-emoji">${ROLE_EMOJIS.map((emoji) => `<option value="${emoji}" ${v.roleEmoji === emoji ? 'selected' : ''}>${emoji}</option>`).join('')}</select><small class="muted">Choose a symbol that matches the bot's fictional character.</small></div>
      <div class="field"><label for="b-bio">Bio (mention that it is an AI bot)</label><textarea id="b-bio" rows="2" maxlength="300">${esc(v.bio || '')}</textarea></div>
      <div class="row gap wrap">
        <div class="field grow"><label for="b-pers">Personality</label><select id="b-pers">${Object.entries(PERSONALITIES).map(([k, p]) => `<option value="${k}" ${v.personality === k ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}</select></div>
        <div class="field grow"><label for="b-lang">Language</label><select id="b-lang">${Object.entries(LANGUAGES).map(([k, l]) => `<option value="${k}" ${v.lang === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
        <div class="field"><label for="b-lim">Daily limit</label><input id="b-lim" type="number" min="0" max="12" value="${v.dailyLimit ?? 6}" style="width:90px"></div></div>
      <div class="field"><label>Interests</label><div class="row gap wrap">${TOPICS.map((t) => `<label class="small row gap"><input type="checkbox" data-int="${t}" ${(v.interests || []).includes(t) ? 'checked' : ''}> ${t}</label>`).join('')}</div></div>
      <div class="row gap wrap">${tog('active', 'Active')}${tog('autoPost', 'Auto post')}${tog('autoComment', 'Auto comment')}${tog('autoReaction', 'Auto reaction')}${tog('chatEnabled', 'Chat')}</div>
      <div class="field"><label for="b-ideas">Post ideas, English (one per line; used by auto post)</label><textarea id="b-ideas" rows="3">${esc((v.ideas || []).join('\n'))}</textarea></div>
      <div class="field"><label for="b-ideasbn">Post ideas, Bengali (one per line)</label><textarea id="b-ideasbn" rows="3">${esc((v.ideasBn || []).join('\n'))}</textarea></div>
      <div class="row gap wrap"><label class="btn">Avatar<input type="file" accept="image/*" hidden data-img="photo"></label><label class="btn">Cover<input type="file" accept="image/*" hidden data-img="cover"></label>
        ${isNew ? '' : '<button class="btn" data-do2="regen">Regenerate avatar &amp; cover</button>'}<span class="muted small" data-imgnote>Leave empty to keep / generate one.</span></div>
      <div class="row between gap" style="margin-top:12px">${isNew ? '<span></span>' : '<button class="btn btn-danger" data-do2="delete">Delete bot</button>'}<div class="row gap"><button class="btn" data-close>Cancel</button><button class="btn btn-primary" data-do2="save">Save</button></div></div>`, { wide: true });
    const imgs = {};
    $$('[data-img]', m).forEach((inp) => inp.addEventListener('change', async () => {
      const f = inp.files[0]; if (!f) return;
      try { imgs[inp.dataset.img] = await resizeImage(f, inp.dataset.img === 'cover' ? 1000 : 256, 0.75); $('[data-imgnote]', m).textContent = 'Image ready, press Save.'; } catch (err) { toast(err.message, 'error'); }
    }));
    m.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-do2]');
      if (!b) return;
      if (b.dataset.do2 === 'regen') {
        const n = Number(bot.id.slice(4));
        if (await act(b, () => saveBot(bot.id, { photo: botAvatar(n), cover: botCover(n) }), { ok: 'Regenerated', log: ['bot images regenerated', bot.id, bot.name] })) { closeModal(); draw(); }
        return;
      }
      if (b.dataset.do2 === 'delete') {
        if (!(await confirmBox(`Delete ${bot.name}? Its old posts stay on the feed with its name.`, 'Delete'))) return;
        if (await act(b, () => deleteBot(bot.id), { ok: 'Bot deleted', log: ['bot deleted', bot.id, bot.name] })) { closeModal(); draw(); }
        return;
      }
      const name = $('#b-name', m).value.trim();
      if (name.length < 2) { toast('Name needs at least 2 characters', 'error'); return; }
      const data = {
        name, username: $('#b-user', m).value.trim().replace(/[^\w.]/g, '').slice(0, 30) || (bot ? bot.id : ''), bio: $('#b-bio', m).value.trim().slice(0, 300),
        roleEmoji: $('#b-emoji', m).value, personality: $('#b-pers', m).value, lang: $('#b-lang', m).value, dailyLimit: Math.max(0, Math.min(12, Number($('#b-lim', m).value) || 0)),
        interests: $$('[data-int]', m).filter((c) => c.checked).map((c) => c.dataset.int),
        ideas: lines($('#b-ideas', m).value), ideasBn: lines($('#b-ideasbn', m).value), ...imgs
      };
      $$('[data-k]', m).forEach((c) => { data[c.dataset.k] = c.checked; });
      if (!/AI/i.test(data.bio)) data.bio = `${data.bio} I am an AI bot.`.trim(); // bots are always openly AI
      const ok = isNew
        ? await act(b, () => createBot(bots, data), { ok: 'Bot created', log: ['bot created', '', name] })
        : await act(b, () => saveBot(bot.id, data), { ok: 'Bot saved', log: ['bot edited', bot.id, name] });
      if (ok) { closeModal(); draw(); }
    });
  }

  await draw();
}
