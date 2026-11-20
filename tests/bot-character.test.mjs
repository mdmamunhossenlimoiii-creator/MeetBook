import test from 'node:test';
import assert from 'node:assert/strict';
import { BOTS, ROLE_EMOJIS } from '../js/bots-data.js';
import { PERSONALITIES, chatReply, makeComment, nextPostText, relevance, isDuplicatePostText } from '../js/bots-brain.js';

const EXPECTED_ROLE_EMOJIS = [
  '💻', '📸', '👩‍🍳', '✨', '🔬', '✈️', '🏃', '📚', '🎵', '🎬', '👨‍💻', '🪴',
  '📝', '📖', '🌿', '📱', '🔭', '🌳', '🧠', '😂', '📰', '🎮', '🏏'
];

const samples = {
  tech: 'phone app technology coding',
  photo: 'photo camera picture',
  food: 'food cooking recipe',
  books: 'book reading novel',
  music: 'music song playlist',
  movies: 'movie film cinema',
  health: 'health exercise workout',
  nature: 'nature tree garden',
  study: 'study exam learning',
  humor: 'funny joke humor',
  travel: 'travel trip journey',
  sports: 'cricket football sports',
  gaming: 'gaming video game',
  news: 'news headline report',
  celebration: 'birthday congratulations'
};

test('every built-in bot has a unique character marker and a known personality', () => {
  assert.equal(BOTS.length, 23, 'all built-in characters must be present');
  assert.deepEqual(BOTS.map((bot) => bot.roleEmoji), EXPECTED_ROLE_EMOJIS, 'each character keeps its role-appropriate marker');
  assert.equal(new Set(BOTS.map((bot) => bot.id)).size, BOTS.length);
  assert.equal(new Set(BOTS.map((bot) => bot.roleEmoji)).size, BOTS.length);
  for (const bot of BOTS) {
    assert.ok(ROLE_EMOJIS.includes(bot.roleEmoji), `${bot.id} has an allowed marker`);
    assert.ok(PERSONALITIES[bot.personality], `${bot.id} has a known personality`);
    assert.ok(Array.isArray(bot.posts) && bot.posts.length > 0, `${bot.id} has post ideas`);
  }
});

test('every public bot bio is transparent and does not claim real professional credentials', () => {
  for (const bot of BOTS) {
    assert.match(bot.bio, /AI bot/i, `${bot.id} must disclose that it is an AI bot`);
    assert.doesNotMatch(
      bot.bio,
      /\b(?:I am|I'm|as)\s+(?:a\s+)?(?:licensed|certified|registered|professional)\b/i,
      `${bot.id} must not claim real-world credentials`
    );
  }
});

test('each built-in bot comments on a topic from its own interests', () => {
  for (const bot of BOTS) {
    const topic = bot.interests[0];
    const sample = samples[topic];
    assert.ok(sample, `missing test sample for ${topic}`);
    assert.ok(relevance(bot, sample) > 0, `${bot.id} should match ${topic}`);
    const comment = makeComment({ bot, post: { text: sample }, rand: () => 0.99 });
    assert.equal(comment?.topic, topic, `${bot.id} should stay on its character topic`);
  }
});

test('post rotation uses the bot own post ideas without repeating until exhausted', () => {
  for (const bot of BOTS) {
    const used = {};
    const first = nextPostText(bot, used, () => 0);
    assert.ok(first?.text);
    assert.equal(used[bot.id].length, 1);
    const second = nextPostText(bot, used, () => 0);
    assert.ok(second?.text);
    assert.notEqual(second.key, first.key);
  }
});

test('post duplicate guard rejects exact and near-duplicate content but allows a new topic', () => {
  const history = [
    'A good habit is just a decision you made so many times that you stopped noticing it.'
  ];
  assert.equal(
    isDuplicatePostText('A good habit is just a decision you made so many times that you stopped noticing it!', history),
    true,
    'punctuation changes must not bypass duplicate detection'
  );
  assert.equal(
    isDuplicatePostText('A good habit is simply a decision you made so many times that you stopped noticing it.', history),
    true,
    'small wording changes must still be treated as near-duplicates'
  );
  assert.equal(isDuplicatePostText('Saturn has rings made mostly of ice particles.', history), false);
  assert.equal(isDuplicatePostText('', history), true);
});

test('direct identity questions receive a truthful AI-bot answer in Bengali', () => {
  const bot = BOTS[0];
  const reply = chatReply({ bot, text: 'তুমি কি বট?', rand: () => 0 });
  assert.equal(reply.intent, 'whoami');
  assert.match(reply.text, /এআই বট|AI bot/i);
});
