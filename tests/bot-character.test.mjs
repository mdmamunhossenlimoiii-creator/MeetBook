import test from 'node:test';
import assert from 'node:assert/strict';
import { BOTS, ROLE_EMOJIS, botProfileRoleIssues } from '../js/bots-data.js';
import { PERSONALITIES, chatReply, makeComment, nextPostText, relevance, isDuplicatePostText, filterRelevantPostIdeas } from '../js/bots-brain.js';

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
  celebration: 'birthday congratulations',
  quotes: 'quote of the day small steps and progress',
  science: 'science fact octopus and photosynthesis',
  reading: 'reading a book with pages and novels',
  language: 'word of the day vocabulary and language',
  wellness: 'pause breathe and mindfulness reset',
  astronomy: 'astronomy stargazing Saturn and stars',
  trivia: 'trivia quiz capital city hexagon',
  jokes: 'jokes puns and a clean impasta joke'
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

test('live built-in bot profiles must match their canonical role metadata without being mutated', () => {
  for (const bot of BOTS) {
    const profile = {
      name: bot.name,
      username: bot.username,
      bio: bot.bio,
      roleEmoji: bot.roleEmoji,
      personality: bot.personality,
      interests: [...bot.interests]
    };
    assert.deepEqual(botProfileRoleIssues(bot.id, profile), [], `${bot.id} accepts its exact role metadata`);
    assert.deepEqual(botProfileRoleIssues(bot.id, {}), [], `${bot.id} falls back when optional identity and role fields are absent`);
    assert.deepEqual(botProfileRoleIssues(bot.id, { ...profile, name: 'Dr. Real Person' }), ['name'], `${bot.id} rejects a substituted human identity`);
    assert.deepEqual(botProfileRoleIssues(bot.id, { ...profile, username: 'real_person_official' }), ['username'], `${bot.id} rejects a substituted username`);
    assert.deepEqual(botProfileRoleIssues(bot.id, { ...profile, bio: 'I am a licensed doctor and an AI bot.' }), ['bio'], `${bot.id} rejects a professional credential claim`);
    assert.deepEqual(botProfileRoleIssues(bot.id, { ...profile, verified: true }), ['verified'], `${bot.id} cannot claim a verified badge`);

    const before = structuredClone(profile);
    assert.deepEqual(
      botProfileRoleIssues(bot.id, { ...profile, roleEmoji: '❓' }),
      ['roleEmoji'],
      `${bot.id} rejects a mismatched character marker`
    );
    assert.deepEqual(
      botProfileRoleIssues(bot.id, { ...profile, personality: '__unknown_personality__' }),
      ['personality'],
      `${bot.id} rejects a conflicting role personality`
    );
    assert.deepEqual(
      botProfileRoleIssues(bot.id, { ...profile, interests: ['unrelated'] }),
      ['interests'],
      `${bot.id} rejects a conflicting topic list`
    );
    assert.deepEqual(
      botProfileRoleIssues(bot.id, { ...profile, interests: 'tech' }),
      ['interests'],
      `${bot.id} rejects malformed topic metadata`
    );
    assert.deepEqual(profile, before, 'the audit must not mutate the stored profile');
  }
  assert.deepEqual(botProfileRoleIssues('bot_99', {}), ['unknown_bot']);
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

test('owner-supplied post ideas must match each bot role and duplicates are removed', () => {
  for (const bot of BOTS) {
    const ownTopic = samples[bot.interests[0]];
    const unrelatedTopic = Object.entries(samples).find(([topic]) => !bot.interests.includes(topic))?.[1];
    assert.ok(ownTopic && unrelatedTopic);
    assert.deepEqual(
      filterRelevantPostIdeas(bot, [ownTopic, ownTopic, unrelatedTopic, '']),
      [ownTopic],
      `${bot.id} accepts only unique ideas from its own topics`
    );
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
