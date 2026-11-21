const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

/**
 * The searchable directory is deliberately minimal. Never copy biography, photos,
 * cover images, settings, contact details, or bot-memory consent into this projection.
 */
export function buildDirectoryProjection(user) {
  if (!user || typeof user !== 'object' || Array.isArray(user)) return null;
  if (typeof user.name !== 'string' || user.name.length < 2) return null;

  const nameLower = hasOwn(user, 'nameLower') ? user.nameLower : user.name.toLowerCase();
  const isBot = hasOwn(user, 'isBot') ? user.isBot : false;
  const roleEmoji = hasOwn(user, 'roleEmoji') ? user.roleEmoji : '';
  const verified = hasOwn(user, 'verified') ? user.verified : false;

  if (typeof nameLower !== 'string'
    || typeof isBot !== 'boolean'
    || typeof roleEmoji !== 'string'
    || typeof verified !== 'boolean') return null;

  return { name: user.name, nameLower, isBot, roleEmoji, verified };
}

/**
 * Admin may create a missing public profile only for a built-in bot.
 * Human detailed-profile projections remain owner-created on the user's next sign-in.
 */
export function buildBotPublicProfile(user, fallbackCreatedAt) {
  if (!user || typeof user !== 'object' || Array.isArray(user)
    || user.isBot !== true
    || typeof user.name !== 'string'
    || user.name.length < 2) return null;

  const settings = hasOwn(user, 'settings') ? user.settings : {};
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return null;

  const profileVisibility = hasOwn(settings, 'profileVisibility')
    ? settings.profileVisibility
    : 'everyone';
  if (!['everyone', 'friends'].includes(profileVisibility)) return null;

  const nameLower = hasOwn(user, 'nameLower') ? user.nameLower : user.name.toLowerCase();
  const roleEmoji = hasOwn(user, 'roleEmoji') ? user.roleEmoji : '';
  const verified = hasOwn(user, 'verified') ? user.verified : false;
  if (typeof nameLower !== 'string' || typeof roleEmoji !== 'string' || typeof verified !== 'boolean') return null;

  const createdAt = user.createdAt && typeof user.createdAt.toDate === 'function'
    ? user.createdAt
    : fallbackCreatedAt;
  if (!createdAt) return null;

  return {
    name: user.name,
    nameLower,
    bio: typeof user.bio === 'string' ? user.bio.slice(0, 500) : '',
    photo: typeof user.photo === 'string' ? user.photo : '',
    cover: typeof user.cover === 'string' ? user.cover : '',
    isBot: true,
    roleEmoji,
    verified,
    profileVisibility,
    createdAt
  };
}
