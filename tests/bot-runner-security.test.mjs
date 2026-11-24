// Regression tests for Bot Runner fail-closed gates and local throttles.
// These tests inspect the source; Firestore permission behavior is covered by the rules matrix + emulator.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const runner = readFileSync(new URL('../scripts/bot-runner.mjs', import.meta.url), 'utf8');
const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const adminBots = readFileSync(new URL('../js/admin/bots.js', import.meta.url), 'utf8');
const adminSettings = readFileSync(new URL('../js/admin/settings.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const auth = readFileSync(new URL('../js/auth.js', import.meta.url), 'utf8');
const rest = readFileSync(new URL('../scripts/lib/firestore-rest.mjs', import.meta.url), 'utf8');
const postWorkflow = readFileSync(new URL('../.github/workflows/bot-runner.yml', import.meta.url), 'utf8');

test('runner fails closed unless global botsEnabled and its own allowlist are explicit', () => {
  assert.match(runner, /global\.botsEnabled !== true/);
  assert.match(runner, /runner\.enabled !== true/);
  assert.match(runner, /!Array\.isArray\(runner\.botIds\)/);
  assert.match(runner, /new Set\(runner\.botIds\.filter\(\(id\) => isBotId\(id\)\)\)/);
  assert.match(rules, /function runnerEnabled\(\)/);
  assert.match(rules, /function runnerMayActAs\(botUid\)/);
});

test('Runner skips mismatched built-in role metadata and uses canonical emoji/personality/topics', () => {
  assert.match(runner, /botProfileRoleIssues\(d\.id, d\)/);
  assert.match(runner, /stored role metadata mismatch/);
  assert.match(runner, /Owner review is required; the profile was not changed/);
  assert.match(runner, /roleEmoji: base\.roleEmoji/);
  assert.match(runner, /personality: base\.personality/);
  assert.match(runner, /interests: \[\.\.\.base\.interests\]/);
  assert.equal(runner.includes('fs.patch(`users/${d.id}'), false, 'role audit must never rewrite live bot profiles');
});

test('Runner persists bot post fingerprints before publishing and serializes bot automation', () => {
  assert.match(runner, /postHashes: \(Array\.isArray\(parse\(d\.postHashes, \[\]\)\)/);
  assert.match(runner, /postedTexts: \(Array\.isArray\(parse\(d\.postedTexts, \[\]\)\)/);
  assert.match(runner, /createHash\('sha256'\)/);
  assert.match(runner, /const MAX_POST_HASHES = 4000/);
  assert.match(runner, /postHashes: JSON\.stringify\(st\.postHashes\.slice\(-MAX_POST_HASHES\)\)/);
  assert.match(runner, /\.filter\(\(value\) => typeof value === 'string' && \/\^\[a-f0-9\]\{64\}\$\/\.test\(value\)\)\.slice\(-MAX_POST_HASHES\)/);
  assert.match(runner, /isDuplicatePostText\(postText, st\.postedTexts\)/);
  assert.match(runner, /st\.postHashes\.push\(fingerprint\)/);
  assert.match(runner, /if \(!DRY\) await saveState\(st\);\s*const id = await createPost/s);
  assert.match(postWorkflow, /concurrency:/);
  assert.match(postWorkflow, /group: meetbook-bot-automation/);
  assert.match(postWorkflow, /cancel-in-progress: false/);
});

test('Runner, Rules, and Admin use settings/overall and strict Boolean gates', () => {
  assert.ok(runner.includes("fs.get('settings/overall')"));
  assert.ok(!runner.includes('settings/global'));
  assert.ok(runner.includes('global.botsEnabled !== true'));
  assert.ok(runner.includes('runner.enabled !== true'));
  assert.ok(rules.includes('/documents/settings/overall'));
  assert.ok(!rules.includes('/documents/settings/global'));
  assert.ok(adminBots.includes("doc(db, 'settings', 'overall')"));
  assert.ok(!adminBots.includes('settings/global'));
  assert.ok(adminSettings.includes("doc(db, 'settings', 'overall')"));
  assert.ok(adminSettings.includes('s.botsEnabled === true'));
  assert.ok(app.includes("doc(db, 'settings', 'overall')"));
  assert.ok(auth.includes("doc(db, 'settings', 'overall')"));
  assert.ok(!app.includes("doc(db, 'settings', 'global')"));
  assert.ok(!auth.includes("doc(db, 'settings', 'global')"));
});

test('runner applies conservative per-bot and per-user limits', () => {
  assert.match(runner, /Math\.min\(12,/);
  assert.match(runner, /reserveBotAction/);
  assert.match(runner, /GLOBAL_DAILY_ACTION_LIMIT = 60/);
  assert.match(runner, /GEMINI_DAILY_REQUEST_LIMIT = 60/);
  assert.match(runner, /reserveQuota\('botGlobalRateLimits\/global'/);
  assert.match(runner, /reserveQuota\('botGeminiRateLimits\/global'/);
  assert.match(runner, /Gemini daily request budget reached/);
  assert.match(runner, /reserveChatReply/);
  assert.match(runner, /cooldownMs: 60_000/);
  assert.match(rest, /beginTransaction/);
  assert.match(rest, /currentDocument: current \? \{ updateTime: current\.updateTime \} : \{ exists: false \}/);
  assert.match(rules, /request\.resource\.data\.count == resource\.data\.count \+ 1/);
  assert.match(rules, /match \/botRateLimits\/\{botId\}/);
  assert.doesNotMatch(rules, /match \/botRateLimits\/\{runnerUid\}/, 'bot quotas must not be partitioned by Runner UID');
  assert.match(rules, /duration\.value\(60, 's'\)/);
  assert.match(rest, /86_400_000/);
  assert.match(rules, /duration\.value\(1, 'd'\)/);
  assert.match(rules, /d\.count <= 20/);
  assert.match(rules, /duration\.value\(10, 's'\)/);
});

test('private chat message bodies are not copied into bot audit logs', () => {
  assert.match(runner, /await log\(bot, 'chat', m\.chatId, reply\.intent\)/);
  assert.doesNotMatch(runner, /await log\(bot, 'chat', m\.chatId, reply\.text\)/);
});

test('blocked or suspended chat requests are skipped without aborting other eligible bot work', () => {
  assert.match(runner, /const isPermissionDenied =/);
  assert.match(runner, /bots\.filter\(\(b\) => b\.active === true && b\.chatEnabled === true\)/);
  assert.match(runner, /if \(isPermissionDenied\(error\)\)/);
  assert.match(runner, /await mark\('not-eligible'\)/);
  assert.match(runner, /message-not-found/);
  assert.match(rules, /function eligibleHumanForBotInteraction\(uid\)/);
  assert.match(rules, /eligibleHumanForBotInteraction\(userUid\)/);
});

test('dry-run never reads persisted optional bot memory', () => {
  assert.match(runner, /if \(!DRY && memoryEnabled\)/);
});

test('optional memory permission failures do not abort the chat runner', () => {
  assert.match(runner, /const isPermissionDenied = [\s\S]*?403[\s\S]*?PERMISSION_DENIED/);
  assert.match(runner, /if \(!isPermissionDenied\(error\)\) throw error;[\s\S]*Saved bot memory was unavailable; continuing without it\./);
});

test('private inbox stores only message IDs and reads message bodies after chat eligibility', () => {
  assert.match(rules, /request\.resource\.data\.keys\(\)\.hasOnly\(\['fromUid', 'botId', 'chatId', 'messageId', 'schemaVersion', 'handled', 'createdAt'\]\)/);
  assert.match(rules, /function inboxMessageOk\(\)/);
  assert.match(rules, /function validInboxMetadata\(d\)/);
  assert.match(runner, /eq\('schemaVersion', 2\)/);
  assert.match(runner, /const messageId = typeof m\.messageId === 'string'/);
  assert.match(runner, /userMessage = await fs\.get\(\`chats\/\$\{m\.chatId\}\/messages\/\$\{messageId\}\`\)/);
  assert.ok(runner.indexOf('chat = await fs.get') < runner.indexOf('userMessage = await fs.get'),
    'the private chat eligibility gate must run before the message body is fetched');
});

test('runner inbox and private chat access are limited to assigned bots', () => {
  assert.match(rules, /runnerMayChatAs\(resource\.data\.botId\)/);
  assert.match(rules, /function runnerMayReadChat\(chat\)/);
  assert.match(rules, /function runnerMayIncrementCommentCount\(postId\)/);
  assert.match(rules, /getAfter\(commentPath\)\.data\.get\('ai', false\) == true/);
  assert.match(rules, /function runnerMayReact\(\)/);
  assert.match(rules, /runnerMayActAs\(botUid\)/);
  assert.match(rules, /runnerMayCommentAs\(request\.resource\.data\.uid\)/);
  assert.match(rules, /runnerMayChatAs\(request\.resource\.data\.uid\)/);
});


test('Admin bot panel does not provide manual posting or commenting as a bot', () => {
  assert.doesNotMatch(adminBots, /Post as a bot|Comment as a bot|data-do="post"|data-do="comment"|postAsBot|commentAsBot/);
});

test('dry runs never call Gemini or print private reply text', () => {
  assert.match(runner, /let postText = DRY \? pick\.text : await generateText/);
  assert.match(runner, /text: DRY \? baseComment\.text : await generateText/);
  assert.match(runner, /const replyText = DRY \? reply\.text : await generateText/);
  assert.match(runner, /private text and Gemini calls suppressed/);
  assert.doesNotMatch(runner, /\[dry\] chat reply as .*replyText/);
});


test('manual runner modes isolate one selected bot and prevent cross-mode actions', () => {
  assert.match(runner, /const MODE = process\.env\.BOT_RUNNER_MODE \|\| 'all'/);
  assert.match(runner, /\['all', 'post', 'engage', 'chat'\]\.includes\(MODE\)/);
  assert.match(runner, /MODE !== 'all' && !isBotId\(RUNNER_BOT_ID\)/);
  assert.match(runner, /bot\.id === RUNNER_BOT_ID/);
  assert.match(runner, /if \(MODE !== 'chat'\)/);
  assert.match(runner, /if \(MODE !== 'engage'\)/);
  assert.match(runner, /if \(\(MODE === 'all' \|\| MODE === 'engage'\) && nEngage > 0\)/);
  assert.match(runner, /if \(MODE !== 'post' && MODE !== 'engage'\)/);
  assert.match(runner, /const CHAT_MAX_REPLIES = 1/);
  assert.match(runner, /uid: bot\.id, authorName: bot\.name, text, ai: true/);
  assert.match(rules, /request\.resource\.data\.get\('ai', false\) == true/);
  assert.match(runner, /\.filter\(\(x\) => x\.score > 0\)/);
  assert.match(runner, /\.slice\(0, CHAT_MAX_REPLIES\)/);
});

test('bot workflows are manual-only, default to dry-run, and require an explicit live gate', () => {
  const runnerWorkflow = readFileSync(new URL('../.github/workflows/bot-runner.yml', import.meta.url), 'utf8');
  const engagementWorkflow = readFileSync(new URL('../.github/workflows/bot-engagement.yml', import.meta.url), 'utf8');
  const chatWorkflow = readFileSync(new URL('../.github/workflows/bot-chat.yml', import.meta.url), 'utf8');
  for (const workflow of [runnerWorkflow, engagementWorkflow, chatWorkflow]) {
    assert.match(workflow, /workflow_dispatch:/);
    assert.match(workflow, /default: true/);
    assert.match(workflow, /confirm_live:/);
    assert.match(workflow, /default: false/);
    assert.match(workflow, /environment: meetbook-bot-live/);
    assert.match(workflow, /BOT_LIVE_TEST_APPROVED/);
    assert.match(workflow, /BOT_RUNNER_EXPECTED_PROJECT_ID/);
    assert.match(workflow, /GEMINI_STRICT:/);
    assert.doesNotMatch(workflow, /schedule:|pull_request:|push:/);
  }
  assert.match(runnerWorkflow, /options: \[bot_01, bot_02, bot_03, bot_04, bot_05, bot_06, bot_07, bot_08, bot_09, bot_10, bot_11, bot_12, bot_13, bot_14, bot_15, bot_16, bot_17, bot_18, bot_19, bot_20, bot_21, bot_22, bot_23\]/);
  assert.match(chatWorkflow, /options: \[bot_01, bot_02, bot_03, bot_04, bot_05, bot_06, bot_07, bot_08, bot_09, bot_10, bot_11, bot_12, bot_13, bot_14, bot_15, bot_16, bot_17, bot_18, bot_19, bot_20, bot_21, bot_22, bot_23\]/);
  assert.match(runnerWorkflow, /BOT_RUNNER_MODE: post/);
  assert.match(engagementWorkflow, /BOT_RUNNER_MODE: engage/);
  assert.match(engagementWorkflow, /BOT_POSTS: "0"/);
  assert.match(engagementWorkflow, /BOT_COMMENTS: "1"/);
  assert.match(runnerWorkflow, /BOT_COMMENTS: "0"/);
  assert.match(chatWorkflow, /BOT_RUNNER_MODE: chat/);
  assert.match(runner, /const CHAT_MAX_REPLIES = 1/);
});


test('Admin, Runner, and Firestore Rules treat missing bot switches as OFF', () => {
  assert.match(adminBots, /const botsOn = site\.botsEnabled === true/);
  assert.match(adminBots, /const next = site\.botsEnabled !== true/);
  assert.match(adminBots, /data-do=\"toggle\"/);
  assert.match(adminBots, /data-do=\"delete\"/);
  assert.doesNotMatch(adminBots, /data-do=\"edit\"/);
  assert.doesNotMatch(adminBots, /tog\('auto(?:Post|Comment|Reaction)'/);
  assert.doesNotMatch(adminBots, /tog\('chatEnabled'/);
  assert.doesNotMatch(adminBots, /b-lim/);
  assert.match(adminBots, /v\[k\] === true \? 'checked' : ''/);
  assert.match(runner, /bot\.active === true/);
  assert.match(runner, /b\.autoPost === true/);
  assert.match(runner, /b\.autoComment === true/);
  assert.match(runner, /bot\.autoReaction === true/);
  assert.match(runner, /b\.chatEnabled === true/);
  assert.match(runner, /Activation blocked: settings\/overall document is missing/);
  assert.match(rules, /bot\.get\('active', false\) == true/);
  assert.match(rules, /get\('chatEnabled', false\) == true/);
  assert.match(rules, /get\('active', false\) == true/);
  assert.doesNotMatch(rules, /get\('active', true\) == true/);
  assert.doesNotMatch(rules, /get\('chatEnabled', true\) == true/);
  assert.match(rules, /get\('autoPost', false\) == true/);
  assert.match(rules, /get\('autoComment', false\) == true/);
  assert.match(rules, /get\('autoReaction', false\) == true/);
});

 
test('bot workflows remain manual-only and no scheduled automation is present', () => {
  const policy = readFileSync(new URL('../WORKFLOWS.md', import.meta.url), 'utf8');
  const setup = readFileSync(new URL('../BOT_WORKFLOW_SETUP.md', import.meta.url), 'utf8');
  assert.equal(existsSync(new URL('../.github/workflows/bot-scheduled-social.yml', import.meta.url)), false);
  assert.equal(existsSync(new URL('../.github/workflows/bot-scheduled-chat.yml', import.meta.url)), false);
  assert.match(policy, /bot workflows manual-only with no schedule, push, or pull-request trigger/i);
  assert.match(setup, /No scheduled or unattended bot workflows are included/i);
});

 
test('runner uses stable workflow IDs and bounds bot-to-bot discussion', () => {
  assert.match(runner, /process\.env\.GITHUB_RUN_ID/);
  assert.match(runner, /const BOT_TO_BOT_MAX_TURNS = 2/);
  assert.match(runner, /replyMessageId = .*m\.id/);
  assert.match(runner, /post_\$\{bot\.id\}_\$\{RUN_ID\}/);
  assert.match(runner, /if \(await fs\.get\(commentPath\)\)/);
  assert.match(runner, /duplicate reply prevented/i);
  assert.match(runner, /existingComments\.filter\(\(comment\) => comment\.ai === true && isBotId\(comment\.uid\)\)/);
});
