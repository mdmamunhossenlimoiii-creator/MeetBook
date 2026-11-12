// Fake of the parts of 'firebase/firestore' that run.mjs uses.
import { check } from '../../rules-sim/simulator.mjs';
import { resolve, applyPatch, NOW } from '../../rules-matrix/engine.mjs';
import { ast } from './shared.mjs';

export const serverTimestamp = () => ({ $srv: 1 });
export const increment = (n) => ({ $inc: n });
export const deleteField = () => ({ $del: 1 });
export const Timestamp = { fromMillis: (ms) => ({ $rel: ms - Date.now() }) };
export const doc = (db, path) => ({ db, path });

const deny = () => Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
function guard(db, op, path, newData) {
  if (db.bypass) return;
  const v = check(ast, { db: db.map, auth: db.uid, op, path, newData, now: NOW });
  if (!v.allowed) throw deny();
}
export async function getDoc({ db, path }) { guard(db, 'get', path); return { exists: () => db.map.has(path) }; }
export async function setDoc({ db, path }, data) { const nd = resolve(data); guard(db, 'create', path, nd); db.map.set(path, nd); }
export async function updateDoc({ db, path }, patch) {
  const ex = db.map.get(path); if (!ex) throw Object.assign(new Error('not found'), { code: 'not-found' });
  const nd = applyPatch(ex, patch); guard(db, 'update', path, nd); db.map.set(path, nd);
}
export async function deleteDoc({ db, path }) { guard(db, 'delete', path); db.map.delete(path); }
export function writeBatch(db) {
  const ops = [];
  return { set: (ref, data) => ops.push([ref.path, data]), commit: async () => { ops.forEach(([p, d]) => { if (!db.bypass) throw deny(); db.map.set(p, resolve(d)); }); } };
}
