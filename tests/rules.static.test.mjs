// STATIC checks of firestore.rules: they read the rules text and guard the security-critical lines against
// regressions. They do NOT execute the rules (that needs the Firebase Emulator or the console Rules Playground),
// so passing here is necessary, not sufficient.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

// text of `match /<name>/{...} { ... }` (brace matched)
function block(name) {
  const m = new RegExp(`match /${name}/\\{[^}]*\\}\\s*\\{`).exec(rules);
  assert.ok(m, `no match block for ${name}`);
  let depth = 1, i = m.index + m[0].length;
  while (depth && i < rules.length) { const c = rules[i++]; if (c === '{') depth++; else if (c === '}') depth--; }
  return rules.slice(m.index, i);
}
const fn = (name) => { const m = new RegExp(`function ${name}\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n    \\}`).exec(rules); assert.ok(m, `function ${name}`); return m[1]; };
const allows = (b) => [...b.matchAll(/allow ([a-z, ]+):\s*if ([^;]*);/g)].map((m) => ({ ops: m[1].split(',').map((x) => x.trim()), cond: m[2] }));

test('braces and parentheses are balanced', () => {
  assert.equal(rules.split('{').length, rules.split('}').length);
  assert.equal(rules.split('(').length, rules.split(')').length);
});

test('roles fail closed: no default to a powerful role, only 3 known roles count as staff', () => {
  assert.doesNotMatch(rules, /\.get\('role',\s*'(super_admin|admin|moderator)'\)/, 'a missing role must never default to a staff role');
  assert.match(fn('roleOf'), /\.get\('role', 'none'\)/);
  assert.match(fn('isStaff'), /roleOf\(\) in \['super_admin', 'admin', 'moderator'\]/);
  assert.match(fn('isSuper'), /roleOf\(\) == 'super_admin'/);
  assert.match(fn('isAdmin'), /\['super_admin', 'admin'\]/);
  assert.match(fn('isMod'), /roleOf\(\) == 'moderator'/);
});

test('/admins can only be written by a super admin, never for oneself, never for bots, only known fields', () => {
  const a = allows(block('admins'));
  const writes = a.filter((x) => x.ops.some((o) => ['create', 'update', 'delete', 'write'].includes(o)));
  assert.ok(writes.length >= 2);
  for (const w of writes) { assert.match(w.cond, /isSuper\(\)/); assert.match(w.cond, /uid != request\.auth\.uid/); }
  const create = writes.find((w) => w.ops.includes('create'));
  assert.match(create.cond, /!uid\.matches\('bot_\.\*'\)/);
  assert.match(create.cond, /hasOnly\(\['role', 'addedBy', 'addedAt'\]\)/);
  assert.match(create.cond, /role in \['super_admin', 'admin', 'moderator'\]/);
  assert.match(create.cond, /exists\(.*users\/\$\(uid\)\)/);
});

test('staff-only collections have no open writes', () => {
  for (const name of ['admins', 'adminLogs', 'settings', 'announcements', 'deletionRequests', 'system', 'botRunners', 'botState']) {
    for (const a of allows(block(name))) {
      if (!a.ops.some((o) => ['create', 'update', 'delete', 'write'].includes(o))) continue;
      assert.notEqual(a.cond.trim(), 'true', `${name}: open write`);
      assert.doesNotMatch(a.cond, /^signedIn\(\)$/, `${name}: any signed-in user can write`);
    }
  }
  assert.match(block('adminLogs'), /allow update, delete: if false;/, 'logs are immutable');
  assert.match(block('system'), /allow write: if false;/);
  assert.match(block('botRunners'), /allow write: if false;/);
});

test('permanent deletion requests: super admin only, never staff or bots', () => {
  const c = allows(block('deletionRequests')).find((x) => x.ops.includes('create')).cond;
  assert.match(c, /isSuper\(\)/); assert.match(c, /!isStaffUid\(uid\)/); assert.match(c, /!uid\.matches\('bot_\.\*'\)/);
  assert.match(block('deletionRequests'), /allow update: if false;/);
});

test('users: owners cannot grant themselves bans, badges, bot flag or suspension; admins cannot touch other staff', () => {
  const u = block('users');
  assert.match(u, /hasAny\(\['banned', 'isBot', 'verified', 'suspendedUntil'\]\)/);
  assert.match(u, /request\.resource\.data\.get\('isBot', false\) == false/);
  assert.match(u, /isAdmin\(\)\s*&& \(isSuper\(\) \|\| !isStaffUid\(uid\)\)/, 'an admin must not edit/ban another staff member');
  assert.match(u, /isMod\(\)\s*&& !isStaffUid\(uid\)/, 'a moderator must not suspend staff');
  assert.match(u, /allow delete: if isAdmin\(\) && resource\.data\.get\('isBot', false\) == true;/, 'only bot profiles can be deleted from the client');
});

test('moderators get only moderation powers: no settings, staff, logs, bot logs or announcements writes', () => {
  assert.match(block('settings'), /isAdmin\(\)/); assert.doesNotMatch(block('settings'), /isMod\(\)|isStaff\(\)/);
  assert.match(block('announcements'), /isAdmin\(\)/);
  const logs = allows(block('adminLogs'));
  assert.ok(logs.find((x) => x.ops.includes('read')).cond.includes('isAdmin()'), 'moderators cannot read logs');
  assert.doesNotMatch(block('botLogs').match(/allow create:[^;]*;/)[0], /isStaff\(\)|isMod\(\)/);
  const rep = block('reports');
  assert.match(rep, /allow delete: if isAdmin\(\)/);
  assert.match(rep, /hasOnly\(\['status', 'action', 'resolvedBy', 'resolvedAt'\]\)/);
});

test('private user documents are not readable by other ordinary users', () => {
  assert.match(block('users'), /allow read: if isOwner\(uid\) \|\| isStaff\(\) \|\| \(signedIn\(\) && resource\.data\.get\('isBot', false\) == true\)/);
  assert.match(block('publicProfiles'), /allow read: if signedIn\(\)/);
  assert.match(block('publicProfiles'), /hasOnly\(\['name', 'nameLower', 'bio', 'photo', 'cover', 'isBot', 'roleEmoji', 'verified', 'profileVisibility', 'createdAt'\]\)/);
  assert.match(block('botEngagement'), /runnerEnabled\(\)/);
  assert.doesNotMatch(block('botEngagement'), /allow write/);
});

test('settings/global only accepts the known fields with real booleans', () => {
  const s = block('settings');
  assert.match(s, /keys\(\)\.hasOnly\(\['maintenance', 'maintenanceMessage', 'registrationOpen', 'botsEnabled', 'botToBotComments', 'updatedBy', 'updatedAt'\]\)/);
  assert.match(s, /'botsEnabled', true\) is bool/);
});

test('AI bots: only assigned Runner can act as bots, and only with the owner\'s consent', () => {
  assert.match(fn('runnerEnabled'), /botsEnabled', false\) == true/);
  assert.match(fn('runnerEnabled'), /enabled', false\) == true/);
  assert.match(fn('runnerEnabled'), /botIds/);
  assert.match(fn('runnerHasBot'), /botUid in/);
  assert.match(fn('runnerHasBot'), /enabled', false\) == true/);
  assert.match(fn('runnerHasBot'), /botsEnabled', false\) == true/);
  assert.match(fn('runnerHasBot'), /bot\.get\('isBot', false\) == true/);
  assert.match(fn('runnerHasBot'), /bot\.get\('active', false\) == true/);
  assert.match(fn('runnerMayActAs'), /runnerHasBot\(botUid\)/);
  assert.match(fn('runnerMayReadChat'), /runnerMayChatAs\(chat\.members\[0\]\)/);
  assert.match(fn('runnerMayReadChat'), /runnerMayChatAs\(chat\.members\[1\]\)/);
  assert.match(fn('runnerMayPost'), /autoPost', false\) == true/);
  assert.match(fn('runnerMayCommentAs'), /autoComment', false\) == true/);
  assert.match(fn('runnerMayReactAs'), /autoReaction', false\) == true/);
  assert.match(fn('runnerMayChatAs'), /chatEnabled', false\) == true/);
  assert.match(block('botInbox'), /runnerMayChatAs\(resource\.data\.botId\)/);
  assert.match(block('botMemories'), /runnerMayChatAs\(resource\.data\.botId\)/);
  assert.match(block('botRateLimits'), /function botDailyLimit\(\)/);
  assert.match(block('botRateLimits'), /d\.count <= botDailyLimit\(\)/);
  assert.match(block('botRateLimits'), /resource\.data\.count < botDailyLimit\(\)/);
  assert.match(fn('engagementOk'), /isBotUser\(ownerUid\)/);
  assert.match(fn('engagementOk'), /allowBotEngagement', false\) == true/, 'consent defaults to OFF');
  const posts = block('posts');
  const botComment = posts.slice(posts.indexOf('match /comments'));
  assert.match(botComment, /runnerMayCommentAs\(request\.resource\.data\.uid\)[\s\S]*runnerMayComment\(postId\)/, 'only assigned bot with autoComment ON comments');
  assert.doesNotMatch(botComment, /isAdmin\(\)[\s\S]*isBotUser\(request\.resource\.data\.uid\)/, 'Admin cannot comment as a bot');
  assert.match(fn('runnerMayComment'), /engagementOk\(p\.uid\)/, 'bot comments need consent');
  assert.match(fn('runnerMayComment'), /visibility == 'public'/);
  assert.match(fn('runnerMayComment'), /botToBotComments/);
  assert.match(fn('runnerMayReact'), /runnerMayReactAs\(botUid\)/, 'reaction requires the explicit reaction switch');
  assert.match(fn('runnerMayReact'), /hasOnly\(\[botUid\]\)/, 'reaction key must match its bot identity marker');
  assert.match(fn('runnerMayIncrementCommentCount'), /request\.resource\.data\.commentCount == resource\.data\.commentCount \+ 1/, 'Runner may only increment commentCount with a validated comment');
  assert.match(fn('canPublishBot'), /runnerMayPost\(botUid\)/, 'only an assigned active bot with autoPost ON can publish');
  assert.doesNotMatch(fn('canPublishBot'), /isAdmin/);
  assert.match(posts, /request\.resource\.data\.videoUrl == ''/, 'bots never post video');
  assert.match(fn('runnerMayReact'), /runnerMayReactAs\(botUid\)/, 'reaction key must have explicit autoReaction permission');
  // the runner is not allowed to write anything but bot content
  assert.match(block('botState'), /runnerEnabled\(\)/);
  assert.match(block('botInbox'), /runnerMayChatAs\(resource\.data\.botId\)/);
  assert.match(block('botInbox'), /hasOnly\(\['handled', 'handledAt', 'skipped'\]\)/);
  assert.match(block('botInbox'), /members\.hasAll\(\[request\.auth\.uid, request\.resource\.data\.botId\]\)/);
  assert.match(block('botInbox'), /inboxQuotaOk\(\)/, 'inbox writes require a transaction-backed quota');
  assert.match(rules, /match \/botInboxRateLimits\/\{senderUid\}\/bots\/\{botId\}/);
  assert.match(rules, /duration\.value\(10, 's'\)/, 'inbox cooldown is enforced by Rules');
  assert.match(block('botInbox'), /keys\(\)\.hasOnly\(\['fromUid', 'botId', 'chatId', 'text', 'handled', 'createdAt'\]\)/);
});

test('comments can be switched off by staff and are enforced for everybody', () => {
  const posts = block('posts');
  assert.match(fn('userMayComment'), /commentsDisabled', false\) == false/);
  assert.match(fn('runnerMayComment'), /commentsDisabled', false\) == false/);
  assert.match(posts, /hasOnly\(\['hidden', 'commentsDisabled'\]\)/);
});

test('suspension is enforced on every write through notBanned()', () => {
  assert.match(fn('notBanned'), /!isBotRunner\(\)/);
  assert.match(fn('notBanned'), /suspendedUntil/);
  assert.match(fn('notBanned'), /request\.time/);
});

test('no approve / reject post system exists in rules', () => {
  assert.doesNotMatch(rules, /approv|reject/i);
});

test('admin logs: only as yourself, with your real role and server time; reactions only use known types', () => {
  const c = allows(block('adminLogs')).find((x) => x.ops.includes('create')).cond;
  assert.match(c, /actorUid == request\.auth\.uid/); assert.match(c, /role == roleOf\(\)/); assert.match(c, /createdAt == request\.time/); assert.match(c, /hasOnly\(\[/);
  assert.match(block('posts'), /\['like', 'love', 'haha', 'wow', 'sad', 'angry'\]/);
});

test('bot-runner can read ONLY private chats that include an AI bot (it must read them to answer)', () => {
  const chats = block('chats');
  assert.match(chats, /runnerMayReadChat\(resource\.data\)/);
  assert.match(chats, /runnerMayReadChat\(get\(.*?chats\/\$\(chatId\).*?\)\.data\)/s);
});
