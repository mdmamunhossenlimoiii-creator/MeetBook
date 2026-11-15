import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildBotPublicProfile,
  buildDirectoryProjection
} from '../js/admin/public-profile-projections.js';

const stamp = { toDate: () => new Date(0) };
const fallbackStamp = { serverTimestamp: true };

test('directory projection contains only the five allowlisted public fields', () => {
  const projection = buildDirectoryProjection({
    name: 'Asha Rahman',
    nameLower: 'asha rahman',
    bio: 'private bio',
    photo: 'private-photo-url',
    cover: 'private-cover-url',
    settings: { allowBotMemory: true, allowBotEngagement: true },
    banned: false
  });

  assert.deepEqual(projection, {
    name: 'Asha Rahman',
    nameLower: 'asha rahman',
    isBot: false,
    roleEmoji: '',
    verified: false
  });
  assert.deepEqual(Object.keys(projection).sort(), ['isBot', 'name', 'nameLower', 'roleEmoji', 'verified']);
});

test('directory projection rejects malformed canonical fields instead of guessing', () => {
  assert.equal(buildDirectoryProjection({ name: 'A' }), null);
  assert.equal(buildDirectoryProjection({ name: 'Asha Rahman', nameLower: null }), null);
  assert.equal(buildDirectoryProjection({ name: 'Asha Rahman', roleEmoji: null }), null);
});

test('admin profile builder never creates a detailed projection for a human account', () => {
  assert.equal(buildBotPublicProfile({
    name: 'Asha Rahman',
    isBot: false,
    bio: 'private bio',
    settings: { profileVisibility: 'everyone' }
  }, fallbackStamp), null);
});

test('missing bot profile projection retains the AI identity and bounded public fields', () => {
  const bot = {
    name: 'TechTip Nova',
    nameLower: 'techtip nova',
    bio: 'I am an AI bot. '.repeat(80),
    photo: '',
    cover: '',
    isBot: true,
    roleEmoji: '🤖',
    verified: false,
    settings: { profileVisibility: 'everyone' },
    createdAt: stamp
  };
  const projection = buildBotPublicProfile(bot, fallbackStamp);

  assert.equal(projection.name, 'TechTip Nova');
  assert.equal(projection.isBot, true);
  assert.equal(projection.roleEmoji, '🤖');
  assert.equal(projection.profileVisibility, 'everyone');
  assert.equal(projection.bio.length, 500);
  assert.equal(projection.createdAt, stamp);
  assert.deepEqual(Object.keys(projection).sort(), [
    'bio', 'cover', 'createdAt', 'isBot', 'name', 'nameLower',
    'photo', 'profileVisibility', 'roleEmoji', 'verified'
  ]);
});

test('bot profile builder fails closed on invalid visibility or malformed role fields', () => {
  assert.equal(buildBotPublicProfile({
    name: 'TechTip Nova', isBot: true, settings: { profileVisibility: 'private' }
  }, fallbackStamp), null);
  assert.equal(buildBotPublicProfile({
    name: 'TechTip Nova', isBot: true, roleEmoji: null, settings: {}
  }, fallbackStamp), null);
});

test('admin migration writes the minimal directory and only creates missing bot profiles', async () => {
  const source = await readFile(new URL('../js/admin/public-profile-migration.js', import.meta.url), 'utf8');
  assert.match(source, /collection\(db, 'publicDirectory'\)/);
  assert.match(source, /if \(user\.isBot === true && !existingProfiles\.has\(snapshot\.id\)\)/);
  assert.match(source, /buildDirectoryProjection\(user\)/);
  assert.match(source, /buildBotPublicProfile\(user, serverTimestamp\(\)\)/);
  assert.doesNotMatch(source, /collection\(db, 'botEngagement'\)/);
  assert.match(source, /index \+= 400/);
});
