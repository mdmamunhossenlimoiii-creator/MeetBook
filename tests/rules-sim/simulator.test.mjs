// The interpreter must itself be trusted before its verdicts mean anything. These tests pin the Firestore-rules
// semantics we rely on (taken from Google's rules language reference) on tiny rule sets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRules, check, toTs } from './simulator.mjs';

const rules = (body) => parseRules(`rules_version = '2';\n// comment\nservice cloud.firestore { match /databases/{database}/documents {\n function f(a) { return a + 1; }\n match /t/{id} { ${body} } } }`);
const run = (cond, o = {}) => check(rules(`allow read, create, update, delete: if ${cond};`), { db: new Map(Object.entries(o.db || {})), auth: o.auth === undefined ? 'u1' : o.auth, op: o.op || 'get', path: o.path || 't/a', newData: o.newData, now: 1000 }).allowed;

test('no matching rule means deny; allow without condition means deny', () => {
  assert.equal(check(rules('allow read: if true;'), { db: new Map(), auth: 'u', op: 'create', path: 't/a', newData: {} }).allowed, false);
  assert.equal(check(rules('allow read;'), { db: new Map(), auth: 'u', op: 'get', path: 't/a' }).allowed, false);
  assert.equal(check(rules('allow read: if true;'), { db: new Map(), auth: 'u', op: 'get', path: 'other/a' }).allowed, false);
});
test('an evaluation error makes the rule fail (deny), e.g. auth is null', () => {
  assert.equal(run('request.auth.uid == "u1"', { auth: null }), false);
  assert.equal(run('request.auth.uid == "u1"'), true);
  assert.equal(run('request.auth != null', { auth: null }), false);
});
test('|| and && are commutative about errors', () => {
  const err = 'request.auth.uid == "u1"'; // errors when signed out
  assert.equal(run(`true || ${err}`, { auth: null }), true);
  assert.equal(run(`${err} || true`, { auth: null }), true);
  assert.equal(run(`false && ${err}`, { auth: null }), false);
  assert.equal(run(`${err} || false`, { auth: null }), false);
  assert.equal(run(`${err} && true`, { auth: null }), false);
});
test('missing fields error; Map.get supplies a default; missing documents error', () => {
  const db = { 't/a': { x: 1 } };
  assert.equal(run('resource.data.y == 1', { db }), false);
  assert.equal(run('resource.data.get("y", 1) == 1', { db }), true);
  assert.equal(run('resource.data.x == 1', { db }), true);
  assert.equal(run('get(/databases/$(database)/documents/t/zzz).data.x == 1', { db }), false);
  assert.equal(run('!exists(/databases/$(database)/documents/t/zzz)', { db }), true);
  assert.equal(run('exists(/databases/$(database)/documents/t/a)', { db }), true);
});
test('in works for lists and for map keys; hasAny/hasAll/hasOnly', () => {
  assert.equal(run('"a" in ["a","b"]'), true);
  assert.equal(run('"c" in ["a","b"]'), false);
  assert.equal(run('"k" in {"k": 1}'), true);
  assert.equal(run('["a","b"].hasAny(["b","z"])'), true);
  assert.equal(run('["a","b"].hasAll(["a","z"])'), false);
  assert.equal(run('["a"].hasOnly(["a","b"])'), true);
  assert.equal(run('["a","c"].hasOnly(["a","b"])'), false);
  assert.equal(run('[].hasOnly(["a"])'), true);
});
test('diff().affectedKeys() sees added, removed and changed keys, not unchanged ones', () => {
  const db = { 't/a': { a: 1, b: 2, c: 3 } };
  const u = (nd, cond) => run(cond, { db, op: 'update', newData: nd });
  assert.equal(u({ a: 1, b: 2, c: 3 }, 'request.resource.data.diff(resource.data).affectedKeys().size() == 0'), true);
  assert.equal(u({ a: 9, b: 2, c: 3 }, 'request.resource.data.diff(resource.data).affectedKeys().hasOnly(["a"])'), true);
  assert.equal(u({ a: 9, b: 2, c: 3, d: 1 }, 'request.resource.data.diff(resource.data).affectedKeys().hasOnly(["a"])'), false);
  assert.equal(u({ a: 1, b: 2 }, 'request.resource.data.diff(resource.data).affectedKeys().hasOnly(["c"])'), true);
  assert.equal(u({ a: 9, b: 2, c: 3 }, 'request.resource.data.diff(resource.data).affectedKeys().hasAny(["b","c"])'), false);
});
test('keys().hasOnly, size(), string methods and full-match regex', () => {
  assert.equal(run('request.resource.data.keys().hasOnly(["a","b"])', { op: 'create', newData: { a: 1 } }), true);
  assert.equal(run('request.resource.data.keys().hasOnly(["a","b"])', { op: 'create', newData: { a: 1, z: 1 } }), false);
  assert.equal(run('"abc".size() == 3'), true);
  assert.equal(run('"bot_01".matches("bot_[0-9][0-9]")'), true);
  assert.equal(run('"bot_012".matches("bot_[0-9][0-9]")'), false); // matches() must match the WHOLE string
  assert.equal(run('"xbot_01".matches("bot_.*")'), false);
});
test('timestamps and durations compare; request.time is the evaluation time', () => {
  assert.equal(run('request.time == request.resource.data.t', { op: 'create', newData: { t: toTs(1000) } }), true);
  assert.equal(run('request.resource.data.t < request.time', { op: 'create', newData: { t: toTs(500) } }), true);
  assert.equal(run('request.resource.data.t <= request.time + duration.value(1, "h")', { op: 'create', newData: { t: toTs(1000 + 3600e3) } }), true);
  assert.equal(run('request.resource.data.t <= request.time + duration.value(1, "h")', { op: 'create', newData: { t: toTs(1000 + 3600e3 + 1) } }), false);
});
test('type checks, ternary, precedence, arithmetic, functions', () => {
  assert.equal(run('"x" is string && 1 is int && true is bool && [] is list && {} is map && request.time is timestamp'), true);
  assert.equal(run('"x" is int'), false);
  assert.equal(run('(1 < 2 ? "a" : "b") == "a"'), true);
  assert.equal(run('true || false && false'), true); // && binds tighter than ||
  assert.equal(run('!true || true'), true);
  assert.equal(run('f(1) == 2'), true);
  assert.equal(run('math.abs(-3) == 3 && 7 % 4 == 3'), true);
});
test('create has request.resource but no resource; get/delete have resource but no request.resource', () => {
  assert.equal(run('resource == null', { op: 'create', path: 't/new', newData: {} }), true);
  assert.equal(run('request.resource == null', { op: 'delete', db: { 't/a': { x: 1 } } }), true);
  assert.equal(run('resource != null', { op: 'delete', db: { 't/a': { x: 1 } } }), true);
});
test('nested matches and recursive wildcards', () => {
  const ast = parseRules(`service cloud.firestore { match /databases/{database}/documents { match /p/{pid} { match /c/{cid} { allow read: if pid == "P" && cid == "C"; } } match /{path=**} { allow read: if false; } } }`);
  assert.equal(check(ast, { db: new Map(), auth: 'u', op: 'get', path: 'p/P/c/C' }).allowed, true);
  assert.equal(check(ast, { db: new Map(), auth: 'u', op: 'get', path: 'p/P/c/X' }).allowed, false);
});
test('the real rules file parses and contains the expected top-level collections', async () => {
  const { RULES_TEXT } = await import('../rules-matrix/engine.mjs');
  for (const c of ['admins', 'adminLogs', 'settings', 'posts', 'users', 'deletionRequests', 'botInbox', 'chats']) assert.match(RULES_TEXT, new RegExp(`match /${c}/`));
});
