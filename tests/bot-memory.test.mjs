import test from 'node:test';
import assert from 'node:assert/strict';
import { BOT_MEMORY_MAX_CHARS, BOT_MEMORY_MAX_MESSAGES, botMemoryDocId, memoryMessages, sanitizeBotMemory } from '../scripts/lib/bot-memory.mjs';
import { updateSmartBotMemory } from '../scripts/lib/gemini.mjs';

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
  assert.equal(sanitizeBotMemory('Contact me at limon@example.com or +1 202 555 0188'), 'Contact me at [redacted] or [redacted]');
  assert.equal(sanitizeBotMemory('User has diabetes and takes medication.'), '');
});

test('only six recent messages are included and each message is bounded', () => {
  const rows = memoryMessages(Array.from({length: 9}, (_, i) => ({uid: i % 2 ? 'bot_01' : 'u1', text: 'm' + i})));
  assert.equal(BOT_MEMORY_MAX_MESSAGES, 6);
  assert.equal(rows.length, 5);
  assert.equal(rows[0].text, 'm0');
  assert.equal(rows.at(-1).text, 'm8');
  assert.ok(rows.every((row) => row.speaker === 'User'));
  assert.equal(memoryMessages([{uid:'u1',text:'x'.repeat(700)}])[0].text.length, 500);
});

test('memory input redacts contact details and excludes sensitive topics', () => {
  const safe = memoryMessages([{ uid: 'u1', text: 'I enjoy photography. Contact limon@example.com or +1 202 555 0188.' }]);
  assert.equal(safe.length, 1);
  assert.equal(safe[0].text, 'I enjoy photography. Contact [redacted] or [redacted].');

  const sensitive = [
    'My password is secret123 and my one-time code is 123456.',
    'My bank account number and credit card details are private.',
    'I have diabetes and take medication from my doctor.',
    'My religious belief and political affiliation are personal.',
    'My home address is 12 Example Road and my GPS coordinates are private.',
    'My sexual orientation and gender identity are personal.',
    'My passport number and date of birth are private.',
    'I have a fever and need medical advice.',
    'I am Muslim and my prayer routine is personal.',
    'I live at a specific address in the city.',
    'আমার পাসওয়ার্ড এবং ওটিপি কাউকে বলবেন না।',
    'আমার বাড়ির ঠিকানা এবং জাতীয় পরিচয়পত্রের তথ্য ব্যক্তিগত।'
  ];
  for (const text of sensitive) {
    assert.equal(memoryMessages([{ uid: 'u1', text }]).length, 0, text);
    assert.equal(sanitizeBotMemory(text), '', text);
  }
});

test('memory summarization skips Gemini when recent messages contain only sensitive details', async () => {
  let called = false;
  const result = await updateSmartBotMemory({
    bot: { id: 'bot_01' }, existingSummary: 'Likes photography.',
    messages: [{ uid: 'u1', text: 'My bank account number is private.' }],
    apiKey: 'test-key', fetchImpl: async () => { called = true; }
  });
  assert.equal(result, 'Likes photography.');
  assert.equal(called, false);
});

test('sensitive model output is discarded instead of persisted as memory', async () => {
  const result = await updateSmartBotMemory({
    bot: { id: 'bot_02' }, messages: [{ uid: 'u1', text: 'I enjoy photography.' }],
    apiKey: 'test-key',
    fetchImpl: async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'User has diabetes and takes medication.' }] } }] }) })
  });
  assert.equal(result, '');
});
