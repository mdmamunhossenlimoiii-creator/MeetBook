import test from 'node:test';
import assert from 'node:assert/strict';
import { BOT_MEMORY_MAX_CHARS, BOT_MEMORY_MAX_MESSAGES, botMemoryDocId, memoryMessages, sanitizeBotMemory } from '../scripts/lib/bot-memory.mjs';

test('memory documents are isolated by bot and user identity', () => {
  assert.equal(botMemoryDocId('bot_01', 'user_A'), 'bot_01_user_A');
  assert.notEqual(botMemoryDocId('bot_01', 'user_A'), botMemoryDocId('bot_02', 'user_A'));
  assert.notEqual(botMemoryDocId('bot_01', 'user_A'), botMemoryDocId('bot_01', 'user_B'));
  assert.throws(() => botMemoryDocId('bot_99/other', 'user_A'));
  assert.throws(() => botMemoryDocId('bot_01', 'bad/path'));
});

test('memory summaries are sanitized and strictly bounded', () => {
  assert.equal(sanitizeBotMemory('  likes photography  '), 'likes photography');
  assert.equal(sanitizeBotMemory('x'.repeat(BOT_MEMORY_MAX_CHARS + 20)).length, BOT_MEMORY_MAX_CHARS);
  assert.equal(sanitizeBotMemory(null), '');
});

test('only six recent messages are included and each message is bounded', () => {
  const rows = memoryMessages(Array.from({length: 9}, (_, i) => ({uid: i % 2 ? 'bot_01' : 'u1', text: `m${i}`})));
  assert.equal(BOT_MEMORY_MAX_MESSAGES, 6);
  assert.equal(rows.length, 5);
  assert.equal(rows[0].text, 'm0');
  assert.equal(rows.at(-1).text, 'm8');
  assert.ok(rows.every((row) => row.speaker === 'User'));
  assert.equal(memoryMessages([{uid:'u1',text:'x'.repeat(700)}])[0].text.length, 500);
});
