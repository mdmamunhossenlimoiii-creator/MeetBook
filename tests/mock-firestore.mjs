// Minimal in-memory imitation of the Firestore REST API + Identity Toolkit + OAuth token endpoint.
// Only for tests of the scripts in /scripts. It does NOT evaluate firestore.rules (see README: rules need the real
// Firebase emulator or the Rules Playground).
import http from 'node:http';
import { toFields, fromFields } from '../scripts/lib/firestore-rest.mjs';
import { makeRulesGate } from './mock-rules.mjs';

// rules: true  ->  user-token requests are checked against firestore.rules (see mock-rules.mjs); default off.
export function startMock({ port = 0, seed = {}, authUsers = ['runner1'], runnerPassword = 'secret', rules = false, faults = {} } = {}) {
  const docs = new Map(); // "posts/P1" -> {fields}
  const authDeleted = [];
  const calls = [];
  let n = 0;
  let tx = 0;
  let version = 0;
  // faults (test only): { authDelete: n } -> the next n Auth deletes answer 500; { commitAfter: k } -> after k good commits, ONE commit answers 500
  const fault = { authDelete: faults.authDelete || 0, commitAfter: faults.commitAfter ?? null };
  const gate = rules ? makeRulesGate(docs) : null;
  const put = (path, obj) => docs.set(path, { fields: toFields(obj), updateTime: new Date(Date.now() + (++version)).toISOString() });
  Object.entries(seed).forEach(([p, o]) => put(p, o));

  const PRE = '/v1/projects/test-proj/databases/(default)/documents';
  const full = (p) => `projects/test-proj/databases/(default)/documents/${p}`;
  const out = (p, d) => ({ name: full(p), fields: d.fields, updateTime: d.updateTime });
  const parentOf = (p) => p.split('/').slice(0, -1).join('/');
  const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

  const val = (d, path) => path.split('.').reduce((v, k) => (v == null ? v : fromFields(v.fields ? v.fields : v)?.[k] ?? undefined), undefined);
  const getField = (d, path) => { let cur = fromFields(d.fields); for (const k of path.split('.')) { if (cur == null) return undefined; cur = cur[k]; } return cur; };
  const fv = (v) => { const o = fromFields({ x: v }).x; return o; };
  const matches = (d, w) => {
    if (!w) return true;
    if (w.compositeFilter) return w.compositeFilter.filters.every((f) => matches(d, f));
    const f = w.fieldFilter; const a = getField(d, f.field.fieldPath); const b = fv(f.value);
    if (f.op === 'EQUAL') return a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b;
    if (f.op === 'ARRAY_CONTAINS') return Array.isArray(a) && a.includes(b);
    throw new Error('mock: unsupported op ' + f.op);
  };
  const setPath = (obj, path, value) => { const ks = path.split('.'); let c = obj; ks.slice(0, -1).forEach((k) => { c[k] ||= { mapValue: { fields: {} } }; c = c[k].mapValue.fields ||= {}; }); c[ks.at(-1)] = value; };
  const getPathVal = (fields, path) => { let c = fields; const ks = path.split('.'); for (let i = 0; i < ks.length; i++) { const x = c?.[ks[i]]; if (!x) return undefined; if (i === ks.length - 1) return x; c = x.mapValue?.fields; } };

  const forbid = (res) => send(res, 403, { error: { code: 403, status: 'PERMISSION_DENIED', message: 'Missing or insufficient permissions.' } });
  const clone = (f) => JSON.parse(JSON.stringify(f));
  const ok = (req, op, path, nf) => !gate || gate.allow(req.headers.authorization, op, path, nf);

  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', (c) => { b += c; });
    req.on('end', () => {
      const body = b ? (req.headers['content-type'] || '').includes('json') ? JSON.parse(b) : b : null;
      const [path, qs = ''] = req.url.split('?');
      const params = new URLSearchParams(qs);
      calls.push(`${req.method} ${path}`);
      try {
        if (path === '/token') { // OAuth: accept any well-formed JWT assertion
          const a = new URLSearchParams(body).get('assertion') || '';
          if (a.split('.').length !== 3) return send(res, 400, { error: 'bad assertion' });
          return send(res, 200, { access_token: 'SA_TOKEN', expires_in: 3600 });
        }
        if (path === '/v1/accounts:signInWithPassword') {
          if (body.password !== runnerPassword) return send(res, 400, { error: { message: 'INVALID_PASSWORD' } });
          return send(res, 200, { idToken: 'USER_TOKEN', localId: 'runner1' });
        }
        const auth = req.headers.authorization;
        if (auth !== 'Bearer USER_TOKEN' && auth !== 'Bearer SA_TOKEN') return send(res, 401, { error: 'unauthenticated' });
        if (path.endsWith('/accounts:delete')) {
          if (auth !== 'Bearer SA_TOKEN') return send(res, 403, {});
          if (fault.authDelete > 0) { fault.authDelete--; return send(res, 500, { error: { message: 'INTERNAL' } }); }
          if (!authUsers.includes(body.localId)) return send(res, 400, { error: { message: 'USER_NOT_FOUND' } });
          authDeleted.push(body.localId); return send(res, 200, {});
        }
        if (path === '/__dump') return send(res, 200, { docs: [...docs.keys()], authDeleted, calls });
        const pm = path.match(/^\/v1\/projects\/[^/]+\/databases\/\(default\)\/documents(.*)$/);
        if (!pm) return send(res, 404, { error: 'unknown ' + path });
        const rest = decodeURIComponent(pm[1]).replace(/^\//, '');

        if (rest === ':beginTransaction') {
          return send(res, 200, { transaction: `TX${++tx}` });
        }
        if (rest === ':rollback') return send(res, 200, {});
        if (rest.endsWith(':runQuery') || rest === ':runQuery') {
          const parent = rest.replace(/:runQuery$/, '').replace(/\/$/, '');
          const q = body.structuredQuery; const cid = q.from[0].collectionId;
          let rows = [...docs.entries()].filter(([p]) => { const par = parentOf(p); return p.split('/').at(-2) === cid && (parent ? par === `${parent}/${cid}` : par === cid); })
            .filter(([, d]) => matches(d, q.where));
          if (q.orderBy) { const f = q.orderBy[0]; const dir = f.direction === 'DESCENDING' ? -1 : 1; rows.sort(([, a], [, c]) => { const x = getField(a, f.field.fieldPath), y = getField(c, f.field.fieldPath); return ((x > y) - (x < y)) * dir; }); }
          if (q.limit) rows = rows.slice(0, q.limit);
          if (rows.some(([p]) => !ok(req, 'list', p))) return forbid(res);
          return send(res, 200, rows.length ? rows.map(([p, d]) => ({ document: out(p, d) })) : [{}]);
        }
        if (rest.endsWith(':commit')) {
          if (fault.commitAfter !== null) { if (fault.commitAfter === 0) { fault.commitAfter = null; return send(res, 500, { error: 'injected commit failure' }); } fault.commitAfter--; }
          // all-or-nothing like Firestore: judge every write first, apply only if all are allowed
          const plan = [];
          for (const w of body.writes) {
            if (w.delete) { const p = w.delete.split('/documents/')[1]; if (!ok(req, 'delete', p)) return forbid(res); plan.push(() => docs.delete(p)); continue; }
            const p = w.update.name.split('/documents/')[1];
            const d = docs.get(p);
            if (w.currentDocument?.exists === true && !d) return send(res, 404, { error: 'missing ' + p });
            if (w.currentDocument?.exists === false && d) return send(res, 409, { error: 'ALREADY_EXISTS' });
            if (w.currentDocument?.updateTime && (!d || d.updateTime !== w.currentDocument.updateTime)) return send(res, 409, { error: 'ABORTED transaction conflict' });
            const nf = d ? clone(d.fields) : {};
            if (w.update.fields) {
              const masks = w.updateMask?.fieldPaths || Object.keys(w.update.fields);
              masks.forEach((m) => { const v = getPathVal(w.update.fields, m); if (v !== undefined) setPath(nf, m, v); });
            }
            for (const t of w.updateTransforms || []) {
              if (t.setToServerValue === 'REQUEST_TIME') {
                nf[t.fieldPath] = { timestampValue: new Date().toISOString() };
              } else if (t.increment) {
                const cur = nf[t.fieldPath]; const nv = Number(cur?.integerValue || 0) + Number(t.increment.integerValue);
                nf[t.fieldPath] = { integerValue: String(nv) };
              }
            }
            const op = d ? 'update' : 'create';
            if (!ok(req, op, p, nf)) return forbid(res);
            plan.push(() => docs.set(p, { fields: nf, updateTime: new Date(Date.now() + (++version)).toISOString() }));
          }
          plan.forEach((f) => f());
          return send(res, 200, { writeResults: [{}] });
        }
        const isCollection = rest.split('/').length % 2 === 1;
        if (req.method === 'GET') {
          if (isCollection) {
            if ([...docs.keys()].some((p) => parentOf(p) === rest && !ok(req, 'list', p))) return forbid(res);
            const all = [...docs.entries()].filter(([p]) => parentOf(p) === rest).map(([p, d]) => out(p, d));
            const size = Number(params.get('pageSize') || 100), start = Number(params.get('pageToken') || 0);
            const list = all.slice(start, start + size); // real pagination, so scripts must follow nextPageToken
            return send(res, 200, list.length ? { documents: list, ...(start + size < all.length ? { nextPageToken: String(start + size) } : {}) } : {});
          }
          if (!ok(req, 'get', rest)) return forbid(res);
          const d = docs.get(rest); return d ? send(res, 200, out(rest, d)) : send(res, 404, { error: 'not found' });
        }
        if (req.method === 'POST' && isCollection) {
          const id = params.get('documentId') || `A${++n}`; const p = `${rest}/${id}`;
          if (!ok(req, 'create', p, body.fields)) return forbid(res);
          if (docs.has(p)) return send(res, 409, { error: 'ALREADY_EXISTS' });
          docs.set(p, { fields: body.fields }); return send(res, 200, out(p, docs.get(p)));
        }
        if (req.method === 'PATCH') {
          const masks = params.getAll('updateMask.fieldPaths');
          if (!masks.length) {
            if (!ok(req, docs.has(rest) ? 'update' : 'create', rest, body.fields)) return forbid(res);
            docs.set(rest, { fields: body.fields }); return send(res, 200, out(rest, docs.get(rest)));
          }
          const existed = docs.has(rest);
          const d = { fields: clone((docs.get(rest) || { fields: {} }).fields) };
          masks.forEach((m) => { const v = getPathVal(body.fields, m); if (v !== undefined) setPath(d.fields, m, v); });
          if (!ok(req, existed ? 'update' : 'create', rest, d.fields)) return forbid(res);
          docs.set(rest, d); return send(res, 200, out(rest, d));
        }
        return send(res, 404, { error: 'unsupported ' + req.method + ' ' + rest });
      } catch (e) { return send(res, 500, { error: String(e.message) }); }
    });
  });
  return new Promise((resolve) => srv.listen(port, '127.0.0.1', () => resolve({
    url: `http://127.0.0.1:${srv.address().port}`, docs, authDeleted, calls, put, denied: gate ? gate.denied : [],
    get: (p) => (docs.has(p) ? fromFields(docs.get(p).fields) : null),
    ids: (col) => [...docs.keys()].filter((p) => parentOf(p) === col).map((p) => p.split('/').at(-1)),
    close: () => new Promise((r) => srv.close(r))
  })));
}
