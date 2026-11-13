import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '../scripts/lib/firestore-rest.mjs';
import { startMock } from './mock-firestore.mjs';

test('transactional quota reservations serialize concurrent runners', async () => {
  const mock = await startMock();
  try {
    const fs = createClient({ projectId: 'test-proj', fsUrl: mock.url, getToken: async () => 'USER_TOKEN' });
    const path = 'botRateLimits/runner1/bots/bot_01/days/2026-11-13';
    const data = { runnerUid: 'runner1', botId: 'bot_01', kind: 'botDaily' };
    const results = await Promise.all([
      fs.reserveQuota(path, { max: 1, data }),
      fs.reserveQuota(path, { max: 1, data })
    ]);
    assert.equal(results.filter(Boolean).length, 1, 'only one concurrent reservation may consume the final slot');
    assert.equal(mock.get(path).count, 1);
  } finally {
    await mock.close();
  }
});

test('quota transactions enforce a daily count and a cooldown', async () => {
  const mock = await startMock();
  try {
    const fs = createClient({ projectId: 'test-proj', fsUrl: mock.url, getToken: async () => 'USER_TOKEN' });
    const path = 'botRateLimits/runner1/bots/bot_01/users/u1/days/2026-11-13';
    const data = { runnerUid: 'runner1', botId: 'bot_01', actorUid: 'u1', kind: 'chatDaily' };
    assert.equal(await fs.reserveQuota(path, { max: 15, cooldownMs: 60_000, data }), true);
    assert.equal(await fs.reserveQuota(path, { max: 15, cooldownMs: 60_000, data }), false);
    assert.equal(mock.get(path).count, 1, 'a rejected cooldown attempt must not consume another slot');
  } finally {
    await mock.close();
  }
});
