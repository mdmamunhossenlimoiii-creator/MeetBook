/**
 * Fail-closed guard: the runner must be explicitly pinned to the Firebase project
 * it is intended to access. Never infer or default the expected project ID.
 */
export function assertExpectedProjectId({ actualProjectId, expectedProjectId }) {
  if (typeof expectedProjectId !== 'string' || !expectedProjectId.trim()) {
    throw new Error('BOT_RUNNER_EXPECTED_PROJECT_ID is required; refusing to start the bot runner.');
  }
  if (typeof actualProjectId !== 'string' || !actualProjectId.trim()) {
    throw new Error('Firebase projectId is missing; refusing to start the bot runner.');
  }
  if (actualProjectId !== expectedProjectId.trim()) {
    throw new Error('Firebase project ID does not match BOT_RUNNER_EXPECTED_PROJECT_ID; refusing to start the bot runner.');
  }
  return true;
}
