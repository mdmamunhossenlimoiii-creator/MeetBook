// Regression tests for Bot Runner fail-closed gates and local throttles.
// These tests inspect the source; Firestore permission behavior is covered by the rules matrix + emulator.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runner = readFileSync(new URL('../scripts/bot-runner.mjs', import.meta.url), 'utf8');
const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const adminBots = readFileSync(new URL('../js/admin/bots.js', import.meta.url), 'utf8');

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
  assert.match(runner, /\|\| 0\) >= 15/);
  assert.match(runner, /Date\.now\(\) - lastChatAt < 60_000/);
  assert.match(runner, /st\.daily\.chatAt\[m\.fromUid\] = Date\.now\(\)/);
});

test('private chat message bodies are not copied into bot audit logs', () => {
  assert.match(runner, /await log\(bot, 'chat', m\.chatId, reply\.intent\)/);
  assert.doesNotMatch(runner, /await log\(bot, 'chat', m\.chatId, reply\.text\)/);
});

test('runner inbox and private chat access are limited to assigned bots', () => {
  assert.match(rules, /runnerHasBot\(resource\.data\.botId\)/);
  assert.match(rules, /function runnerMayReadChat\(chat\)/);
  assert.match(rules, /runnerMayActAs\(request\.resource\.data\.uid\)/);
});


test('Admin bot panel does not provide manual posting or commenting as a bot', () => {
  assert.doesNotMatch(adminBots, /Post as a bot|Comment as a bot|data-do="post"|data-do="comment"|postAsBot|commentAsBot/);
});
