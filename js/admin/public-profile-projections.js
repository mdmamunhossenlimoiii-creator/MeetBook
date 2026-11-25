import { BOTS } from '../bots-data.js';

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

/**
 * The searchable directory is deliberately minimal. Never copy biography, photos,
 * cover images, settings, contact details, or bot-memory consent into this projection.
 * Built-in bot IDs always use their canonical fictional identity.
 */
export function buildDirectoryProjection(user, uid) {
  if (!user || typeof user !== 'object' || Array.isArray(user)) return null;
  const isBot = hasOwn(user, 'isBot') ? user.isBot : false;
  if (typeof isBot !== 'boolean') return null;

  // Bot profiles are intentionally absent from publicDirectory. getUser() falls back
  // to the canonical publicProfiles document for bot IDs; no mutable bot name is indexed.
  if (isBot === true || BOTS.some((bot) => bot.id === uid)) return null;
  if (typeof user.name !== 'string' || user.name.length < 2) return null;

  const nameLower = hasOwn(user, 'nameLower') ? user.nameLower : user.name.toLowerCase();
  const roleEmoji = hasOwn(user, 'roleEmoji') ? user.roleEmoji : '';
  const verified = hasOwn(user, 'verified') ? user.verified : false;
  if (typeof nameLower !== 'string' || typeof roleEmoji !== 'string' || typeof verified !== 'boolean') return null;

  return { name: user.name, nameLower, isBot: false, roleEmoji, verified };
}

/**
 * Admin may create or repair a missing built-in bot profile from canonical data.
 * Human detailed-profile projections remain owner-created on the user's next sign-in.
 */
export function buildBotPublicProfile(user, fallbackCreatedAt, uid) {
  if (!user || typeof user !== 'object' || Array.isArray(user) || user.isBot !== true) return null;
  const base = BOTS.find((bot) => bot.id === uid);
  if (!base) return null;

  const settings = hasOwn(user, 'settings') ? user.settings : {};
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return null;
  const profileVisibility = hasOwn(settings, 'profileVisibility') ? settings.profileVisibility : 'everyone';
  if (!['everyone', 'friends'].includes(profileVisibility)) return null;

  const createdAt = user.createdAt && typeof user.createdAt.toDate === 'function'
    ? user.createdAt
    : fallbackCreatedAt;
  if (!createdAt) return null;

  return {
    name: base.name,
    nameLower: base.name.toLowerCase(),
    bio: base.bio.slice(0, 500),
    photo: typeof user.photo === 'string' ? user.photo : '',
    cover: typeof user.cover === 'string' ? user.cover : '',
    isBot: true,
    roleEmoji: base.roleEmoji,
    verified: false,
    profileVisibility,
    createdAt
  };
}
