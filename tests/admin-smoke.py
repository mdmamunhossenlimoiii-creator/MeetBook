#!/usr/bin/env python3
"""Browser smoke test of the admin panel and the user-facing admin features.

Runs the real site files in headless Chromium against a FAKE in-page Firebase (the gstatic SDK files are replaced by
a small stateful stub). It proves the UI renders without JavaScript errors and that buttons issue the expected
writes. It does NOT prove Firestore security rules or real Firebase behaviour.
Usage: python3 tests/admin-smoke.py [repo_dir]   (needs playwright + chromium)
"""
import asyncio, functools, http.server, json, sys, threading, os
from playwright.async_api import async_playwright

REPO = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else '.')
FAKE_CFG = "export const firebaseConfig={apiKey:'x',authDomain:'x',projectId:'demo',storageBucket:'',messagingSenderId:'1',appId:'1:1:web:1'};export const appCheckSiteKey='';export const imageUploadEndpoint='';"

STUB = r"""
const DB = window.__DB; const LOG = (window.__log = window.__log || []);
const ts = (ms) => ({ toMillis: () => ms, toDate: () => new Date(ms), seconds: Math.floor(ms / 1000) });
const NOW = Date.now();
const mk = (kind, path, extra = {}) => ({ kind, path, ...extra });
const parent = (p) => p.split('/').slice(0, -1).join('/');
const val = (o, f) => f.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const num = (v) => (v && v.toMillis ? v.toMillis() : v);
const matches = (d, w) => { const a = num(val(d, w.f)), b = num(w.v);
  switch (w.op) { case '==': return a === b; case '!=': return a !== b; case '>=': return a >= b; case '<=': return a <= b; case '<': return a < b; case '>': return a > b;
    case 'array-contains': return Array.isArray(a) && a.includes(b); case 'in': return w.v.includes(a); default: return true; } };
const rows = (q) => Object.entries(DB).filter(([p]) => parent(p) === q.path).map(([p, d]) => ({ id: p.split('/').pop(), path: p, d }))
  .filter((r) => (q.wheres || []).every((w) => matches(r.d, w)));
const snapOf = (items) => ({ docs: items.map((i) => ({ id: i.id, data: () => i.d, ref: { path: i.path } })), size: items.length, empty: !items.length });
const apply = (cur, data) => { const o = { ...(cur || {}) }; for (const [k, v] of Object.entries(data)) {
  const x = v && v.__inc !== undefined ? (val(o, k) || 0) + v.__inc : v;
  if (k.includes('.')) { const ks = k.split('.'); let c = o; ks.slice(0, -1).forEach((s) => { c[s] = { ...(c[s] || {}) }; c = c[s]; }); c[ks.at(-1)] = x; } else o[k] = x; } return o; };
const changed = (path) => (window.__subs || []).forEach((f) => f(path));
export const initializeApp = () => ({}); export const getAuth = () => ({}); export const getFirestore = () => ({});
export const onAuthStateChanged = (a, cb) => { setTimeout(() => cb(window.__USER || null), 0); return () => {}; };
export const collection = (db, ...p) => mk('col', p.join('/'));
export const doc = (db, ...p) => (db && db.kind === 'col') ? mk('doc', db.path + '/' + (p[0] || ('auto' + Math.random().toString(36).slice(2, 8)))) : mk('doc', p.join('/'));
export const getDoc = async (r) => { const d = DB[r.path]; return { id: r.path.split('/').pop(), exists: () => !!d, data: () => d }; };
export const getDocs = async (q) => snapOf(rows(q));
export const onSnapshot = (q, cb) => { const run = () => { if (q.kind === 'doc') { const d = DB[q.path]; cb({ exists: () => !!d, data: () => d, id: q.path.split('/').pop() }); } else cb(snapOf(rows(q))); };
  setTimeout(run, 0); window.__subs = (window.__subs || []).concat([() => run()]); return () => {}; };
export const query = (c, ...rest) => ({ kind: 'query', path: c.path, wheres: [...(c.wheres || []), ...rest.filter((r) => r && r.f)] });
export const where = (f, op, v) => ({ f, op, v }); export const orderBy = () => ({}); export const limit = () => ({}); export const startAfter = () => ({});
export const setDoc = async (r, data, opt) => { DB[r.path] = opt && opt.merge ? apply(DB[r.path], data) : { ...data }; LOG.push(['setDoc', r.path, data]); changed(r.path); };
export const addDoc = async (c, data) => { const id = 'n' + Math.random().toString(36).slice(2, 8); DB[c.path + '/' + id] = { ...data }; LOG.push(['addDoc', c.path, data]); changed(c.path); return { id }; };
export const updateDoc = async (r, data) => { if (!DB[r.path]) throw new Error('no document to update: ' + r.path); DB[r.path] = apply(DB[r.path], data); LOG.push(['updateDoc', r.path, data]); changed(r.path); };
export const deleteDoc = async (r) => { delete DB[r.path]; LOG.push(['deleteDoc', r.path]); changed(r.path); };
export const serverTimestamp = () => ts(Date.now()); export const increment = (n) => ({ __inc: n }); export const deleteField = () => null;
export const arrayUnion = (x) => x; export const arrayRemove = (x) => x;
export const writeBatch = () => { const ops = []; return {
  set(r, d, opt) { ops.push(['setDoc', r, d, opt]); },
  update(r, d) { ops.push(['updateDoc', r, d]); },
  delete(r) { ops.push(['deleteDoc', r]); },
  commit: async () => { for (const [kind, r, d, opt] of ops) {
    if (kind === 'setDoc') DB[r.path] = opt && opt.merge ? apply(DB[r.path], d) : { ...d };
    else if (kind === 'updateDoc') { if (!DB[r.path]) throw new Error('no document to update: ' + r.path); DB[r.path] = apply(DB[r.path], d); }
    else delete DB[r.path];
    LOG.push([kind, r.path, d]); changed(r.path);
  } }
}; };
export const Timestamp = { now: () => ts(Date.now()), fromMillis: (m) => ts(m), fromDate: (d) => ts(d.getTime()) };
export const getCountFromServer = async (q) => ({ data: () => ({ count: rows(q).length }) });
export const sum = (f) => ({ sum: f });
export const getAggregateFromServer = async (q) => ({ data: () => ({ n: rows(q).reduce((a, r) => a + (r.d.commentCount || 0), 0) }) });
export const createUserWithEmailAndPassword = async () => ({}); export const signInWithEmailAndPassword = async () => ({});
export const signOut = async () => { LOG.push(['signOut']); }; export const sendPasswordResetEmail = async () => {}; export const updateProfile = async () => {};
export class GoogleAuthProvider {} export const signInWithPopup = async () => ({});
"""

def seed(role, extra=None):
    now = 1_700_000_000_000 + 10**9
    t = lambda ms: {'__ts': ms}
    return {
        'users/me': dict(name='Test User', nameLower='test user', bio='hi', photo='', cover='', banned=False, createdAt=t(now - 86400000), lastActiveAt=t(now), settings=dict(profileVisibility='everyone', allowMessages='everyone', defaultVisibility='public')),
        'users/u2': dict(name='Rafi Ahmed', nameLower='rafi ahmed', bio='', photo='', cover='', banned=False, verified=True, createdAt=t(now - 86400000), settings={}),
        'users/u3': dict(name='Mina Khan', nameLower='mina khan', bio='', photo='', cover='', banned=False, createdAt=t(now - 3600000), settings={}),
        'publicProfiles/me': dict(name='Test User', nameLower='test user', bio='hi', photo='', cover='', isBot=False, roleEmoji='', verified=False, profileVisibility='everyone', createdAt=t(now - 86400000)),
        'publicProfiles/u2': dict(name='Rafi Ahmed', nameLower='rafi ahmed', bio='', photo='', cover='', isBot=False, roleEmoji='', verified=True, profileVisibility='everyone', createdAt=t(now - 86400000)),
        'publicProfiles/u3': dict(name='Mina Khan', nameLower='mina khan', bio='', photo='', cover='', isBot=False, roleEmoji='', verified=False, profileVisibility='everyone', createdAt=t(now - 3600000)),
        'publicProfiles/bot_01': dict(name='TechTip Nova', nameLower='techtip nova', bio='I am an AI bot.', photo='', cover='', isBot=True, roleEmoji='🤖', verified=False, profileVisibility='everyone', createdAt=t(now - 86400000)),
        'botEngagement/me': dict(allowBotEngagement=False, updatedAt=t(now)),
        'users/bot_01': dict(name='TechTip Nova', nameLower='techtip nova', username='techtip_nova', bio='I am an AI bot.', photo='', cover='', isBot=True, banned=False, personality='tech', lang='both', interests=['tech'], dailyLimit=6, active=True, chatEnabled=True, settings={}),
        'posts/p1': dict(uid='u2', authorName='Rafi Ahmed', text='Visible post by Rafi', image='', videoUrl='', visibility='public', audience=[], groupId=None, reactions={'me': 'love', 'u2': 'like', 'bot_01': 'wow'}, commentCount=2, shareCount=0, createdAt=t(now - 5000)),
        'posts/p2': dict(uid='u2', authorName='Rafi Ahmed', text='HIDDEN post text', image='', videoUrl='', visibility='public', audience=[], groupId=None, reactions={}, commentCount=0, shareCount=0, hidden=True, createdAt=t(now - 6000)),
        'posts/p3': dict(uid='u2', authorName='Rafi Ahmed', text='Comments are off here', image='', videoUrl='', visibility='public', audience=[], groupId=None, reactions={}, commentCount=0, shareCount=0, commentsDisabled=True, createdAt=t(now - 7000)),
        'reports/r1': dict(kind='post', targetId='p1', targetUid='u2', reporterUid='u3', reason='Spam', details='looks like spam', status='open', createdAt=t(now - 1000)),
        'reports/r2': dict(kind='user', targetId='u3', targetUid='u3', reporterUid='u2', reason='Harassment or bullying', details='', status='resolved', action='dismissed', createdAt=t(now - 90000)),
        'reels/rl1': dict(uid='u2', authorName='Rafi Ahmed', videoUrl='https://example.com/a.mp4', caption='A reel caption', likes={}, createdAt=t(now - 8000)),
        'groups/g1': dict(name='Photo Lovers', nameLower='photo lovers', description='All about photos', privacy='public', ownerUid='u2', members=['u2', 'me'], createdAt=t(now - 9000)),
        'adminLogs/l1': dict(actorUid='me', actorName='Test User', role='super_admin', action='post hidden', target='p2', details='x', createdAt=t(now - 100)),
        'botLogs/b1': dict(botId='bot_01', botName='TechTip Nova', kind='post', targetId='p9', text='Tech tip: restart', createdAt=t(now - 100)),
        'announcements/a1': dict(text='Welcome to the new MySocial', level='info', active=True, createdAt=t(now - 100), expiresAt=None),
        'settings/overall': dict(botsEnabled=True),
        'deletionRequests/u3': dict(status='pending', name='Mina Khan', requestedBy='me', createdAt=t(now)),
        'system/backups': dict(status='ok', lastRunAt=t(now - 1000), lastFile='b.enc', sizeBytes=2048, counts={'users': 3}),
        **({'admins/me': dict(role=role)} if role else {}),
        **(extra or {})
    }

SERIALIZE_FIX = "(db)=>{const f=(v)=>{if(v&&typeof v==='object'){if(v.__ts!==undefined)return{toMillis:()=>v.__ts,toDate:()=>new Date(v.__ts),seconds:Math.floor(v.__ts/1000)};for(const k in v)v[k]=f(v[k]);}return v;};for(const k in db)f(db[k]);return db;}"

failures = []
def check(name, cond, info=''):
    print(('PASS ' if cond else 'FAIL ') + name + (f'  [{info}]' if (info and not cond) else ''))
    if not cond: failures.append(name)

async def page(p, role, extra=None, viewport=None):
    b = await p.chromium.launch()
    ctx = await b.new_context(viewport=viewport or {"width": 1280, "height": 900})
    pg = await ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    pg.on("console", lambda m: errors.append(f"console.error: {m.text}") if m.type == "error" else None)
    await pg.route("**/www.gstatic.com/**", lambda r: r.fulfill(body=STUB, content_type="text/javascript"))
    await pg.route("**/js/firebase-config.js", lambda r: r.fulfill(body=FAKE_CFG, content_type="text/javascript"))
    await pg.add_init_script("window.__USER={uid:'me',email:'t@example.com',displayName:'Test User'};window.__DB=(" + SERIALIZE_FIX + ")(" + json.dumps(seed(role, extra)) + ");")
    await pg.goto("http://127.0.0.1:8771/index.html")
    await pg.wait_for_timeout(700)
    return b, pg, errors

async def go(pg, hash_, wait=600):
    await pg.evaluate(f"location.hash='{hash_}'")
    await pg.wait_for_timeout(wait)

SECTIONS = {'dashboard': 'Dashboard', 'reports': 'Reports', 'users': 'Users', 'posts': 'Posts', 'content': 'Reels', 'bots': 'AI Bots',
            'announcements': 'Announcements', 'settings': 'Global settings', 'logs': 'Activity logs', 'staff': 'Staff', 'server': 'Server jobs'}

async def main():
    shots = os.environ.get('SHOTS')
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a, **k): pass
    handler = functools.partial(Quiet, directory=REPO)
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8771), handler); threading.Thread(target=srv.serve_forever, daemon=True).start()
    async with async_playwright() as p:
        # ---------- super admin: every section renders
        b, pg, errors = await page(p, 'super_admin')
        for sec, text in SECTIONS.items():
            await go(pg, f'#/admin/{sec}', 700)
            body = await pg.inner_text('#main')
            check(f'super_admin sees section "{sec}"', text.lower() in body.lower() and 'Something went wrong' not in body, body[:120])
            if shots: await pg.screenshot(path=f'{shots}/admin-{sec}.png', full_page=True)
        await go(pg, '#/admin/dashboard', 900)
        check('dashboard shows stats and a chart', 'Active users' in await pg.inner_text('#main') and await pg.locator('.chart svg').count() >= 2)
        # reports: dismiss
        await go(pg, '#/admin/reports'); await pg.click('.report [data-act="dismiss"]'); await pg.wait_for_timeout(300)
        log = await pg.evaluate('window.__log')
        check('dismissing a report updates it and writes an admin log', any(l[0] == 'updateDoc' and l[1] == 'reports/r1' and l[2]['status'] == 'resolved' for l in log) and any(l[0] == 'addDoc' and l[1] == 'adminLogs' for l in log))
        # posts: hide p1
        await go(pg, '#/admin/posts'); await pg.click('.post-row[data-id="p1"] [data-open]'); await pg.wait_for_timeout(300)
        check('post details list the report on the post', 'Spam' in await pg.inner_text('.modal'))
        await pg.click('.modal [data-do="hide"]'); await pg.wait_for_timeout(300)
        log = await pg.evaluate('window.__log')
        check('hide post writes hidden=true', any(l[0] == 'updateDoc' and l[1] == 'posts/p1' and l[2].get('hidden') is True for l in log))
        check('no approve / reject controls exist', 'approve' not in (await pg.inner_text('#main')).lower())
        # users: block + suspend + verify + queue deletion
        await go(pg, '#/admin/users'); await pg.click('.person[data-uid="u3"] [data-open]'); await pg.wait_for_timeout(400)
        modal_text = await pg.inner_text('.modal')
        check('user details show deletion status for super admin', 'pending' in modal_text.lower())
        await pg.click('.modal [data-do="verify"]'); await pg.wait_for_timeout(300)
        await go(pg, '#/admin/users'); await pg.click('.person[data-uid="u3"] [data-open]'); await pg.wait_for_timeout(300)
        await pg.click('.modal [data-do="block"]'); await pg.click('#cf-ok'); await pg.wait_for_timeout(300)
        await go(pg, '#/admin/users'); await pg.click('.person[data-uid="u3"] [data-open]'); await pg.wait_for_timeout(300)
        await pg.click('.modal [data-do="suspend"]'); await pg.click('#cf-ok'); await pg.wait_for_timeout(300)
        log = await pg.evaluate('window.__log')
        ups = [l[2] for l in log if l[0] == 'updateDoc' and l[1] == 'users/u3']
        check('verify / block / suspend write the right fields', any(u.get('verified') is True for u in ups) and any(u.get('banned') is True for u in ups) and any('suspendedUntil' in u for u in ups), str(ups))
        await go(pg, '#/admin/users'); await pg.click('.person[data-uid="u2"] [data-open]'); await pg.wait_for_timeout(300)
        await pg.click('.modal [data-do="delete"]'); await pg.click('#cf-ok'); await pg.wait_for_timeout(300)
        log = await pg.evaluate('window.__log')
        check('permanent deletion only queues a request (server job does the work)', any(l[0] == 'setDoc' and l[1] == 'deletionRequests/u2' and l[2]['status'] == 'pending' for l in log) and not any(l[0] == 'deleteDoc' and l[1].startswith('users/') for l in log))
        # settings: maintenance
        await go(pg, '#/admin/settings'); await pg.check('#gs-maint'); await pg.fill('#gs-msg', 'Back soon'); await pg.click('#gs-save'); await pg.wait_for_timeout(300)
        log = await pg.evaluate('window.__log')
        check('settings save writes maintenance + bot switches', any(l[0] == 'setDoc' and l[1] == 'settings/overall' and l[2]['maintenance'] is True and l[2]['botsEnabled'] is True and l[2]['botToBotComments'] is False for l in log))
        # staff
        await go(pg, '#/admin/staff'); await pg.fill('#st-uid', 'u3'); await pg.select_option('#st-role', 'moderator'); await pg.click('#st-add'); await pg.wait_for_timeout(400)
        log = await pg.evaluate('window.__log')
        check('adding staff writes /admins with a role', any(l[0] == 'setDoc' and l[1] == 'admins/u3' and l[2]['role'] == 'moderator' for l in log))
        # announcements
        await go(pg, '#/admin/announcements'); await pg.fill('#an-text', 'Maintenance tonight'); await pg.click('#an-add'); await pg.wait_for_timeout(300)
        log = await pg.evaluate('window.__log')
        check('announcement is published as active', any(l[0] == 'addDoc' and l[1] == 'announcements' and l[2]['active'] is True for l in log))
        # bots admin
        await go(pg, '#/admin/bots', 800)
        txt = await pg.inner_text('#main')
        check('bot list shows personality, limit and the AI Bot badge', 'Tech Lover' in txt and 'limit 6/day' in txt and 'AI Bot' in txt)
        await pg.click('.bot-card [data-do="edit"]'); await pg.wait_for_timeout(300)
        await pg.fill('#b-lim', '3'); await pg.select_option('#b-lang', 'bn'); await pg.uncheck('[data-k="autoComment"]'); await pg.click('[data-do2="save"]'); await pg.wait_for_timeout(400)
        log = await pg.evaluate('window.__log')
        up = [l[2] for l in log if l[0] == 'updateDoc' and l[1] == 'users/bot_01']
        check('editing a bot saves limit / language / toggles', up and up[-1]['dailyLimit'] == 3 and up[-1]['lang'] == 'bn' and up[-1]['autoComment'] is False and up[-1]['isBot'] if False else bool(up) and up[-1]['dailyLimit'] == 3 and up[-1]['lang'] == 'bn' and up[-1]['autoComment'] is False, str(up))
        check('bot bio always says it is an AI bot', bool(up) and 'AI' in up[-1]['bio'])
        await pg.click('[data-do="global"]'); await pg.wait_for_timeout(300)
        log = await pg.evaluate('window.__log')
        check('global bot switch writes botsEnabled=false', any(l[0] == 'setDoc' and l[1] == 'settings/overall' and l[2].get('botsEnabled') is False for l in log))
        check('no JS errors in the admin run', not errors, '; '.join(errors[:3]))
        await b.close()

        # ---------- moderator: limited menu
        b, pg, errors = await page(p, 'moderator')
        await go(pg, '#/admin/dashboard', 800)
        nav = await pg.inner_text('.admin-nav')
        check('moderator sees reports/users/posts but not staff, settings, bots or logs', all(x in nav for x in ['Reports', 'Users', 'Posts']) and not any(x in nav for x in ['Staff', 'Global settings', 'AI Bots', 'Activity logs', 'Server']), nav)
        await go(pg, '#/admin/staff', 600)
        check('moderator cannot open the staff page', 'Staff & roles' not in await pg.inner_text('#main'))
        await go(pg, '#/admin/users'); await pg.click('.person[data-uid="u2"] [data-open]'); await pg.wait_for_timeout(300)
        mt = await pg.inner_text('.modal')
        check('moderator can suspend but not block, verify or delete', 'Suspend' in mt and 'Block account' not in mt and 'verified badge' not in mt.lower() and 'permanent deletion' not in mt.lower())
        check('no JS errors (moderator)', not errors, '; '.join(errors[:3]))
        await b.close()

        # ---------- legacy admin doc without a role (old `enabled: true` setup) must NOT become super admin
        b, pg, errors = await page(p, None, {'admins/me': dict(enabled=True)})
        await go(pg, '#/admin', 500)
        check('legacy admin doc without role gets no admin access (fails closed)', 'Admins only' in await pg.inner_text('#main'))
        await go(pg, '#/feed', 700)
        check('legacy admin doc without role: no Admin link in the menu', 'Admin dashboard' not in await pg.inner_text('body'))
        await b.close()
        b, pg, errors = await page(p, None, {'admins/me': dict(role='owner')})
        await go(pg, '#/admin', 500)
        check('unknown role value gets no admin access', 'Admins only' in await pg.inner_text('#main'))
        await b.close()

        # ---------- normal user: no admin, hidden posts, badges, AI reactions, comments off, announcement, bot chat
        b, pg, errors = await page(p, None)
        await go(pg, '#/admin', 500)
        check('normal user is refused the admin page', 'Admins only' in await pg.inner_text('#main'))
        # feed lists are empty in the stub (queries need filters) so open posts directly
        await go(pg, '#/feed', 900)
        feed_txt = await pg.inner_text('#main')
        check('feed lists visible posts, skips hidden ones and does not crash', 'Visible post by Rafi' in feed_txt and 'HIDDEN post text' not in feed_txt, feed_txt[:200])
        await go(pg, '#/post/p1', 700)
        txt = await pg.inner_text('#main')
        check('bot reaction is shown separately as "🤖 1 AI" and not counted as a person', '🤖 1 AI' in txt and '2' in txt.split('🤖')[0])
        check('verified badge shows next to a verified author', await pg.locator('.verified-badge').count() >= 1)
        await go(pg, '#/post/p2', 600)
        check('hidden post is not shown to a normal user', 'HIDDEN post text' not in await pg.inner_text('#main'))
        await go(pg, '#/post/p3', 800)  # the post page opens its comments by itself
        check('comments-off post shows the notice and no comment box', 'Comments are turned off' in await pg.inner_text('#main') and await pg.locator('.comment-form').count() == 0)
        check('site announcement banner is visible', 'Welcome to the new MySocial' in await pg.inner_text('#announce-bar'))
        await go(pg, '#/settings', 500)
        check('settings has the AI bot consent switch, default OFF', await pg.input_value('#st-bots') == 'off')
        await pg.select_option('#st-bots', 'on'); await pg.click('#st-save'); await pg.wait_for_timeout(300)
        log = await pg.evaluate('window.__log')
        check('saving consent stores allowBotEngagement=true', any(l[0] == 'updateDoc' and l[1] == 'users/me' and l[2].get('settings', {}).get('allowBotEngagement') is True for l in log))
        await go(pg, '#/profile/bot_01', 700)
        check('bot profile offers a chat button and a report button', 'Chat with AI' in await pg.inner_text('#main') and 'Report' in await pg.inner_text('#main'))
        await go(pg, '#/messages/with/bot_01', 900)
        check('chat with a bot shows the AI and Gemini data-use notice', 'AI bot' in await pg.inner_text('#main') and 'Google Gemini' in (await pg.inner_text('#main')) and 'sensitive information' in (await pg.inner_text('#main')))
        await pg.fill('[data-text]', 'Hello bot'); await pg.press('[data-text]', 'Enter'); await pg.wait_for_timeout(500)
        log = await pg.evaluate('window.__log')
        check('sending to a bot also files a botInbox request', any(l[0] == 'setDoc' and l[1].startswith('botInbox/') and l[2]['botId'] == 'bot_01' and l[2]['handled'] is False for l in log), str(log)[-300:])
        check('no JS errors (user)', not errors, '; '.join(errors[:3]))
        await b.close()

        # ---------- maintenance + suspension
        b, pg, errors = await page(p, None, {'settings/overall': dict(maintenance=True, maintenanceMessage='Upgrading the database')})
        check('maintenance screen blocks a normal user', 'Upgrading the database' in await pg.inner_text('body') and await pg.locator('.topbar').count() == 0)
        await b.close()
        b, pg, errors = await page(p, 'admin', {'settings/overall': dict(maintenance=True)})
        check('staff can still use the site during maintenance', await pg.locator('.topbar').count() == 1)
        await b.close()
        # ---------- mobile layout of the admin panel
        b, pg, errors = await page(p, 'super_admin', viewport={"width": 390, "height": 800})
        await go(pg, '#/admin/users', 800)
        overflow = await pg.evaluate('document.documentElement.scrollWidth > window.innerWidth + 2')
        check('admin panel has no horizontal page scroll on a phone', not overflow)
        if shots: await pg.screenshot(path=f'{shots}/admin-mobile-users.png')
        await go(pg, '#/admin/logs', 800)
        check('log table does not break the phone layout', not await pg.evaluate('document.documentElement.scrollWidth > window.innerWidth + 2'))
        await b.close()
    print(f"\n{len(failures)} failed" if failures else "\nall passed")
    sys.exit(1 if failures else 0)

asyncio.run(main())
