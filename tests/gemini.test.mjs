import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_GEMINI_MODEL, SMART_BOT_IDS, generateSmartBotText, updateSmartBotMemory } from '../scripts/lib/gemini.mjs';

const bot = (id = 'bot_01') => ({ id });
test('only the first three bots are routed to Gemini', () => {
  assert.deepEqual([...SMART_BOT_IDS], ['bot_01', 'bot_02', 'bot_03']);
  assert.equal(DEFAULT_GEMINI_MODEL, 'gemini-3.8-flash');
});
test('missing API key safely uses the existing fallback', async () => {
  assert.equal(await generateSmartBotText({ bot: bot(), kind: 'chat', source: 'hello', fallback: 'fallback', apiKey: '' }), 'fallback');
});
test('other bots never call Gemini', async () => {
  let called = false;
  const result = await generateSmartBotText({ bot: bot('bot_04'), kind: 'chat', source: 'hello', fallback: 'template', apiKey: 'test', fetchImpl: async () => { called = true; } });
  assert.equal(result, 'template'); assert.equal(called, false);
});
test('uses the selected model and keeps the API key in a header', async () => {
  let captured;
  const result = await generateSmartBotText({
    bot: bot('bot_02'), kind: 'comment', source: 'A sunset photo', fallback: 'fallback', apiKey: 'secret-test-key',
    fetchImpl: async (url, options) => { captured = { url, options }; return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'Lovely light and composition.' }] } }] }) }; }
  });
  assert.equal(result, 'Lovely light and composition.');
  assert.match(captured.url, /models\/gemini-3\.8-flash:generateContent$/);
  assert.equal(captured.options.headers['x-goog-api-key'], 'secret-test-key');
  assert.equal(captured.url.includes('secret-test-key'), false);
  assert.match(JSON.parse(captured.options.body).systemInstruction.parts[0].text, /Pixel Pal/);
  const generationConfig = JSON.parse(captured.options.body).generationConfig;
  assert.deepEqual(generationConfig, { maxOutputTokens: 220 });
  assert.equal('temperature' in generationConfig, false);
});
test('API errors and malformed responses use fallback without throwing', async () => {
  const args = { bot: bot(), kind: 'post', source: 'topic', fallback: 'safe fallback', apiKey: 'x' };
  assert.equal(await generateSmartBotText({ ...args, fetchImpl: async () => ({ ok: false, status: 429 }) }), 'safe fallback');
  assert.equal(await generateSmartBotText({ ...args, fetchImpl: async () => ({ ok: true, json: async () => ({ candidates: [] }) }) }), 'safe fallback');
});
test('generated output is trimmed', async () => {
  const result = await generateSmartBotText({
    bot: bot('bot_03'), kind: 'chat', source: 'hello', fallback: 'fallback', apiKey: 'x',
    fetchImpl: async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '  "A friendly reply."  ' }] } }] }) })
  });
  assert.equal(result, 'A friendly reply.');
});

test('chat generation receives only the six most recent messages as bounded context', async () => {
  let payload;
  const history = Array.from({ length: 8 }, (_, i) => ({ uid: i % 2 ? 'bot_01' : 'user-1', text: `message-${i}` }));
  const result = await generateSmartBotText({
    bot: bot('bot_01'), kind: 'chat', source: 'latest-question', history, fallback: 'fallback', apiKey: 'x',
    fetchImpl: async (_url, options) => {
      payload = JSON.parse(options.body);
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'Context-aware answer.' }] } }] }) };
    }
  });
  assert.equal(result, 'Context-aware answer.');
  const prompt = payload.contents[0].parts[0].text;
  assert.doesNotMatch(prompt, /message-0|message-1/);
  assert.match(prompt, /User: message-2/);
  assert.match(prompt, /Bot: message-3/);
  assert.match(prompt, /User: message-6/);
  assert.match(prompt, /Bot: message-7/);
  assert.match(prompt, /Latest user message: latest-question/);
  assert.match(prompt, /untrusted/);
});

test('non-chat generation ignores supplied conversation history', async () => {
  let prompt = '';
  await generateSmartBotText({
    bot: bot('bot_01'), kind: 'comment', source: 'public post', history: [{ uid: 'user-1', text: 'private detail' }],
    fallback: 'fallback', apiKey: 'x',
    fetchImpl: async (_url, options) => {
      prompt = JSON.parse(options.body).contents[0].parts[0].text;
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'A comment.' }] } }] }) };
    }
  });
  assert.equal(prompt, 'public post');
  assert.doesNotMatch(prompt, /private detail/);
});

test('chat prompt uses saved memory only as bounded untrusted context', async () => {
  let prompt = '';
  const result = await generateSmartBotText({
    bot: bot('bot_01'), kind: 'chat', source: 'What camera did I say I use?',
    memoryContext: 'User prefers beginner photography tips.', fallback: 'fallback', apiKey: 'x',
    fetchImpl: async (_url, options) => {
      prompt = JSON.parse(options.body).contents[0].parts[0].text;
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'You mentioned beginner-friendly tips.' }] } }] }) };
    }
  });
  assert.equal(result, 'You mentioned beginner-friendly tips.');
  assert.match(prompt, /Saved memory about this user/);
  assert.match(prompt, /untrusted context/);
  assert.match(prompt, /beginner photography tips/);
});

test('memory summarization stores only user-authored recent messages and bounded safe summary', async () => {
  let payload;
  const result = await updateSmartBotMemory({
    bot: bot('bot_02'), existingSummary: 'Likes taking photos.',
    messages: [{ uid: 'user-1', text: 'I enjoy street photography.' }, { uid: 'bot_02', text: 'You should try a wide lens.' }],
    apiKey: 'x', fetchImpl: async (_url, options) => {
      payload = JSON.parse(options.body);
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'Enjoys street photography.' }] } }] }) };
    }
  });
  assert.equal(result, 'Enjoys street photography.');
  const prompt = payload.contents[0].parts[0].text;
  assert.match(prompt, /I enjoy street photography/);
  assert.doesNotMatch(prompt, /wide lens/);
  assert.match(payload.systemInstruction.parts[0].text, /Never store or infer/);
});

test('memory summarization never calls Gemini for other bots', async () => {
  let called = false;
  const result = await updateSmartBotMemory({ bot: bot('bot_04'), messages: [{ uid: 'u1', text: 'hello' }], apiKey: 'x', fetchImpl: async () => { called = true; } });
  assert.equal(result, '');
  assert.equal(called, false);
});

test('memory summarization preserves prior memory on API failure', async () => {
  const result = await updateSmartBotMemory({ bot: bot('bot_01'), existingSummary: 'Likes photography.', messages: [{ uid: 'u1', text: 'new preference' }], apiKey: 'x', fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(result, 'Likes photography.');
});
