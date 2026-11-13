// Regression tests for Bot Runner fail-closed gates and local throttles.
// These tests inspect the source; Firestore permission behavior is covered by the rules matrix + emulator.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runner = readFileSync(new URL('../scripts/bot-runner.mjs', import.meta.url), 'utf8');
const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const adminBots = readFileSync(new URL('../js/admin/bots.js', import.meta.url), 'utf8');
const rest = readFileSync(new URL('../scripts/lib/firestore-rest.mjs', import.meta.url), 'utf8');

test('runner fails closed unless global botsEnabled and its own allowlist are explicit', () => {
  assert.match(runner, /global\.botsEnabled !== true/);
  assert.match(runner, /runner\.enabled !== true/);
  assert.match(runner, /!Array\.isArray\(runner\.botIds\)/);
  assert.match(runner, /new Set\(runner\.botIds\.filter\(\(id\) => isBotId\(id\)\)\)/);
  assert.match(rules, /function runnerEnabled\(\)/);
  assert.match(rules, /function runnerMayActAs\(botUid\)/);
});

test('runner applies conservative per-bot and per-user limits', () => {
  assert.match(runner, /Math\.min\(12,/);
  assert.match(runner, /reserveBotAction/);
  assert.match(runner, /reserveChatReply/);
  assert.match(runner, /cooldownMs: 60_000/);
  assert.match(rest, /beginTransaction/);
  assert.match(rest, /currentDocument: current \? \{ updateTime: current\.updateTime \} : \{ exists: false \}/);
  assert.match(rules, /request\.resource\.data\.count == resource\.data\.count \+ 1/);
  assert.match(rules, /match \/botRateLimits\/bots\/\{botId\}/);
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

test('runner inbox and private chat access are limited to assigned bots', () => {
  assert.match(rules, /runnerHasBot\(resource\.data\.botId\)/);
  assert.match(rules, /function runnerMayReadChat\(chat\)/);
  assert.match(rules, /function runnerMayIncrementCommentCount\(postId\)/);
  assert.match(rules, /getAfter\(commentPath\)\.data\.get\('ai', false\) == true/);
  assert.match(rules, /function runnerMayReact\(\)/);
  assert.match(rules, /runnerMayActAs\(botUid\)/);
  assert.match(rules, /runnerMayActAs\(request\.resource\.data\.uid\)/);
});


test('Admin bot panel does not provide manual posting or commenting as a bot', () => {
  assert.doesNotMatch(adminBots, /Post as a bot|Comment as a bot|data-do="post"|data-do="comment"|postAsBot|commentAsBot/);
});

test('dry runs never call Gemini or print private reply text', () => {
  assert.match(runner, /const postText = DRY \? pick\.text : await generateSmartBotText/);
  assert.match(runner, /text: DRY \? baseComment\.text : await generateSmartBotText/);
  assert.match(runner, /const replyText = DRY \? reply\.text : await generateSmartBotText/);
  assert.match(runner, /private text and Gemini calls suppressed/);
  assert.doesNotMatch(runner, /\[dry\] chat reply as .*replyText/);
});


test('manual runner modes isolate one selected bot and prevent cross-mode actions', () => {
  assert.match(runner, /const MODE = process\.env\.BOT_RUNNER_MODE \|\| 'all'/);
  assert.match(runner, /\['all', 'post', 'chat'\]\.includes\(MODE\)/);
  assert.match(runner, /MODE !== 'all' && !SMART_BOT_IDS\.has\(RUNNER_BOT_ID\)/);
  assert.match(runner, /bot\.id === RUNNER_BOT_ID/);
  assert.match(runner, /if \(MODE !== 'chat'\)/);
  assert.match(runner, /if \(MODE === 'all' && nEngage > 0\)/);
  assert.match(runner, /if \(MODE !== 'post'\)/);
  assert.match(runner, /const CHAT_MAX_REPLIES = 1/);
  assert.match(runner, /\.slice\(0, CHAT_MAX_REPLIES\)/);
});

test('bot workflows are manual-only, default to dry-run, and require an explicit live gate', () => {
  const runnerWorkflow = readFileSync(new URL('../.github/workflows/bot-runner.yml', import.meta.url), 'utf8');
  const chatWorkflow = readFileSync(new URL('../.github/workflows/bot-chat.yml', import.meta.url), 'utf8');
  for (const workflow of [runnerWorkflow, chatWorkflow]) {
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
  assert.match(runnerWorkflow, /BOT_RUNNER_MODE: post/);
  assert.match(runnerWorkflow, /BOT_COMMENTS: "0"/);
  assert.match(chatWorkflow, /BOT_RUNNER_MODE: chat/);
  assert.match(runner, /const CHAT_MAX_REPLIES = 1/);
});
