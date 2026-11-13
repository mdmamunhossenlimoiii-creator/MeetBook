import test from 'node:test';
import assert from 'node:assert/strict';
import { hasBotMemoryConsent } from '../scripts/lib/bot-memory-consent.mjs';

test('long-term memory requires explicit opt-in', () => {
  assert.equal(hasBotMemoryConsent({allowBotMemory:true}), true);
  assert.equal(hasBotMemoryConsent({allowBotMemory:false}), false);
  assert.equal(hasBotMemoryConsent({}), false);
  assert.equal(hasBotMemoryConsent(null), false);
  assert.equal(hasBotMemoryConsent({allowBotMemory:'true'}), false);
});
