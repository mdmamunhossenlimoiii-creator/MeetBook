// A small INTERPRETER for the subset of the Firestore security-rules language that firestore.rules uses.
//
// IMPORTANT: this is NOT Google's rules compiler/engine. It exists so the permission matrix can be run locally
// and in every CI run without Java or network. The same matrix is ALSO run against the real Firebase Emulator
// (tests/emulator/, CI job "rules-emulator"). If the two ever disagree, the emulator is right.
//
// Semantics implemented: match / wildcards / nested matches, functions with `let`/`return`, get() / exists(),
// request.auth / request.time / request.resource / resource, Map.get/keys/diff/size, MapDiff.affectedKeys,
// List/Set hasAny/hasAll/hasOnly/toSet/difference, `in`, `is`, `matches`, math.abs, duration.value, timestamps,
// ternary, and the error rules: an evaluation error makes that `allow` fail; `a || b` / `a && b` are
// commutative about errors (error || true == true, error && false == false).

export class RuleError extends Error {}
export class Ts { constructor(ms) { this.ms = ms; } }
class Dur { constructor(ms) { this.ms = ms; } }
class Path { constructor(p) { this.p = p; } }
const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Ts) && !(v instanceof Dur) && !(v instanceof Set) && !(v instanceof Path) && !(v instanceof MapDiff);
class MapDiff { constructor(a, b) { this.a = a; this.b = b; } }

// ------------------------------------------------------------------ lexer
function lex(src) {
  const toks = []; let i = 0;
  const push = (t, v, extra = {}) => toks.push({ t, v, ...extra });
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    const prev = toks[toks.length - 1];
    if (prev && prev.t === 'id' && prev.v === 'match') { // match pattern like /admins/{uid}
      const m = /^\/(?:[^\s{]|\{[^}]*\})*/.exec(src.slice(i));
      push('mpath', m[0]); i += m[0].length; continue;
    }
    if (c === '/' && src.startsWith('/databases/', i)) { // path literal with $(expr) interpolation
      let j = i, cur = ''; const parts = [];
      while (j < src.length) {
        const d = src[j];
        if (d === '$' && src[j + 1] === '(') {
          let depth = 1, k = j + 2;
          while (k < src.length && depth) { if (src[k] === '(') depth++; else if (src[k] === ')') depth--; k++; }
          parts.push({ lit: cur }); cur = ''; parts.push({ expr: src.slice(j + 2, k - 1) }); j = k; continue;
        }
        if (/[A-Za-z0-9_\-/]/.test(d)) { cur += d; j++; continue; }
        break;
      }
      parts.push({ lit: cur }); push('path', null, { parts }); i = j; continue;
    }
    if (/[0-9]/.test(c)) { const m = /^[0-9]+(\.[0-9]+)?/.exec(src.slice(i)); push('num', Number(m[0])); i += m[0].length; continue; }
    if (c === "'" || c === '"') {
      let j = i + 1, s = '';
      while (j < src.length && src[j] !== c) { if (src[j] === '\\') { j++; } s += src[j]; j++; }
      push('str', s); i = j + 1; continue;
    }
    if (/[A-Za-z_]/.test(c)) { const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i)); push('id', m[0]); i += m[0].length; continue; }
    const two = src.slice(i, i + 2);
    if (['&&', '||', '==', '!=', '<=', '>='].includes(two)) { push('op', two); i += 2; continue; }
    push('op', c); i++;
  }
  toks.push({ t: 'eof' });
  return toks;
}

// ------------------------------------------------------------------ parser
class Parser {
  constructor(toks) { this.t = toks; this.i = 0; }
  peek(o = 0) { return this.t[this.i + o]; }
  next() { return this.t[this.i++]; }
  is(t, v) { const k = this.peek(); return k.t === t && (v === undefined || k.v === v); }
  eat(t, v) { if (this.is(t, v)) return this.next(); throw new Error(`parse error: expected ${v || t} got ${JSON.stringify(this.peek())}`); }

  parseFile() {
    while (!this.is('id', 'service')) this.next();
    this.next(); this.eat('id', 'cloud'); this.eat('op', '.'); this.eat('id', 'firestore'); this.eat('op', '{');
    const body = this.parseBody(null); this.eat('op', '}');
    return body;
  }
  parseBody(parent) {
    const block = { parent, functions: {}, matches: [], allows: [] };
    while (!this.is('op', '}')) {
      const k = this.next();
      if (k.v === 'function') {
        const name = this.eat('id').v; this.eat('op', '('); const params = [];
        while (!this.is('op', ')')) { params.push(this.eat('id').v); if (this.is('op', ',')) this.next(); }
        this.eat('op', ')'); this.eat('op', '{');
        const lets = []; let ret = null;
        while (!this.is('op', '}')) {
          if (this.is('id', 'let')) { this.next(); const n = this.eat('id').v; this.eat('op', '='); lets.push([n, this.expr()]); this.eat('op', ';'); }
          else { this.eat('id', 'return'); ret = this.expr(); this.eat('op', ';'); }
        }
        this.eat('op', '}');
        block.functions[name] = { params, lets, ret, block };
      } else if (k.v === 'match') {
        const pat = this.eat('mpath').v; this.eat('op', '{');
        const child = this.parseBody(block); this.eat('op', '}');
        child.pattern = pat.split('/').filter(Boolean);
        block.matches.push(child);
      } else if (k.v === 'allow') {
        const ops = [this.eat('id').v];
        while (this.is('op', ',')) { this.next(); ops.push(this.eat('id').v); }
        let cond = { k: 'lit', v: false };
        if (this.is('op', ':')) { this.next(); this.eat('id', 'if'); cond = this.expr(); }
        this.eat('op', ';');
        block.allows.push({ ops, cond });
      } else throw new Error('parse error at ' + JSON.stringify(k));
    }
    return block;
  }
  expr() { return this.tern(); }
  tern() {
    const c = this.or();
    if (this.is('op', '?')) { this.next(); const a = this.tern(); this.eat('op', ':'); const b = this.tern(); return { k: 'tern', c, a, b }; }
    return c;
  }
  or() { let l = this.and(); while (this.is('op', '||')) { this.next(); l = { k: 'or', l, r: this.and() }; } return l; }
  and() { let l = this.rel(); while (this.is('op', '&&')) { this.next(); l = { k: 'and', l, r: this.rel() }; } return l; }
  rel() {
    let l = this.add();
    for (;;) {
      const p = this.peek();
      if (p.t === 'op' && ['==', '!=', '<', '>', '<=', '>='].includes(p.v)) { this.next(); l = { k: 'bin', op: p.v, l, r: this.add() }; }
      else if (p.t === 'id' && p.v === 'in') { this.next(); l = { k: 'in', l, r: this.add() }; }
      else if (p.t === 'id' && p.v === 'is') { this.next(); l = { k: 'is', e: l, type: this.eat('id').v }; }
      else return l;
    }
  }
  add() { let l = this.mul(); while (this.is('op', '+') || this.is('op', '-')) { const op = this.next().v; l = { k: 'bin', op, l, r: this.mul() }; } return l; }
  mul() { let l = this.unary(); while (this.is('op', '*') || this.is('op', '/') || this.is('op', '%')) { const op = this.next().v; l = { k: 'bin', op, l, r: this.unary() }; } return l; }
  unary() {
    if (this.is('op', '!')) { this.next(); return { k: 'not', e: this.unary() }; }
    if (this.is('op', '-')) { this.next(); return { k: 'neg', e: this.unary() }; }
    return this.post();
  }
  post() {
    let e = this.primary();
    for (;;) {
      if (this.is('op', '.')) {
        this.next(); const n = this.eat('id').v;
        if (this.is('op', '(')) e = { k: 'mcall', o: e, n, args: this.args() }; else e = { k: 'mem', o: e, n };
      } else if (this.is('op', '[')) { this.next(); const i = this.expr(); this.eat('op', ']'); e = { k: 'idx', o: e, i }; }
      else return e;
    }
  }
  args() { this.eat('op', '('); const a = []; while (!this.is('op', ')')) { a.push(this.expr()); if (this.is('op', ',')) this.next(); } this.eat('op', ')'); return a; }
  primary() {
    const k = this.next();
    if (k.t === 'num' || k.t === 'str') return { k: 'lit', v: k.v };
    if (k.t === 'path') return { k: 'path', parts: k.parts.map((p) => (p.expr !== undefined ? { expr: new Parser(lex(p.expr)).expr() } : p)) };
    if (k.t === 'id') {
      if (k.v === 'true') return { k: 'lit', v: true };
      if (k.v === 'false') return { k: 'lit', v: false };
      if (k.v === 'null') return { k: 'lit', v: null };
      if (this.is('op', '(')) return { k: 'call', n: k.v, args: this.args() };
      return { k: 'id', n: k.v };
    }
    if (k.t === 'op' && k.v === '(') { const e = this.expr(); this.eat('op', ')'); return e; }
    if (k.t === 'op' && k.v === '[') { const items = []; while (!this.is('op', ']')) { items.push(this.expr()); if (this.is('op', ',')) this.next(); } this.eat('op', ']'); return { k: 'list', items }; }
    if (k.t === 'op' && k.v === '{') { const entries = []; while (!this.is('op', '}')) { const key = this.next().v; this.eat('op', ':'); entries.push([key, this.expr()]); if (this.is('op', ',')) this.next(); } this.eat('op', '}'); return { k: 'map', entries }; }
    throw new Error('parse error: unexpected ' + JSON.stringify(k));
  }
}

export const parseRules = (text) => new Parser(lex(text)).parseFile();

// ------------------------------------------------------------------ values
const keyEq = (a, b) => deepEq(a, b);
function deepEq(a, b) {
  if (a === b) return true;
  if (a instanceof Ts && b instanceof Ts) return a.ms === b.ms;
  if (a instanceof Dur && b instanceof Dur) return a.ms === b.ms;
  if (a instanceof Set && b instanceof Set) return a.size === b.size && [...a].every((x) => [...b].some((y) => deepEq(x, y)));
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => deepEq(x, b[i]));
  if (isMap(a) && isMap(b)) { const ka = Object.keys(a), kb = Object.keys(b); return ka.length === kb.length && ka.every((k) => Object.hasOwn(b, k) && deepEq(a[k], b[k])); }
  return false;
}
const typeOf = (v) => v === null ? 'null' : typeof v === 'string' ? 'string' : typeof v === 'boolean' ? 'bool' : typeof v === 'number' ? (Number.isInteger(v) ? 'int' : 'float')
  : Array.isArray(v) ? 'list' : v instanceof Ts ? 'timestamp' : v instanceof Dur ? 'duration' : v instanceof Set ? 'set' : v instanceof Path ? 'path' : 'map';
const need = (c, m) => { if (!c) throw new RuleError(m); };
const asSet = (v) => (v instanceof Set ? v : Array.isArray(v) ? new Set(v) : (need(false, 'not a set/list'), null));
const has = (set, x) => [...set].some((y) => deepEq(x, y));

// ------------------------------------------------------------------ evaluator
function evalNode(n, env) {
  switch (n.k) {
    case 'lit': return n.v;
    case 'id': {
      if (Object.hasOwn(env.vars, n.n)) return env.vars[n.n];
      if (n.n === 'request') return env.ctx.request;
      if (n.n === 'resource') return env.ctx.resource;
      if (n.n === 'math' || n.n === 'duration') return { __ns: n.n };
      throw new RuleError('unknown variable ' + n.n);
    }
    case 'path': {
      const s = n.parts.map((p) => (p.expr ? String(evalNode(p.expr, env)) : p.lit)).join('');
      return new Path(s);
    }
    case 'list': return n.items.map((x) => evalNode(x, env));
    case 'map': return Object.fromEntries(n.entries.map(([k, v]) => [k, evalNode(v, env)]));
    case 'not': { const v = evalNode(n.e, env); need(typeof v === 'boolean', '! needs bool'); return !v; }
    case 'neg': { const v = evalNode(n.e, env); need(typeof v === 'number', '- needs number'); return -v; }
    case 'tern': { const c = evalNode(n.c, env); need(typeof c === 'boolean', '?: needs bool'); return c ? evalNode(n.a, env) : evalNode(n.b, env); }
    case 'or': case 'and': {
      const isOr = n.k === 'or'; const decisive = isOr; // true decides ||, false decides &&
      const tryEval = (x) => { try { const v = evalNode(x, env); need(typeof v === 'boolean', 'logical operand must be bool'); return { v }; } catch (e) { if (e instanceof RuleError) return { err: e }; throw e; } };
      const l = tryEval(n.l);
      if (l.v === decisive) return decisive;
      const r = tryEval(n.r);
      if (r.v === decisive) return decisive;
      if (l.err) throw l.err;
      if (r.err) throw r.err;
      return !decisive;
    }
    case 'bin': return binop(n.op, evalNode(n.l, env), evalNode(n.r, env));
    case 'in': {
      const x = evalNode(n.l, env), c = evalNode(n.r, env);
      if (Array.isArray(c) || c instanceof Set) return has(c, x);
      if (isMap(c)) { need(typeof x === 'string', 'map key must be string'); return Object.hasOwn(c, x); }
      throw new RuleError('in: bad right operand');
    }
    case 'is': {
      const v = evalNode(n.e, env); const t = typeOf(v);
      return n.type === t || (n.type === 'number' && (t === 'int' || t === 'float'));
    }
    case 'mem': {
      const o = evalNode(n.o, env);
      need(o !== null && o !== undefined, `member .${n.n} of null`);
      need(isMap(o) && Object.hasOwn(o, n.n), `no field ${n.n}`);
      return o[n.n];
    }
    case 'idx': {
      const o = evalNode(n.o, env), i = evalNode(n.i, env);
      if (Array.isArray(o)) { need(Number.isInteger(i) && i >= 0 && i < o.length, 'index out of range'); return o[i]; }
      need(isMap(o) && typeof i === 'string' && Object.hasOwn(o, i), 'no such key');
      return o[i];
    }
    case 'call': return callFn(n, env);
    case 'mcall': return method(evalNode(n.o, env), n.n, n.args.map((a) => evalNode(a, env)));
    default: throw new Error('unknown node ' + n.k);
  }
}

function binop(op, a, b) {
  if (op === '==') return deepEq(a, b);
  if (op === '!=') return !deepEq(a, b);
  if (op === '+') {
    if (a instanceof Ts && b instanceof Dur) return new Ts(a.ms + b.ms);
    if (typeof a === 'string' && typeof b === 'string') return a + b;
    if (typeof a === 'number' && typeof b === 'number') return a + b;
    if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
    throw new RuleError('bad + operands');
  }
  if (['-', '*', '/', '%'].includes(op)) { need(typeof a === 'number' && typeof b === 'number', 'arith needs numbers'); return op === '-' ? a - b : op === '*' ? a * b : op === '/' ? a / b : a % b; }
  const cmp = (x, y) => {
    if (typeof x === 'number' && typeof y === 'number') return x - y;
    if (typeof x === 'string' && typeof y === 'string') return x < y ? -1 : x > y ? 1 : 0;
    if (x instanceof Ts && y instanceof Ts) return x.ms - y.ms;
    throw new RuleError('cannot compare ' + typeOf(x) + ' with ' + typeOf(y));
  };
  const c = cmp(a, b);
  return op === '<' ? c < 0 : op === '>' ? c > 0 : op === '<=' ? c <= 0 : c >= 0;
}

function callFn(n, env) {
  const args = n.args.map((a) => evalNode(a, env));
  if (n.n === 'get' || n.n === 'exists' || n.n === 'getAfter' || n.n === 'existsAfter') {
    need(args[0] instanceof Path, 'get/exists need a path');
    const key = args[0].p.replace(/^\/databases\/[^/]+\/documents\//, '');
    env.ctx.reads = (env.ctx.reads || 0) + 1;
    (env.ctx.paths ||= new Set()).add(key);
    const d = n.n === 'getAfter' && key === env.ctx.request.path && env.ctx.request.resource
      ? env.ctx.request.resource.data
      : env.ctx.db.get(key);
    if (n.n === 'exists' || n.n === 'existsAfter') return d !== undefined;
    need(d !== undefined, 'document not found: ' + key);
    return { id: key.split('/').pop(), data: d };
  }
  // user function: looked up through the chain of enclosing match blocks
  let b = env.block, f;
  while (b && !f) { f = b.functions[n.n]; b = b.parent; }
  need(f, 'unknown function ' + n.n);
  need(args.length === f.params.length, 'arity of ' + n.n);
  env.ctx.depth = (env.ctx.depth || 0) + 1;
  need(env.ctx.depth < 20, 'function call depth exceeded');
  try {
    const vars = { ...(f.block._vars || {}) };
    f.params.forEach((p, i) => { vars[p] = args[i]; });
    const e2 = { ...env, vars, block: f.block };
    for (const [name, ex] of f.lets) vars[name] = evalNode(ex, e2);
    return evalNode(f.ret, e2);
  } finally { env.ctx.depth--; }
}

function method(o, name, a) {
  if (o instanceof Ts && name === 'date') return new Date(o.ms).toISOString().slice(0, 10);
  if (o && o.__ns === 'math' && name === 'abs') { need(typeof a[0] === 'number', 'abs'); return Math.abs(a[0]); }
  if (o && o.__ns === 'duration' && name === 'value') { const u = { h: 3600e3, m: 60e3, s: 1e3, d: 86400e3, w: 604800e3 }[a[1]]; need(u, 'duration unit'); return new Dur(a[0] * u); }
  if (typeof o === 'string') {
    if (name === 'size') return o.length;
    if (name === 'matches') return new RegExp(`^(?:${a[0]})$`).test(o);
    if (name === 'lower') return o.toLowerCase();
    if (name === 'upper') return o.toUpperCase();
  }
  if (Array.isArray(o)) {
    if (name === 'size') return o.length;
    if (name === 'toSet') return new Set(o);
    if (name === 'hasAny') return a[0].some((x) => has(o, x));
    if (name === 'hasAll') return a[0].every((x) => has(o, x));
    if (name === 'hasOnly') return o.every((x) => has(asSet(a[0]), x));
  }
  if (o instanceof Set) {
    if (name === 'size') return o.size;
    if (name === 'hasAny') return [...asSet(a[0])].some((x) => has(o, x));
    if (name === 'hasAll') return [...asSet(a[0])].every((x) => has(o, x));
    if (name === 'hasOnly') return [...o].every((x) => has(asSet(a[0]), x));
    if (name === 'difference') return new Set([...o].filter((x) => !has(asSet(a[0]), x)));
    if (name === 'intersection') return new Set([...o].filter((x) => has(asSet(a[0]), x)));
    if (name === 'union') return new Set([...o, ...asSet(a[0])]);
  }
  if (o instanceof MapDiff) {
    const keys = new Set([...Object.keys(o.a), ...Object.keys(o.b)]);
    const state = (k) => (!Object.hasOwn(o.b, k) ? 'added' : !Object.hasOwn(o.a, k) ? 'removed' : deepEq(o.a[k], o.b[k]) ? 'same' : 'changed');
    if (name === 'affectedKeys') return new Set([...keys].filter((k) => state(k) !== 'same'));
    if (name === 'addedKeys') return new Set([...keys].filter((k) => state(k) === 'added'));
    if (name === 'removedKeys') return new Set([...keys].filter((k) => state(k) === 'removed'));
    if (name === 'changedKeys') return new Set([...keys].filter((k) => state(k) === 'changed'));
    if (name === 'unchangedKeys') return new Set([...keys].filter((k) => state(k) === 'same'));
  }
  if (isMap(o)) {
    if (name === 'get') { return Object.hasOwn(o, a[0]) ? o[a[0]] : a[1]; }
    if (name === 'keys') return new Set(Object.keys(o));
    if (name === 'size') return Object.keys(o).length;
    if (name === 'diff') { need(isMap(a[0]), 'diff needs a map'); return new MapDiff(a[0], o); } // x.diff(y): affected = keys that differ
  }
  throw new RuleError(`no method ${name} on ${typeOf(o)}`);
}
// NOTE: in rules, `request.resource.data.diff(resource.data)` -> keys whose value differs between the two maps (order irrelevant for affectedKeys).

// ------------------------------------------------------------------ request evaluation
const OPS = { get: ['read', 'get'], list: ['read', 'list'], create: ['write', 'create'], update: ['write', 'update'], delete: ['write', 'delete'] };

// db: Map<"coll/id", data>. ctx: { auth: uid|null, op, path, newData, now }
export function check(ast, { db, auth, op, path, newData, now = Date.now() }) {
  const existing = db.get(path);
  const request = {
    auth: auth ? { uid: auth, token: {} } : null,
    time: new Ts(now), method: op, path,
    resource: newData === undefined ? null : { data: newData, id: path.split('/').pop() }
  };
  const ctx = { db, request, resource: existing === undefined ? null : { data: existing, id: path.split('/').pop() }, reads: 0 };
  const segs = ['databases', '(default)', 'documents', ...path.split('/')];
  const verdict = { allowed: false, by: [], errors: [], reads: 0 };

  function walk(block, rest, vars) {
    block._vars = vars;
    if (rest.length === 0) {
      for (const al of block.allows) {
        if (!al.ops.some((o) => OPS[op].includes(o))) continue;
        try {
          const v = evalNode(al.cond, { vars, block, ctx });
          if (v === true) { verdict.allowed = true; verdict.by.push(block.pattern.join('/')); }
        } catch (e) { if (e instanceof RuleError) verdict.errors.push(e.message); else throw e; }
      }
    }
    for (const m of block.matches) {
      let i = 0; const v2 = { ...vars }; let ok = true;
      for (const seg of m.pattern) {
        const w = /^\{(\w+)(=\*\*)?\}$/.exec(seg);
        if (w && w[2]) { v2[w[1]] = rest.slice(i).join('/'); i = rest.length; }
        else if (w) { if (i >= rest.length) { ok = false; break; } v2[w[1]] = rest[i++]; }
        else if (rest[i] === seg) i++;
        else { ok = false; break; }
      }
      if (ok) walk(m, rest.slice(i), v2);
    }
  }
  walk(ast, segs, {});
  verdict.reads = ctx.reads;
  verdict.uniqueReads = ctx.paths ? ctx.paths.size : 0;
  return verdict;
}

// helpers for tests -----------------------------------------------------
export const toTs = (ms) => new Ts(ms);
export { deepEq };
