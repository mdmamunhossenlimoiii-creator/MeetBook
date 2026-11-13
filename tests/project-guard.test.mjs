import test from 'node:test';
import assert from 'node:assert/strict';
import { assertExpectedProjectId } from '../scripts/lib/project-guard.mjs';

test('accepts only the explicitly expected Firebase project', () => {
  assert.equal(assertExpectedProjectId({ actualProjectId: 'meetbook-staging', expectedProjectId: 'meetbook-staging' }), true);
});
test('fails closed when the expected project ID is missing', () => {
  assert.throws(() => assertExpectedProjectId({ actualProjectId: 'meetbook-staging', expectedProjectId: '' }), /BOT_RUNNER_EXPECTED_PROJECT_ID is required/);
});
test('fails closed when the configured Firebase project ID is missing', () => {
  assert.throws(() => assertExpectedProjectId({ actualProjectId: '', expectedProjectId: 'meetbook-staging' }), /Firebase projectId is missing/);
});
test('rejects a project ID mismatch', () => {
  assert.throws(() => assertExpectedProjectId({ actualProjectId: 'meetbook-production', expectedProjectId: 'meetbook-staging' }), /does not match BOT_RUNNER_EXPECTED_PROJECT_ID/);
});
test('trims whitespace only from the expected value, without changing actual project ID', () => {
  assert.equal(assertExpectedProjectId({ actualProjectId: 'meetbook-staging', expectedProjectId: ' meetbook-staging ' }), true);
  assert.throws(() => assertExpectedProjectId({ actualProjectId: ' meetbook-staging ', expectedProjectId: 'meetbook-staging' }), /does not match/);
});
