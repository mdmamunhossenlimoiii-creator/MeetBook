import test from 'node:test';
import assert from 'node:assert/strict';
import { assertExpectedProjectId } from '../scripts/lib/project-guard.mjs';

test('accepts only the explicitly expected Firebase project', () => {
  assert.equal(assertExpectedProjectId({ actualProjectId: 'meetbook-65d30', expectedProjectId: 'meetbook-65d30' }), true);
});
test('fails closed when the expected project ID is missing', () => {
  assert.throws(() => assertExpectedProjectId({ actualProjectId: 'meetbook-65d30', expectedProjectId: '' }), /BOT_RUNNER_EXPECTED_PROJECT_ID is required/);
});
test('fails closed when the configured Firebase project ID is missing', () => {
  assert.throws(() => assertExpectedProjectId({ actualProjectId: '', expectedProjectId: 'meetbook-65d30' }), /Firebase projectId is missing/);
});
test('rejects a project ID mismatch', () => {
  assert.throws(() => assertExpectedProjectId({ actualProjectId: 'meetbook-65d30', expectedProjectId: 'another-project' }), /does not match BOT_RUNNER_EXPECTED_PROJECT_ID/);
});
test('trims whitespace only from the expected value, without changing actual project ID', () => {
  assert.equal(assertExpectedProjectId({ actualProjectId: 'meetbook-65d30', expectedProjectId: ' meetbook-65d30 ' }), true);
  assert.throws(() => assertExpectedProjectId({ actualProjectId: ' meetbook-65d30 ', expectedProjectId: 'meetbook-65d30' }), /does not match/);
});
