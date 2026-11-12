// AI bots must always present as AI and must never pose as people.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BOTS } from '../js/bots-data.js';
import { chatReply, makeComment, hasCrisis, isSensitive, PERSONALITIES } from '../js/bots-brain.js';

const src = ['../js/bots-brain.js', '../js/bots-data.js'].map((f) => readFileSync(new URL(f, import.meta.url), 'utf8')).join('\n');

test('no template claims a human life or body', () => {
  const banned = /\b(I|we|my|me) (went|ate|tried|visited|watched|played|saw|loved|have been|was born|grew up|am human|am a (man|woman|boy|girl|student|person))\b|my (friend|family|mom|dad|wife|husband|kids|children|school|job)\b|the rest of us|\bfellow (human|gamer|tech)|I (feel|felt) (so )?(hungry|tired|sad|happy)/i;
  assert.doesNotMatch(src, banned);
});

test('every bot profile says it is an AI bot in the bio', () => {
  for (const b of BOTS) assert.match(b.bio, /\bAI\b|\bbot\b/i, `${b.id} bio must disclose it is an AI bot`);
});

test('asked "are you human?" a bot says it is an AI bot, in English and Bengali', () => {
  for (const bot of BOTS.slice(0, 6)) {
    for (const t of ['are you a human?', 'are you real?', 'who are you?', 'তুমি কি মানুষ?', 'আপনি কি রোবট?', 'তোমার নাম কী']) {
      const r = chatReply({ bot, text: t });
      assert.equal(r.intent, 'whoami', `${t} -> ${r.intent}`);
      assert.match(r.text, /AI bot|এআই বট/);
    }
  }
});

test('first greeting also discloses AI', () => {
  assert.match(chatReply({ bot: BOTS[0], text: 'hello' }).text, /AI bot/);
  assert.match(chatReply({ bot: BOTS[0], text: 'হ্যালো' }).text, /এআই বট/);
});

test('crisis and grief messages get a careful answer, never a canned joke or comment', () => {
  const funny = BOTS.find((b) => b.personality === 'funny');
  for (const t of ['I want to die', 'I want to kill myself', 'আমি আত্মহত্যা করতে চাই', 'আমি মরে যেতে চাই']) {
    assert.ok(hasCrisis(t), t);
    const r = chatReply({ bot: funny, text: t });
    assert.equal(r.intent, 'crisis');
    assert.match(r.text, /AI bot|এআই বট/);
    assert.match(r.text, /emergency|helpline|জরুরি|হেল্পলাইন/);
    assert.doesNotMatch(r.text, /haha|joke|হা হা|জোক/i);
    assert.equal(makeComment({ bot: funny, post: { text: t } }), null, 'never comment on it');
  }
  assert.ok(isSensitive('My grandfather passed away today'));
  assert.equal(makeComment({ bot: funny, post: { text: 'My grandfather passed away today' } }), null);
});

test('comments never repeat for the same bot and never exceed limits', () => {
  const bot = BOTS[0], used = [];
  for (let i = 0; i < 300; i++) { const c = makeComment({ bot, post: { text: 'my new phone setup' }, used }); if (!c) break; assert.ok(!used.includes(c.text)); used.push(c.text); assert.ok(c.text.length <= 300); }
  assert.ok(used.length > 20);
});

test('all personalities are covered by at least one bot', () => {
  const have = new Set(BOTS.map((b) => b.personality));
  for (const k of Object.keys(PERSONALITIES)) assert.ok(have.has(k), `no bot with personality ${k}`);
});
