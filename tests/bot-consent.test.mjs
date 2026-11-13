import test from 'node:test';
import assert from 'node:assert/strict';
import { hasBotEngagementConsent } from '../scripts/lib/bot-consent.mjs';

test('runner consent projection grants permission only for explicit true', () => {
  assert.equal(hasBotEngagementConsent({ allowBotEngagement: true }), true);
  assert.equal(hasBotEngagementConsent({ allowBotEngagement: false }), false);
  assert.equal(hasBotEngagementConsent({}), false);
  assert.equal(hasBotEngagementConsent(null), false);
});

test('missing or stale projections fail closed', () => {
  assert.equal(hasBotEngagementConsent(undefined), false);
  assert.equal(hasBotEngagementConsent({ allowBotEngagement: 'true' }), false);
});
