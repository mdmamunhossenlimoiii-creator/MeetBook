// The Runner reads only this privacy-minimized projection, never the full user document.
// Firestore Rules independently verify the canonical users/{uid}.settings value on bot writes.
export function hasBotEngagementConsent(projection) {
  return projection?.allowBotEngagement === true;
}
