// Canonical consent check shared by the bot runner and unit tests.
// The users/{uid}.settings field is the source of truth; projection documents are not authoritative.
export function hasBotEngagementConsent(user) {
  return user?.settings?.allowBotEngagement === true;
}
