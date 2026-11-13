// The Runner reads this minimal projection, never the full user document.
export function hasBotMemoryConsent(projection) {
  return projection?.allowBotMemory === true;
}
