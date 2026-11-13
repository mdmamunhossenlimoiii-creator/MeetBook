// The permission matrix for firestore.rules, written as DATA so that two different engines can run it:
//   1. tests/rules-matrix/matrix.test.mjs     -> our own rules interpreter (tests/rules-sim), runs everywhere, no network
//   2. tests/emulator/run.mjs                 -> the REAL Firebase Emulator (CI job "rules-emulator")
// Each capability lists the actors that MUST be allowed; every other actor MUST be denied.
// The expectations are written by hand from the security requirements, NOT generated from the rules.
//
// Value markers (translated by each engine):  {$srv:1} serverTimestamp / request.time   {$inc:n} increment(n)
//                                              {$del:1} deleteField()                    {$rel:ms} timestamp = now + ms

export const ACTORS = {
  anon: { uid: null, label: 'Not signed in' },
  user: { uid: 'u1', label: 'Normal user (u1)' },
  other: { uid: 'u2', label: 'Other normal user (u2)' },
  third: { uid: 'u3', label: 'Third normal user (u3)' },
  banned: { uid: 'ub', label: 'Blocked user' },
  suspended: { uid: 'us', label: 'Suspended user' },
  fresh: { uid: 'u_new', label: 'New user without profile yet' },
  moderator: { uid: 'mod', label: 'Moderator' },
  admin: { uid: 'adm', label: 'Admin' },
  super: { uid: 'sup', label: 'Super Admin' },
  legacy: { uid: 'leg', label: 'Old admin doc without role' },
  badrole: { uid: 'bad', label: 'Admin doc with unknown role' },
  runner: { uid: 'run', label: 'Bot runner (GitHub Action)' },
  runnerOff: { uid: 'runoff', label: 'Disabled bot runner' }
};
export const ROLE_LABEL = { moderator: 'moderator', admin: 'admin', super: 'super_admin' };

const SIGNED = Object.keys(ACTORS).filter((a) => a !== 'anon');
const ALL = Object.keys(ACTORS);
// signed in, has a profile, not blocked, not suspended: the people who may write normal content
const N = ['user', 'other', 'third', 'moderator', 'admin', 'super', 'legacy', 'badrole'];
const STAFF = ['moderator', 'admin', 'super'];
const ADM = ['admin', 'super'];
const pair = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);
const T = (ms) => ({ $rel: ms });

const user = (extra = {}) => ({ name: 'Some One', nameLower: 'some one', bio: '', photo: '', cover: '', banned: false, settings: {}, ...extra });
const post = (uid, extra = {}) => ({ uid, authorName: uid, text: 'hello', image: '', videoUrl: '', visibility: 'public', audience: [], groupId: null, reactions: {}, commentCount: 0, shareCount: 0, createdAt: T(-1000), ...extra });
const newPost = (uid, extra = {}) => ({ ...post(uid), createdAt: { $srv: 1 }, ...extra });

export const SEED = {
  'users/u1': user({ name: 'User One', settings: { allowBotEngagement: false } }),
  'users/u2': user({ name: 'User Two', settings: { allowBotEngagement: true, allowMessages: 'friends' } }),
  'users/u3': user({ name: 'User Three', settings: { allowMessages: 'friends', profileVisibility: 'friends', allowBotMemory: false } }),
  'publicProfiles/u1': { name: 'User One', nameLower: 'user one', bio: '', photo: '', cover: '', isBot: false, roleEmoji: '', verified: false, profileVisibility: 'everyone', createdAt: T(-1000) },
  'publicProfiles/u2': { name: 'User Two', nameLower: 'user two', bio: '', photo: '', cover: '', isBot: false, roleEmoji: '', verified: false, profileVisibility: 'friends', createdAt: T(-1000) },
  'publicProfiles/u3': { name: 'User Three', nameLower: 'user three', bio: 'Private bio', photo: '', cover: '', isBot: false, roleEmoji: '', verified: false, profileVisibility: 'friends', createdAt: T(-1000) },
  'publicProfiles/bot_01': { name: 'TechTip Nova', nameLower: 'techtip nova', bio: 'I am an AI bot.', photo: '', cover: '', isBot: true, roleEmoji: '🤖', verified: false, profileVisibility: 'everyone', createdAt: T(-1000) },
  'publicDirectory/u1': { name: 'User One', nameLower: 'user one', isBot: false, roleEmoji: '', verified: false },
  'publicDirectory/u2': { name: 'User Two', nameLower: 'user two', isBot: false, roleEmoji: '', verified: false },
  'publicDirectory/u3': { name: 'User Three', nameLower: 'user three', isBot: false, roleEmoji: '', verified: false },
  'botEngagement/u1': { allowBotEngagement: false, allowBotMemory: false },
  'botEngagement/u2': { allowBotEngagement: true, allowBotMemory: true },
  'botEngagement/u3': { allowBotEngagement: false, allowBotMemory: false },
  'botMemories/bot_01_u1': { ownerUid: 'u1', botId: 'bot_01', chatId: 'bot_01_u1', summary: 'Private test memory', createdAt: T(-1000), updatedAt: T(-1000) },
  'botMemories/bot_01_u2': { ownerUid: 'u2', botId: 'bot_01', chatId: 'bot_01_u2', summary: 'Likes photography', createdAt: T(-1000), updatedAt: T(-1000) },
  'friendships/u1_u2': { members: ['u1', 'u2'] },
  'users/ub': user({ name: 'Blocked User', banned: true }),
  'users/us': user({ name: 'Suspended User', suspendedUntil: T(3600e3) }),
  'users/mod': user({ name: 'Mod Person' }), 'users/adm': user({ name: 'Admin Person' }), 'users/adm2': user({ name: 'Second Admin' }),
  'users/sup': user({ name: 'Super Person' }), 'users/leg': user({ name: 'Legacy Admin' }), 'users/bad': user({ name: 'Badrole Admin' }),
  'users/bot_01': user({ name: 'TechTip Nova', isBot: true, bio: 'I am an AI bot.' }),
  'users/bot_02': user({ name: 'Pixel Pal', isBot: true, bio: 'I am an AI bot.' }),
  'users/runoff': user({ name: 'Disabled Runner' }),
  'admins/mod': { role: 'moderator' }, 'admins/adm': { role: 'admin' }, 'admins/adm2': { role: 'admin' }, 'admins/sup': { role: 'super_admin' },
  'admins/leg': { enabled: true }, 'admins/bad': { role: 'owner' },
  'botRunners/run': { enabled: true, botIds: ['bot_01', 'bot_03', 'bot_04', 'bot_05'] },
  'botRunners/runoff': { enabled: false, botIds: ['bot_01'] },
  'botState/run': { used: '{}' },
  'botState/runoff': { used: '{}' },
  'botRateLimits/run/bots/bot_01': { runnerUid: 'run', botId: 'bot_01', kind: 'botDaily', count: 1, windowStartedAt: T(-120000), lastAt: T(-120000) },
  'botRateLimits/run/bots/bot_03': { runnerUid: 'run', botId: 'bot_03', kind: 'botDaily', count: 12, windowStartedAt: T(-90000000), lastAt: T(-90000000) },
  'botRateLimits/run/bots/bot_05': { runnerUid: 'run', botId: 'bot_05', kind: 'botDaily', count: 12, windowStartedAt: T(-120000), lastAt: T(-120000) },
  'botRateLimits/run/bots/bot_05/users/u1': { runnerUid: 'run', botId: 'bot_05', actorUid: 'u1', kind: 'chatDaily', count: 15, windowStartedAt: T(-120000), lastAt: T(-120000) },
  'botRateLimits/run/bots/bot_01/users/u1': { runnerUid: 'run', botId: 'bot_01', actorUid: 'u1', kind: 'chatDaily', count: 1, windowStartedAt: T(-120000), lastAt: T(-120000) },
  'botInbox/i1': { fromUid: 'u1', botId: 'bot_01', text: 'hi', handled: false, chatId: 'bot_01_u1' },
  'botLogs/bl1': { botId: 'bot_01', kind: 'post', text: 'x' },
  'posts/p1': post('u1', { reactions: {} }),
  'posts/p2': post('u2', { reactions: { u1: 'like' } }),
  'posts/pb': post('bot_01'),
  'posts/pf': post('u1', { visibility: 'friends', audience: ['u1'] }),
  'posts/pn': post('u2', { commentsDisabled: true }),
  'posts/p1/comments/c1': { uid: 'u2', text: 'nice' },
  'posts/pf/comments/c1': { uid: 'u1', text: 'private' },
  'reports/r1': { kind: 'post', targetId: 'p1', targetUid: 'u1', reporterUid: 'u2', reason: 'Spam', details: '', status: 'open' },
  'adminLogs/l1': { actorUid: 'adm', actorName: 'Admin Person', role: 'admin', action: 'x', target: '', details: '' },
  'settings/global': { botsEnabled: true },
  'chats/u1_u2': { type: 'private', members: ['u1', 'u2'] },
  'chats/bot_01_u1': { type: 'private', members: ['bot_01', 'u1'] },
  'chats/bot_01_u2': { type: 'private', members: ['bot_01', 'u2'] },
  'chats/bot_03_u2': { type: 'private', members: ['bot_03', 'u2'] },
  'announcements/a1': { text: 'Welcome', active: true },
  'deletionRequests/dr1': { status: 'pending', requestedBy: 'sup' },
  'system/backups': { status: 'ok' },
  'chats/c_bot': { type: 'private', members: ['bot_01', 'u1'], lastMessage: { text: 'hi', uid: 'u1' }, lastRead: {} },
  'chats/c_bot/messages/m1': { uid: 'u1', text: 'hi' },
  'chats/c_uu': { type: 'private', members: ['u1', 'u2'], lastMessage: { text: 'yo', uid: 'u1' }, lastRead: {} },
  'chats/c_private_blocked': { type: 'private', members: ['u1', 'u3'], lastMessage: { text: 'hello', uid: 'u1' } },
  'chats/c_uu/messages/m1': { uid: 'u1', text: 'yo' },
  'notifications/n1': { to: 'u1', from: 'u2', type: 'comment', read: false },
  'groups/g1': { name: 'Photo Lovers', privacy: 'public', ownerUid: 'u1', members: ['u1'] },
  'reels/rl1': { uid: 'u2', videoUrl: 'https://x/y.mp4', caption: '', likes: {} },
  'stories/s1': { uid: 'u2', audience: ['u2'], expiresAt: T(3600e3) }
};

// [group, name, op, path, data|fn(actor)->data, allowedActors]
const C = [];
const cap = (group, name, op, path, data, allow) => C.push({ group, name, op, path, data, allow });

// ---------------------------------------------------------------- users
cap('Users', 'Read own private user document', 'get', 'users/u1', null, ['user', 'moderator', 'admin', 'super']);
cap('Users', 'Read another user private document', 'get', 'users/u2', null, ['other', 'moderator', 'admin', 'super']);
cap('Users', 'Read a bot user document', 'get', 'users/bot_01', null, SIGNED);
cap('Users', 'Read friend-only profile metadata (owner, friend and staff)', 'get', 'publicProfiles/u2', null, ['user', 'other', 'moderator', 'admin', 'super']);
cap('Users', 'Read another friend-only profile without friendship', 'get', 'publicProfiles/u3', null, ['third', 'moderator', 'admin', 'super']);
cap('Users', 'Read minimal public directory entry', 'get', 'publicDirectory/u3', null, SIGNED);
cap('Users', 'Read bot consent projection (owner, staff, active runner only)', 'get', 'botEngagement/u1', null, ['user', 'moderator', 'admin', 'super', 'runner']);
cap('Bot memory', 'Read own bot memory when consent is off', 'get', 'botMemories/bot_01_u1', null, ['user', 'moderator', 'admin', 'super']);
cap('Bot memory', 'Read another user bot memory only with owner consent and assigned runner', 'get', 'botMemories/bot_01_u2', null, ['other', 'moderator', 'admin', 'super', 'runner']);
cap('Bot memory', 'Create memory only for opted-in owner and assigned bot', 'create', 'botMemories/bot_03_u2', { ownerUid: 'u2', botId: 'bot_03', chatId: 'bot_03_u2', summary: 'Likes cooking', createdAt: { $srv: 1 }, updatedAt: { $srv: 1 } }, ['runner']);
cap('Bot memory', 'Update memory only for opted-in owner and assigned bot', 'update', 'botMemories/bot_01_u2', { summary: 'Likes street photography', updatedAt: { $srv: 1 } }, ['runner']);
cap('Bot memory', 'Owner may delete own memory', 'delete', 'botMemories/bot_01_u2', null, ['other', 'admin', 'super']);
cap('Bot memory', 'Other users cannot delete someone else memory', 'delete', 'botMemories/bot_01_u1', null, ['user', 'admin', 'super']);
cap('Users', 'Create own profile', 'create', 'users/u_new', { name: 'New Person', nameLower: 'new person', bio: '', photo: '', cover: '', banned: false, settings: {} }, ['fresh']);
cap('Users', 'Create own profile as blocked', 'create', 'users/u_new', { name: 'New Person', bio: '', banned: true }, []);
cap('Users', 'Create own profile as a bot', 'create', 'users/u_new', { name: 'New Person', bio: '', banned: false, isBot: true }, []);
cap('Users', 'Create own profile already verified', 'create', 'users/u_new', { name: 'New Person', bio: '', banned: false, verified: true }, []);
cap('Users', 'Edit the bio of a normal user (owner: u1)', 'update', 'users/u1', { bio: 'hello world' }, ['user', 'admin', 'super']);
cap('Users', 'Set valid messaging privacy preference', 'update', 'users/u1', { settings: { allowMessages: 'friends', profileVisibility: 'friends', defaultVisibility: 'friends', allowBotEngagement: false } }, ['user']);
cap('Users', 'Set invalid messaging privacy preference', 'update', 'users/u1', { settings: { allowMessages: 'anyone' } }, []);
cap('Users', 'Set invalid profile visibility preference', 'update', 'users/u1', { settings: { profileVisibility: 'private' } }, []);
cap('Users', 'Set non-boolean bot engagement consent', 'update', 'users/u1', { settings: { allowBotEngagement: 'yes' } }, []);
cap('Users', 'Moderator edits own bio (a super admin may too)', 'update', 'users/mod', { bio: 'hello' }, ['moderator', 'super']);
cap('Users', 'Admin edits own bio (a super admin may too)', 'update', 'users/adm', { bio: 'hello' }, ['admin', 'super']);
cap('Users', 'Super admin edits own bio (nobody else may)', 'update', 'users/sup', { bio: 'hello' }, ['super']);
cap('Users', 'Block a normal user', 'update', 'users/u1', { banned: true }, ADM);
cap('Users', 'Give a normal user the verified badge', 'update', 'users/u1', { verified: true }, ADM);
cap('Users', 'Suspend a normal user', 'update', 'users/u1', { suspendedUntil: T(86400e3) }, ['moderator', 'admin', 'super']);
cap('Users', 'Turn a normal user into a bot', 'update', 'users/u1', { isBot: true }, []);
cap('Users', 'Write a made-up "role" field on own profile (harmless: roles live in /admins only)', 'update', 'users/u1', { role: 'admin' }, ['user']);
cap('Users', 'Block another staff member (admin)', 'update', 'users/adm2', { banned: true }, ['super']);
cap('Users', 'Suspend another staff member', 'update', 'users/adm2', { suspendedUntil: T(86400e3) }, ['super']);
cap('Users', 'Edit another staff member\'s bio', 'update', 'users/adm2', { bio: 'x' }, ['super']);
cap('Users', 'Edit an AI bot profile', 'update', 'users/bot_01', { bio: 'I am an AI bot. New text.' }, ADM);
cap('Users', 'Turn an AI bot into a normal user', 'update', 'users/bot_01', { isBot: false }, []);
cap('Users', 'Create an AI bot profile', 'create', 'users/bot_05', { name: 'Bot Five', nameLower: 'bot five', bio: 'I am an AI bot.', banned: false, isBot: true }, ADM);
cap('Users', 'Create a non-bot profile for someone else', 'create', 'users/u7', { name: 'Seven', bio: '', banned: false }, []);
cap('Users', 'Delete an AI bot profile', 'delete', 'users/bot_01', null, ADM);
cap('Users', 'Delete a normal user profile from the client', 'delete', 'users/u2', null, []);
cap('Users', 'Write to own saved posts', 'create', 'users/u1/saved/p1', { createdAt: { $srv: 1 } }, ['user']);

// ---------------------------------------------------------------- staff
cap('Staff', 'Read own staff document (admin)', 'get', 'admins/adm', null, ['admin', 'super']);
cap('Staff', 'Read the super admin\'s staff document', 'get', 'admins/sup', null, ['super']);
cap('Staff', 'Read the old role-less staff document', 'get', 'admins/leg', null, ['legacy', 'super']);
const staffDoc = (a, role = 'moderator', extra = {}) => ({ role, addedBy: a.uid, addedAt: { $srv: 1 }, ...extra });
cap('Staff', 'Add a moderator', 'create', 'admins/u2', (a) => staffDoc(a), ['super']);
cap('Staff', 'Add staff with an unknown role', 'create', 'admins/u2', (a) => staffDoc(a, 'owner'), []);
cap('Staff', 'Add staff without a role', 'create', 'admins/u2', (a) => ({ addedBy: a.uid, addedAt: { $srv: 1 } }), []);
cap('Staff', 'Add staff with extra fields', 'create', 'admins/u2', (a) => staffDoc(a, 'admin', { enabled: true }), []);
cap('Staff', 'Add staff with a forged "addedBy"', 'create', 'admins/u2', () => ({ role: 'admin', addedBy: 'adm', addedAt: { $srv: 1 } }), []);
cap('Staff', 'Make an AI bot staff', 'create', 'admins/bot_02', (a) => staffDoc(a), []);
cap('Staff', 'Make a non-existing user staff', 'create', 'admins/ghost', (a) => staffDoc(a), []);
cap('Staff', 'Change an admin\'s role', 'update', 'admins/adm', (a) => staffDoc(a, 'moderator'), ['super']);
cap('Staff', 'Change own role (super admin)', 'update', 'admins/sup', (a) => staffDoc(a, 'admin'), []);
cap('Staff', 'Remove an admin', 'delete', 'admins/adm', null, ['super']);
cap('Staff', 'Remove the super admin', 'delete', 'admins/sup', null, []);

// ---------------------------------------------------------------- logs, settings, announcements, system
const logDoc = (a, extra = {}) => ({ actorUid: a.uid, actorName: 'x', role: ROLE_LABEL[a.name] || 'super_admin', action: 'post hidden', target: 'p1', details: '', createdAt: { $srv: 1 }, ...extra });
cap('Logs', 'Write an activity-log entry as yourself', 'create', 'adminLogs/new', logDoc, STAFF);
cap('Logs', 'Log with a role you do not have', 'create', 'adminLogs/new', (a) => logDoc(a, { role: 'super_admin' }), ['super']);
cap('Logs', 'Log with a back-dated time', 'create', 'adminLogs/new', (a) => logDoc(a, { createdAt: T(-86400e3) }), []);
cap('Logs', 'Log with extra fields', 'create', 'adminLogs/new', (a) => logDoc(a, { extra: 1 }), []);
cap('Logs', 'Log under the super admin\'s uid', 'create', 'adminLogs/new', (a) => logDoc(a, { actorUid: 'sup', role: 'super_admin' }), ['super']);
cap('Logs', 'Read the activity log', 'get', 'adminLogs/l1', null, ADM);
cap('Logs', 'Edit a log entry', 'update', 'adminLogs/l1', { action: 'nothing happened' }, []);
cap('Logs', 'Delete a log entry', 'delete', 'adminLogs/l1', null, []);
cap('Settings', 'Read global settings (needed before login)', 'get', 'settings/global', null, ALL);
cap('Settings', 'Turn on maintenance mode', 'update', 'settings/global', (a) => ({ maintenance: true, updatedBy: a.uid, updatedAt: { $srv: 1 } }), ADM);
cap('Settings', 'Write a non-boolean maintenance flag', 'update', 'settings/global', { maintenance: 'yes' }, []);
cap('Settings', 'Write an unknown settings field', 'update', 'settings/global', { hacked: 1 }, []);
cap('Settings', 'Create another settings document', 'create', 'settings/other', { maintenance: false }, []);
cap('Announcements', 'Read announcements', 'get', 'announcements/a1', null, SIGNED);
cap('Announcements', 'Publish an announcement', 'create', 'announcements/a2', { text: 'Hi all', level: 'info', active: true, createdAt: { $srv: 1 }, expiresAt: null }, ADM);
cap('Announcements', 'Publish a 600-character announcement', 'create', 'announcements/a2', { text: 'x'.repeat(600) }, []);
cap('Announcements', 'Switch an announcement off', 'update', 'announcements/a1', { active: false }, ADM);
cap('Announcements', 'Delete an announcement', 'delete', 'announcements/a1', null, ADM);
const delReq = (a, extra = {}) => ({ status: 'pending', requestedBy: a.uid, name: 'X', createdAt: { $srv: 1 }, ...extra });
cap('Deletion', 'Queue a permanent account deletion', 'create', 'deletionRequests/u2', (a) => delReq(a), ['super']);
cap('Deletion', 'Queue deletion of an admin', 'create', 'deletionRequests/adm2', (a) => delReq(a), []);
cap('Deletion', 'Queue deletion of an AI bot', 'create', 'deletionRequests/bot_01', (a) => delReq(a), []);
cap('Deletion', 'Queue deletion of yourself', 'create', 'deletionRequests/sup', (a) => delReq(a), []);
cap('Deletion', 'Queue a request that is already "done"', 'create', 'deletionRequests/u2', (a) => delReq(a, { status: 'done' }), []);
cap('Deletion', 'Queue a request with extra fields', 'create', 'deletionRequests/u2', (a) => delReq(a, { x: 1 }), []);
cap('Deletion', 'Read the deletion queue', 'get', 'deletionRequests/dr1', null, ['super']);
cap('Deletion', 'Edit a queued request', 'update', 'deletionRequests/dr1', { status: 'done' }, []);
cap('Deletion', 'Cancel a queued request', 'delete', 'deletionRequests/dr1', null, ['super']);
cap('System', 'Read backup status', 'get', 'system/backups', null, ['super']);
cap('System', 'Write backup status from the client', 'update', 'system/backups', { status: 'ok' }, []);

// ---------------------------------------------------------------- posts and comments
cap('Posts', 'Read a public post', 'get', 'posts/p1', null, SIGNED);
cap('Posts', 'Read a friends-only post of u1', 'get', 'posts/pf', null, ['user', ...STAFF]);
cap('Posts', 'Publish own post', 'create', 'posts/new', (a) => newPost(a.uid), N);
cap('Posts', 'Publish a post as someone else', 'create', 'posts/new', () => newPost('u1'), ['user']);
cap('Posts', 'Bot runner cannot publish as its own normal account', 'create', 'posts/new', () => newPost('run'), []);
cap('Posts', 'Publish a post as an AI bot', 'create', 'posts/new', () => newPost('bot_01'), ['runner']);
cap('Posts', 'Runner cannot publish as an unassigned bot', 'create', 'posts/new', () => newPost('bot_02'), []);
cap('Posts', 'Publish an AI-bot post with a video', 'create', 'posts/new', () => newPost('bot_01', { videoUrl: 'https://x/y.mp4' }), []);
cap('Posts', 'Publish a friends-only AI-bot post', 'create', 'posts/new', () => newPost('bot_01', { visibility: 'friends', audience: ['bot_01'] }), []);
cap('Posts', 'Publish a post as a real user via the admin/bot path', 'create', 'posts/new', () => newPost('u2'), ['other']);
cap('Posts', 'Hide a post', 'update', 'posts/p1', { hidden: true }, STAFF);
cap('Posts', 'Switch comments off on a post', 'update', 'posts/p1', { commentsDisabled: true }, STAFF);
cap('Posts', 'Edit the text of a post', 'update', 'posts/p1', { text: 'edited' }, []);
cap('Posts', 'Hide a post and edit its text together', 'update', 'posts/p1', { hidden: true, text: 'x' }, []);
cap('Posts', 'React to a post', 'update', 'posts/p1', (a) => ({ [`reactions.${a.uid}`]: 'like' }), N);
cap('Posts', 'React with an invalid reaction type', 'update', 'posts/p1', (a) => ({ [`reactions.${a.uid}`]: 'zzz' }), []);
cap('Posts', 'Add a reaction in somebody else\'s name', 'update', 'posts/p1', () => ({ 'reactions.u2': 'like' }), ['other']);
cap('Posts', 'Remove own reaction', 'update', 'posts/p2', { 'reactions.u1': { $del: 1 } }, ['user']);
cap('Posts', 'Count a comment (+1)', 'update', 'posts/p1', { commentCount: { $inc: 1 } }, N);
cap('Posts', 'Change the comment counter by 5', 'update', 'posts/p1', { commentCount: { $inc: 5 } }, []);
cap('Posts', 'Count a share (+1)', 'update', 'posts/p1', { shareCount: { $inc: 1 } }, N);
cap('Posts', 'Delete a post of u1', 'delete', 'posts/p1', null, ['user', ...STAFF]);
cap('Comments', 'Read comments of a public post', 'get', 'posts/p1/comments/c1', null, SIGNED);
cap('Comments', 'Read comments of a friends-only post', 'get', 'posts/pf/comments/c1', null, ['user', ...STAFF]);
cap('Comments', 'Comment on a public post', 'create', 'posts/p1/comments/new', (a) => ({ uid: a.uid, authorName: 'x', text: 'nice', createdAt: { $srv: 1 } }), N);
cap('Comments', 'Comment on a post where comments are off', 'create', 'posts/pn/comments/new', (a) => ({ uid: a.uid, authorName: 'x', text: 'nice' }), []);
cap('Comments', 'Comment on a friends-only post (u1 is the only audience)', 'create', 'posts/pf/comments/new', (a) => ({ uid: a.uid, authorName: 'x', text: 'nice' }), ['user']);
cap('Comments', 'Comment in somebody else\'s name', 'create', 'posts/p1/comments/new', () => ({ uid: 'u2', authorName: 'x', text: 'nice' }), ['other']);
cap('Comments', 'Comment with 3000 characters', 'create', 'posts/p1/comments/new', (a) => ({ uid: a.uid, authorName: 'x', text: 'x'.repeat(3000) }), []);
cap('Comments', 'Delete a comment (author u2, post owner u1)', 'delete', 'posts/p1/comments/c1', null, ['other', 'user', ...STAFF]);

// ---------------------------------------------------------------- AI bots and consent
const botComment = { uid: 'bot_01', authorName: 'TechTip Nova', text: 'Nice one.', ai: true, createdAt: { $srv: 1 } };
cap('AI bots', 'Bot comment on a post of a user who ALLOWED it (u2)', 'create', 'posts/p2/comments/new', botComment, ['runner']);
cap('AI bots', 'Runner cannot comment as an unassigned bot', 'create', 'posts/p2/comments/new', { ...botComment, uid: 'bot_02' }, []);
cap('AI bots', 'Bot comment WITHOUT the AI flag (must be refused for everyone)', 'create', 'posts/p2/comments/new', { ...botComment, ai: false }, []);
cap('AI bots', 'Bot comment with the AI flag missing entirely', 'create', 'posts/p2/comments/new', { uid: 'bot_01', authorName: 'TechTip Nova', text: 'Nice one.', createdAt: { $srv: 1 } }, []);
cap('AI bots', 'Bot comment on a post of a user who did NOT allow it (u1)', 'create', 'posts/p1/comments/new', botComment, []);
cap('AI bots', 'Bot comment on a friends-only post', 'create', 'posts/pf/comments/new', botComment, []);
cap('AI bots', 'Bot comment on a bot\'s post while bot-to-bot comments are OFF', 'create', 'posts/pb/comments/new', botComment, []);
cap('AI bots', 'Bot comment where comments are off (owner allowed)', 'create', 'posts/pn/comments/new', botComment, []);
cap('AI bots', 'Bot reaction on a post of a user who allowed it', 'update', 'posts/p2', { 'reactions.bot_01': 'love' }, ['runner']);
cap('AI bots', 'Runner cannot react as an unassigned bot', 'update', 'posts/p2', { 'reactions.bot_02': 'love' }, []);
cap('AI bots', 'Bot reaction on a post of a user who did NOT allow it', 'update', 'posts/p1', { 'reactions.bot_01': 'love' }, []);
cap('AI bots', 'Bot reaction on a friends-only post', 'update', 'posts/pf', { 'reactions.bot_01': 'love' }, []);
cap('AI bots', 'Bot reaction on a bot\'s post', 'update', 'posts/pb', { 'reactions.bot_01': 'love' }, ['runner']);
cap('AI bots', 'Runner writes a reaction under a human\'s key (u2)', 'update', 'posts/p2', { 'reactions.u2': 'wow' }, ['other']);
cap('AI bots', 'Runner raises commentCount on a consenting user\'s post', 'update', 'posts/p2', { commentCount: { $inc: 1 } }, [...N, 'runner']);
cap('AI bots', 'Runner raises commentCount on a non-consenting user\'s post', 'update', 'posts/p1', { commentCount: { $inc: 1 } }, N);
cap('AI bots', 'Runner pretends to be a human in a comment', 'create', 'posts/p2/comments/new', { uid: 'u1', text: 'hi' }, ['user']);
cap('AI bots', 'Read the bot inbox', 'get', 'botInbox/i1', null, [...STAFF, 'runner']);
cap('AI bots', 'Create inbox quota for a non-bot target', 'create', 'botInboxRateLimits/u1/bots/u2', { senderUid: 'u1', botId: 'u2', count: 1, windowStartedAt: { $srv: 1 }, lastAt: { $srv: 1 } }, []);
cap('AI bots', 'Send a message to a bot (inbox)', 'create', 'botInbox/new', (a) => ({ fromUid: a.uid, botId: 'bot_01', text: 'hello', handled: false, chatId: pair(a.uid, 'bot_01'), createdAt: { $srv: 1 } }), []);
cap('AI bots', 'Send an inbox message to a non-bot', 'create', 'botInbox/new', (a) => ({ fromUid: a.uid, botId: 'u2', text: 'hello', handled: false, chatId: pair(a.uid, 'u2'), createdAt: { $srv: 1 } }), []);
cap('AI bots', 'Send an inbox message already marked handled', 'create', 'botInbox/new', (a) => ({ fromUid: a.uid, botId: 'bot_01', text: 'hello', handled: true, chatId: pair(a.uid, 'bot_01') }), []);
cap('AI bots', 'Send inbox message without a matching private chat', 'create', 'botInbox/new', (a) => ({ fromUid: a.uid, botId: 'bot_01', text: 'hello', handled: false, chatId: 'missing-chat', createdAt: { $srv: 1 } }), []);
cap('AI bots', 'Mark an inbox message handled', 'update', 'botInbox/i1', { handled: true, handledAt: { $srv: 1 } }, [...ADM, 'runner']);
cap('AI bots', 'Write a bot activity log', 'create', 'botLogs/new', { botId: 'bot_01', botName: 'TechTip Nova', kind: 'post', targetId: 'p1', text: 'x', source: 'runner', createdAt: { $srv: 1 } }, [...ADM, 'runner']);
cap('AI bots', 'Read bot activity logs', 'get', 'botLogs/bl1', null, STAFF);
cap('AI bots', 'Edit a bot activity log', 'update', 'botLogs/bl1', { text: 'changed' }, []);
cap('AI bots', 'Delete a bot activity log', 'delete', 'botLogs/bl1', null, ADM);
cap('AI bots', 'Runner reserves its assigned bot daily quota', 'create', 'botRateLimits/run/bots/bot_04', { runnerUid: 'run', botId: 'bot_04', kind: 'botDaily', count: 1, windowStartedAt: { $srv: 1 }, lastAt: { $srv: 1 } }, ['runner']);
cap('AI bots', 'Runner cannot reserve quota for an unassigned bot', 'create', 'botRateLimits/run/bots/bot_02', { runnerUid: 'run', botId: 'bot_02', kind: 'botDaily', count: 1, windowStartedAt: { $srv: 1 }, lastAt: { $srv: 1 } }, []);
cap('AI bots', 'Runner increments bot quota by exactly one', 'update', 'botRateLimits/run/bots/bot_01', { count: 2, lastAt: T(0) }, ['runner']);
cap('AI bots', 'Runner cannot jump bot quota count', 'update', 'botRateLimits/run/bots/bot_01', { count: 12, lastAt: T(0) }, []);
cap('AI bots', 'Runner resets bot quota after full 24-hour window', 'update', 'botRateLimits/run/bots/bot_03', { count: 1, windowStartedAt: T(0), lastAt: T(0) }, ['runner']);
cap('AI bots', 'Runner cannot reset bot quota before 24 hours', 'update', 'botRateLimits/run/bots/bot_03', { count: 1, windowStartedAt: T(-30000000), lastAt: T(0) }, []);
cap('AI bots', 'Runner cannot exceed 12 actions per rolling 24 hours', 'update', 'botRateLimits/run/bots/bot_05', { count: 13, lastAt: T(0) }, []);
cap('AI bots', 'Runner cannot exceed 15 replies per user per bot per rolling 24 hours', 'update', 'botRateLimits/run/bots/bot_05/users/u1', { count: 16, lastAt: T(0) }, []);
cap('AI bots', 'Runner reserves a per-user chat quota', 'create', 'botRateLimits/run/bots/bot_04/users/u1', { runnerUid: 'run', botId: 'bot_04', actorUid: 'u1', kind: 'chatDaily', count: 1, windowStartedAt: { $srv: 1 }, lastAt: { $srv: 1 } }, ['runner']);
cap('AI bots', 'Runner cannot bypass the 60-second chat cooldown', 'update', 'botRateLimits/run/bots/bot_01/users/u1', { count: 2, lastAt: T(-90000) }, []);
cap('AI bots', 'Runner may reserve chat quota after cooldown', 'update', 'botRateLimits/run/bots/bot_01/users/u1', { count: 2, lastAt: T(0) }, ['runner']);
cap('AI bots', 'Read the runner state', 'get', 'botState/run', null, ['runner']);
cap('AI bots', 'Disabled runner cannot read state', 'get', 'botState/runoff', null, []);
cap('AI bots', 'Only an enabled runner can publish as an assigned bot', 'create', 'posts/new', () => newPost('bot_01'), ['runner']);
cap('AI bots', 'Write the runner state', 'update', 'botState/run', { used: '{"bot_01":["en:0"]}' }, ['runner']);
cap('AI bots', 'Read the runner registration', 'get', 'botRunners/run', null, ['runner']);
cap('AI bots', 'Register a new bot runner', 'create', 'botRunners/u1', { enabled: true }, []);

// ---------------------------------------------------------------- chats (bot replies)
cap('Chats', 'Open a chat between u1 and a bot', 'get', 'chats/c_bot', null, ['user', 'runner']);
cap('Chats', 'Open a chat between two people', 'get', 'chats/c_uu', null, ['user', 'other']);
cap('Chats', 'Read messages of the bot chat', 'get', 'chats/c_bot/messages/m1', null, ['user', 'runner']);
cap('Chats', 'Read messages between two people', 'get', 'chats/c_uu/messages/m1', null, ['user', 'other']);
cap('Chats', 'Reply as the bot in the bot chat WITHOUT the AI flag', 'create', 'chats/c_bot/messages/new', { uid: 'bot_01', text: 'Hello.', image: '', ai: false, createdAt: { $srv: 1 } }, []);
cap('Chats', 'Reply as the bot in the bot chat', 'create', 'chats/c_bot/messages/new', { uid: 'bot_01', text: 'Hello, I am an AI bot.', image: '', ai: true, createdAt: { $srv: 1 } }, ['runner']);
cap('Chats', 'Reply as a bot in a chat between two people', 'create', 'chats/c_uu/messages/new', { uid: 'bot_01', text: 'hi', createdAt: { $srv: 1 } }, []);
cap('Chats', 'Runner writes as u1 in the bot chat', 'create', 'chats/c_bot/messages/new', { uid: 'u1', text: 'hi' }, ['user']);
cap('Chats', 'Write a message in a chat between two people', 'create', 'chats/c_uu/messages/new', (a) => ({ uid: a.uid, text: 'hi', createdAt: { $srv: 1 } }), ['user', 'other']);
cap('Chats', 'Message a friends-only recipient without friendship', 'create', 'chats/c_private_blocked/messages/new', (a) => ({ uid: a.uid, text: 'hi', createdAt: { $srv: 1 } }), []);
cap('Chats', 'Open a new private chat with a friends-only recipient without friendship', 'create', 'chats/new_private', () => ({ type: 'private', members: ['u1', 'u3'], createdBy: 'u1' }), []);
cap('Chats', 'Update the last-message preview of the bot chat', 'update', 'chats/c_bot', (a) => ({ lastMessage: { text: 'x', uid: a.name === 'runner' ? 'bot_01' : a.uid }, lastAt: { $srv: 1 }, ...(a.name === 'runner' ? {} : { lastRead: { [a.uid]: { $srv: 1 } } }) }), ['user', 'runner']);
cap('Chats', 'Update the preview of a chat between two people', 'update', 'chats/c_uu', (a) => ({ lastMessage: { text: 'x', uid: a.uid }, lastAt: { $srv: 1 }, lastRead: { [a.uid]: { $srv: 1 } } }), ['user', 'other']);
cap('Notifications', 'Notify another user', 'create', 'notifications/new', (a) => ({ to: 'u2', from: a.uid, fromName: 'Test sender', type: 'comment', postId: null, extra: null, read: false, createdAt: { $srv: 1 } }), N.filter((x) => x !== 'other'));
cap('Notifications', 'Notify as an AI bot', 'create', 'notifications/new', { to: 'u1', from: 'bot_01', fromName: 'TechTip Nova', type: 'comment', postId: null, extra: null, read: false, createdAt: { $srv: 1 } }, ['runner']);
cap('Notifications', 'Notify in somebody else\'s name', 'create', 'notifications/new', (a) => ({ to: 'u2', from: a.name === 'user' ? 'u2' : 'u1', fromName: 'Forged sender', type: 'comment', postId: null, extra: null, read: false, createdAt: { $srv: 1 } }), []);
cap('Notifications', 'Read, mark read and delete own notification', 'get', 'notifications/n1', null, ['user']);
cap('Notifications', 'Mark own notification as read', 'update', 'notifications/n1', { read: true }, ['user']);

// ---------------------------------------------------------------- reports and moderation of other content
const report = (a, extra = {}) => ({ kind: 'post', targetId: 'p1', targetUid: 'u1', reporterUid: a.uid, reason: 'Spam', details: 'x', status: 'open', createdAt: { $srv: 1 }, ...extra });
cap('Reports', 'File a report', 'create', 'reports/new', (a) => report(a), N);
cap('Reports', 'File a report in somebody else\'s name', 'create', 'reports/new', (a) => report(a, { reporterUid: 'u1' }), ['user']);
cap('Reports', 'File a report that is already resolved', 'create', 'reports/new', (a) => report(a, { status: 'resolved' }), []);
cap('Reports', 'Read a report', 'get', 'reports/r1', null, STAFF);
const resolve = (a, extra = {}) => ({ status: 'resolved', action: 'dismissed', resolvedBy: a.uid, resolvedAt: { $srv: 1 }, ...extra });
cap('Reports', 'Resolve or dismiss a report', 'update', 'reports/r1', (a) => resolve(a), STAFF);
cap('Reports', 'Resolve a report in somebody else\'s name', 'update', 'reports/r1', (a) => resolve(a, { resolvedBy: 'sup' }), ['super']);
cap('Reports', 'Edit other fields of a report', 'update', 'reports/r1', (a) => resolve(a, { targetUid: 'x' }), []);
cap('Reports', 'Delete a report', 'delete', 'reports/r1', null, ADM);
cap('Groups, reels, stories', 'Delete a group (owner u1)', 'delete', 'groups/g1', null, ['user', ...STAFF]);
cap('Groups, reels, stories', 'Delete a reel (owner u2)', 'delete', 'reels/rl1', null, ['other', ...STAFF]);
cap('Groups, reels, stories', 'Delete a story (owner u2)', 'delete', 'stories/s1', null, ['other', ...STAFF]);

export const CAPS = C;
