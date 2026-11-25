import test from 'node:test';
import assert from 'node:assert/strict';
import { BOTS } from '../js/bots-data.js';
import { filterRelevantPostIdeas, relevance, makeComment } from '../js/bots-brain.js';

test('every built-in English and Bengali post template matches its own role topics', () => {
  for (const bot of BOTS) {
    for (const text of [...bot.posts, ...(bot.postsBn || [])]) {
      assert.ok(relevance(bot, text) > 0, `${bot.id} (${bot.name}) has an off-topic built-in template: ${text}`);
    }
  }
});

test('specialist post ideas are accepted only for the matching character role', () => {
  const cases = [
    ['bot_04', 'Quote of the day: small steps make steady progress.'],
    ['bot_05', 'Science fact: octopuses have three hearts.'],
    ['bot_13', 'Word of the day: ephemeral means short-lived.'],
    ['bot_15', 'A mindful pause and slow breathing can help you reset.'],
    ['bot_17', 'Astronomy fact: Saturn has rings and the Sun lights Earth.'],
    ['bot_19', 'Trivia quiz: what is the capital city of Australia?'],
    ['bot_20', 'A clean pun is a little joke.']
  ];
  for (const [id, idea] of cases) {
    const bot = BOTS.find((item) => item.id === id);
    assert.ok(filterRelevantPostIdeas(bot, [idea]).includes(idea), `${id} rejected its own topic idea`);
  }
  const scienceBot = BOTS.find((item) => item.id === 'bot_05');
  assert.deepEqual(filterRelevantPostIdeas(scienceBot, ['Celebrity gossip about a TV show']), []);
});

test('specialist comments use the detected role topic instead of a generic fallback', () => {
  const cases = [
    ['bot_04', 'A good habit can turn small steps into steady progress.', 'quotes'],
    ['bot_05', 'Did you know? Octopuses have three hearts.', 'science'],
    ['bot_13', 'Word of the day: serendipity.', 'language'],
    ['bot_15', 'Take a pause and breathe slowly for a moment.', 'wellness'],
    ['bot_17', 'Stargazing tip: look for Saturn and the stars.', 'astronomy'],
    ['bot_19', 'Trivia time: what is a hexagon?', 'trivia'],
    ['bot_20', 'Why do programmers prefer dark mode? It is a joke.', 'jokes']
  ];
  for (const [id, text, expectedTopic] of cases) {
    const bot = BOTS.find((item) => item.id === id);
    const comment = makeComment({ bot, post: { text }, rand: () => 0.99 });
    assert.equal(comment?.topic, expectedTopic, `${id} should comment as ${expectedTopic}`);
  }
});
