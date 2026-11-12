// Maps the two npm packages used by tests/emulator/run.mjs to local fakes backed by our rules interpreter.
// HARNESS CHECK ONLY: it proves run.mjs' own logic (marker conversion, seeding, allow/deny bookkeeping) works.
// It says nothing about Google's engine; only the CI job with the real emulator does.
const MAP = {
  '@firebase/rules-unit-testing': new URL('./rules-unit-testing.mjs', import.meta.url).href,
  'firebase/firestore': new URL('./firestore.mjs', import.meta.url).href
};
export async function resolve(specifier, context, next) {
  if (MAP[specifier]) return { url: MAP[specifier], shortCircuit: true };
  return next(specifier, context);
}
