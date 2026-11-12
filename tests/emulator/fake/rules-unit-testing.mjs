// Fake of '@firebase/rules-unit-testing' (v3 API subset used by run.mjs).
import { store } from './shared.mjs';
import { loadAst } from '../../rules-matrix/engine.mjs';

export async function initializeTestEnvironment({ firestore }) {
  loadAst(firestore.rules); // throws on a parse error, like the emulator on invalid rules
  const ctx = (uid, bypass = false) => ({ firestore: () => ({ map: store, uid, bypass }) });
  return {
    clearFirestore: async () => store.clear(),
    withSecurityRulesDisabled: async (fn) => fn(ctx(null, true)),
    authenticatedContext: (uid) => ctx(uid),
    unauthenticatedContext: () => ctx(null),
    cleanup: async () => {}
  };
}
