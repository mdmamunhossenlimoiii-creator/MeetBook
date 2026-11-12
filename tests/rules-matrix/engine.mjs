// Runs one matrix case through the local rules interpreter.
import { readFileSync } from 'node:fs';
import { parseRules, check, toTs } from '../rules-sim/simulator.mjs';

export const NOW = Date.UTC(2026, 10, 10, 12, 0, 0);
export const RULES_TEXT = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
export const loadAst = (text) => parseRules(text);
const defaultAst = loadAst(RULES_TEXT);

// markers -> plain values the interpreter understands
export function resolve(v, now = NOW) {
  if (Array.isArray(v)) return v.map((x) => resolve(x, now));
  if (v && typeof v === 'object') {
    if ('$rel' in v) return toTs(now + v.$rel);
    if ('$srv' in v) return toTs(now);
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = resolve(x, now);
    return o;
  }
  return v;
}
const clone = (v) => (Array.isArray(v) ? v.map(clone) : v && typeof v === 'object' && !('ms' in v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)])) : v);

export function buildDb(seed) {
  const db = new Map();
  for (const [p, d] of Object.entries(seed)) db.set(p, resolve(d));
  return db;
}

// updateDoc-style patch (dotted keys, increment, deleteField) applied to the existing document
export function applyPatch(existing, patch) {
  const out = clone(existing);
  for (const [key, val] of Object.entries(patch)) {
    const parts = key.split('.');
    let c = out;
    parts.slice(0, -1).forEach((k) => { c[k] = (c[k] && typeof c[k] === 'object') ? c[k] : {}; c = c[k]; });
    const last = parts.at(-1);
    if (val && typeof val === 'object' && '$del' in val) delete c[last];
    else if (val && typeof val === 'object' && '$inc' in val) c[last] = (typeof c[last] === 'number' ? c[last] : 0) + val.$inc;
    else c[last] = resolve(val);
  }
  return out;
}

export function runCase(cap, actorName, actor, db, ast = defaultAst) {
  const data = typeof cap.data === 'function' ? cap.data({ ...actor, name: actorName }) : cap.data;
  let newData;
  if (cap.op === 'create') newData = resolve(data);
  else if (cap.op === 'update') { const ex = db.get(cap.path); if (!ex) throw new Error(`update target missing: ${cap.path}`); newData = applyPatch(ex, data); }
  const v = check(ast, { db, auth: actor.uid, op: cap.op, path: cap.path, newData, now: NOW });
  return v;
}
