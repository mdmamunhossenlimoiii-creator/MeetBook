// Plugs the local rules interpreter (tests/rules-sim) into tests/mock-firestore.mjs.
// With it, every REST call made with a USER token (the bot runner) is judged by the REAL firestore.rules text,
// exactly like Firebase would judge it; a SERVICE-ACCOUNT token bypasses rules (also like Firebase).
// Limits: (1) it is our interpreter, not Google's engine; (2) list queries are approximated: the query is denied
// when ANY returned document would fail a single-document read (real Firestore is stricter: it judges the query shape).
import { parseRules, check, Ts } from './rules-sim/simulator.mjs';
import { RULES_TEXT } from './rules-matrix/engine.mjs';

const ast = parseRules(RULES_TEXT);
const toPlain = (v) => {
  if (v === null || v === undefined) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return new Ts(Date.parse(v.timestampValue));
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(toPlain);
  if ('mapValue' in v) return fieldsToPlain(v.mapValue.fields || {});
  return null;
};
const fieldsToPlain = (f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, toPlain(v)]));

export function makeRulesGate(docs, { uidForToken = { USER_TOKEN: 'runner1' } } = {}) {
  const snapshot = () => { const db = new Map(); for (const [p, d] of docs) db.set(p, fieldsToPlain(d.fields)); return db; };
  const denied = [];
  // returns true when allowed. newFields = REST fields of the document AFTER the write (create/update)
  function allow(authHeader, op, path, newFields) {
    const token = String(authHeader || '').replace('Bearer ', '');
    if (token === 'SA_TOKEN') return true; // admin credentials bypass rules in Firebase too
    const uid = uidForToken[token] || null;
    const v = check(ast, { db: snapshot(), auth: uid, op, path, newData: newFields ? fieldsToPlain(newFields) : undefined, now: Date.now() });
    if (!v.allowed) denied.push(`${op} ${path}`);
    return v.allowed;
  }
  return { allow, denied };
}
