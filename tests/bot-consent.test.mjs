import test from 'node:test';
import assert from 'node:assert/strict';
import { hasBotEngagementConsent } from '../scripts/lib/bot-consent.mjs';

test('bot engagement consent is granted only by the canonical user setting', () => {
  assert.equal(hasBotEngagementConsent({ settings: { allowBotEngagement: true } }), true);
  assert.equal(hasBotEngagementConsent({ settings: { allowBotEngagement: false } }), false);
  assert.equal(hasBotEngagementConsent({ settings: {} }), false);
  assert.equal(hasBotEngagementConsent(null), false);
});

test('projection or legacy consent fields cannot override the canonical user setting', () => {
  assert.equal(hasBotEngagementConsent({ settings: { allowBotEngagement: false }, allowBotEngagement: true }), false);
  assert.equal(hasBotEngagementConsent({ settings: { allowBotEngagement: false }, projection: { allowBotEngagement: true } }), false);
  assert.equal(hasBotEngagementConsent({ settings: { allowBotEngagement: true }, projection: { allowBotEngagement: false } }), true);
});
