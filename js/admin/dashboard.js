// Dashboard: totals, bot statistics and daily / weekly / monthly analytics (Firestore count/sum aggregations).
import {
  db, collection, query, where, getCountFromServer, getAggregateFromServer, sum, Timestamp
} from '../firebase.js';
import { $, $$, esc } from '../utils.js';
import { barChart, daysAgo, startOfDay, loading } from './common.js';

const count = (q) => getCountFromServer(q).then((s) => s.data().count).catch(() => null);
const fmt = (n) => (n === null || n === undefined ? '—' : n.toLocaleString());
const T = (d) => Timestamp.fromDate(d);

export async function render(body) {
  body.innerHTML = `<h2 class="page-title">Dashboard</h2><div data-cards>${loading()}</div>
    <section class="card pad"><div class="row between wrap gap"><h3>Analytics</h3>
      <div class="tabs" style="margin:0;border:0"><button class="tab active" data-range="daily">Daily</button><button class="tab" data-range="weekly">Weekly</button><button class="tab" data-range="monthly">Monthly</button></div></div>
      <div data-charts class="charts">${loading()}</div></section>
    <p class="muted small">Numbers come from Firestore aggregation queries: they cost 1 read per 1,000 documents counted, so the page stays inside the free quota.
      "Active" = signed in or opened the app in the last 24 hours (the app writes this at most once an hour).</p>`;

  const users = collection(db, 'users');
  const posts = collection(db, 'posts');
  const day = T(daysAgo(1)), week = T(daysAgo(7)), today = T(startOfDay());

  const [total, bots, inactiveBots, active24, active7, new7, new30, postsTotal, postsBot, reels, groups, reportsOpen, reportsAll, comments, botActionsToday] = await Promise.all([
    count(users),
    count(query(users, where('isBot', '==', true))),
    count(query(users, where('isBot', '==', true), where('active', '==', false))),
    count(query(users, where('lastActiveAt', '>=', day))),
    count(query(users, where('lastActiveAt', '>=', week))),
    count(query(users, where('createdAt', '>=', week))),
    count(query(users, where('createdAt', '>=', T(daysAgo(30))))),
    count(posts),
    count(query(posts, where('uid', '>=', 'bot_'), where('uid', '<', 'bot_'))),
    count(collection(db, 'reels')),
    count(collection(db, 'groups')),
    count(query(collection(db, 'reports'), where('status', '==', 'open'))),
    count(collection(db, 'reports')),
    getAggregateFromServer(posts, { n: sum('commentCount') }).then((s) => s.data().n).catch(() => null),
    count(query(collection(db, 'botLogs'), where('createdAt', '>=', today)))
  ]);

  const people = total === null || bots === null ? null : total - bots;
  const card = (label, n, sub = '') => `<div class="card stat"><div class="stat-n">${fmt(n)}</div><div>${esc(label)}</div>${sub ? `<div class="muted small">${esc(sub)}</div>` : ''}</div>`;
  $('[data-cards]', body).innerHTML = `
    <h3 class="muted">People &amp; content</h3>
    <div class="stats">
      ${card('Users (people)', people, `${fmt(total)} accounts incl. bots`)}
      ${card('Active users', active24, `${fmt(active7)} in the last 7 days`)}
      ${card('New users', new7, `${fmt(new30)} in the last 30 days`)}
      ${card('Posts', postsTotal, `${fmt(postsBot)} by AI bots`)}
      ${card('Comments', comments)}
      ${card('Reels', reels)}
      ${card('Groups', groups)}
      ${card('Reports', reportsAll, `${fmt(reportsOpen)} open`)}
    </div>
    <h3 class="muted" style="margin-top:16px">AI bots</h3>
    <div class="stats">
      ${card('Bot accounts', bots, `${fmt(bots === null || inactiveBots === null ? null : bots - inactiveBots)} active`)}
      ${card('Bot posts', postsBot)}
      ${card('Bot actions today', botActionsToday, 'posts, comments, reactions, chats')}
    </div>`;

  // ---- analytics
  const charts = $('[data-charts]', body);
  const cache = {};
  async function draw(range) {
    charts.innerHTML = loading();
    if (!cache[range]) {
      const periods = [];
      const now = new Date();
      if (range === 'daily') for (let i = 6; i >= 0; i--) { const s = startOfDay(daysAgo(i)); periods.push([s, new Date(s.getTime() + 86400000), s.toLocaleDateString(undefined, { weekday: 'short' })]); }
      else if (range === 'weekly') for (let i = 7; i >= 0; i--) { const e = new Date(startOfDay().getTime() + 86400000 - i * 7 * 86400000); periods.push([new Date(e.getTime() - 7 * 86400000), e, `W-${i}`]); }
      else for (let i = 5; i >= 0; i--) { const s = new Date(now.getFullYear(), now.getMonth() - i, 1); periods.push([s, new Date(s.getFullYear(), s.getMonth() + 1, 1), s.toLocaleDateString(undefined, { month: 'short' })]); }
      const range2 = (col, [s, e]) => count(query(col, where('createdAt', '>=', T(s)), where('createdAt', '<', T(e))));
      const [u, p] = await Promise.all([
        Promise.all(periods.map((x) => range2(users, x))),
        Promise.all(periods.map((x) => range2(posts, x)))
      ]);
      cache[range] = { periods, u, p };
    }
    const { periods, u, p } = cache[range];
    const rows = (arr) => periods.map((x, i) => ({ label: x[2], value: arr[i] || 0 }));
    charts.innerHTML = barChart(rows(u), { title: 'New accounts (includes bots created in that period)' }) + barChart(rows(p), { title: 'New posts (includes bot posts)' });
  }
  $$('[data-range]', body).forEach((b) => b.addEventListener('click', () => {
    $$('[data-range]', body).forEach((x) => x.classList.toggle('active', x === b));
    draw(b.dataset.range).catch((e) => { charts.innerHTML = `<div class="notice notice-error">${esc(e.message)}</div>`; });
  }));
  await draw('daily');
}
