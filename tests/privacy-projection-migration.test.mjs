import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BOTS } from '../js/bots-data.js';
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

test('bot accounts are excluded from publicDirectory so mutable names cannot impersonate people', () => {
  assert.equal(buildDirectoryProjection({
    name: 'Dr. Real Person',
    nameLower: 'dr real person',
    isBot: true,
    roleEmoji: '🤖',
    verified: true
  }, 'bot_01'), null);
  assert.equal(buildDirectoryProjection({ name: 'Unknown Bot', isBot: true }, 'bot_99'), null);
  assert.equal(buildDirectoryProjection({ name: 'Pretend Human', isBot: false }, 'bot_01'), null);
});

test('bot public profile projection uses the canonical fictional name, bio and role marker', () => {
  const bot = {
    name: 'Dr. Real Person',
    nameLower: 'dr real person',
    bio: 'I am a licensed doctor and an AI bot.',
    photo: 'https://example.test/bot.jpg',
    cover: '',
    isBot: true,
    roleEmoji: '🤖',
    verified: true,
    settings: { profileVisibility: 'friends' },
    createdAt: stamp
  };
  const projection = buildBotPublicProfile(bot, fallbackStamp, 'bot_01');

  assert.equal(projection.name, BOTS[0].name);
  assert.equal(projection.nameLower, BOTS[0].name.toLowerCase());
  assert.equal(projection.bio, BOTS[0].bio);
  assert.equal(projection.isBot, true);
  assert.equal(projection.roleEmoji, BOTS[0].roleEmoji);
  assert.equal(projection.verified, false);
  assert.equal(projection.profileVisibility, 'friends', 'bot projection visibility must match the source setting for Firestore Rules');
  assert.equal(projection.photo, bot.photo);
  assert.equal(projection.createdAt, stamp);
  assert.deepEqual(Object.keys(projection).sort(), [
    'bio', 'cover', 'createdAt', 'isBot', 'name', 'nameLower',
    'photo', 'profileVisibility', 'roleEmoji', 'verified'
  ]);
});

test('bot profile builder fails closed for humans and unknown bot IDs', () => {
  assert.equal(buildBotPublicProfile({
    name: 'Asha Rahman', isBot: false, bio: 'private bio'
  }, fallbackStamp, 'user-1'), null);
  assert.equal(buildBotPublicProfile({
    name: 'Unknown Bot', isBot: true
  }, fallbackStamp, 'bot_99'), null);
});

test('admin migration repairs projections without listing privacy-filtered collections', async () => {
  const source = await readFile(new URL('../js/admin/public-profile-migration.js', import.meta.url), 'utf8');
  assert.match(source, /getDocs\(collection\(db, 'users'\)\)/);
  assert.doesNotMatch(source, /collection\(db, 'publicDirectory'\)|collection\(db, 'publicProfiles'\)/);
  assert.match(source, /getDoc\(directoryRef\)/);
  assert.match(source, /getDoc\(profileRef\)/);
  assert.match(source, /directoryDeleteRefs\.push\(directoryRef\)/);
  assert.match(source, /directoryRepairs/);
  assert.match(source, /error\?\.code === 'permission-denied'/);
  assert.match(source, /botProfileDeletes\.push\(profileRef\)/);
  assert.match(source, /batch\.delete\(ref\)/);
  assert.match(source, /batch\.set\(operation\.ref, operation\.data\)/);
  assert.match(source, /directoryDeletes/);
  assert.match(source, /botProfileRepairs/);
  assert.match(source, /buildDirectoryProjection\(user, snapshot\.id\)/);
  assert.match(source, /buildBotPublicProfile\(user, serverTimestamp\(\), snapshot\.id\)/);
  assert.match(source, /profileFields\.filter\(\(field\) => field !== 'createdAt'\)/);
  assert.doesNotMatch(source, /collection\(db, 'botEngagement'\)/);
  assert.match(source, /index \+= 400/);
});

test('sign-in and owner profile writes replace exact allowlisted projections', async () => {
  const auth = await readFile(new URL('../js/auth.js', import.meta.url), 'utf8');
  const settings = await readFile(new URL('../js/settings.js', import.meta.url), 'utf8');
  const profile = await readFile(new URL('../js/profile.js', import.meta.url), 'utf8');
  assert.match(auth, /batch\.set\(doc\(db, 'publicProfiles', uid\), publicProfileData\(data\)\);/);
  assert.match(auth, /batch\.set\(doc\(db, 'publicDirectory', uid\), \{/);
  assert.match(auth, /batch\.set\(doc\(db, 'botEngagement', uid\), \{/);
  assert.doesNotMatch(auth, /merge: true/);
  assert.match(settings, /batch\.set\(doc\(db, 'publicProfiles', state\.user\.uid\), \{/);
  assert.match(settings, /batch\.set\(doc\(db, 'botEngagement', state\.user\.uid\), \{/);
  assert.doesNotMatch(settings, /merge: true/);
  assert.match(profile, /batch\.set\(doc\(db, 'publicProfiles', state\.user\.uid\), \{/);
  assert.match(profile, /batch\.set\(doc\(db, 'publicDirectory', state\.user\.uid\), \{/);
  assert.doesNotMatch(profile, /merge: true/);
});
