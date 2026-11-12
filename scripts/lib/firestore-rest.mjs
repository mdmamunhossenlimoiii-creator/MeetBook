// Tiny Firestore REST client shared by the GitHub Actions scripts (no npm packages needed).
// Used with either a normal user's ID token (bot runner, rules apply) or a service-account
// access token (deletion / backup, rules are bypassed because Google treats it as an admin).

export const toValue = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: v.length ? { values: v.map(toValue) } : {} };
  if (typeof v === 'object') {
    const fields = {};
    for (const [k, x] of Object.entries(v)) fields[k] = toValue(x);
    return { mapValue: Object.keys(fields).length ? { fields } : {} };
  }
  throw new Error(`Cannot encode ${typeof v}`);
};
export const toFields = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, toValue(v)]));

export const fromValue = (v) => {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return new Date(v.timestampValue);
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromValue);
  if ('mapValue' in v) return fromFields(v.mapValue.fields || {});
  if ('referenceValue' in v) return v.referenceValue;
  if ('geoPointValue' in v) return v.geoPointValue;
  return null;
};
export const fromFields = (fields = {}) => Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, fromValue(v)]));
export const idOf = (name) => String(name).split('/').pop();
export const decodeDoc = (d) => ({ id: idOf(d.name), path: d.name, ...fromFields(d.fields) });

export function createClient({ projectId, fsUrl = 'https://firestore.googleapis.com', getToken }) {
  const docs = `projects/${projectId}/databases/(default)/documents`;
  const base = `${fsUrl}/v1/${docs}`;

  async function call(url, { method = 'GET', body, allow404 = false } = {}) {
    const token = await getToken();
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    if (allow404 && res.status === 404) return null;
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${url.replace(/\?key=.*/, '')} -> ${res.status} ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : {};
  }

  return {
    docs, base, call,
    // GET one document -> {id, ...fields} or null
    async get(path) {
      const d = await call(`${base}/${path}`, { allow404: true });
      return d && d.name ? decodeDoc(d) : null;
    },
    // create with auto id (or given id) -> id
    async create(collectionPath, data, id) {
      const url = `${base}/${collectionPath}${id ? `?documentId=${encodeURIComponent(id)}` : ''}`;
      const d = await call(url, { method: 'POST', body: { fields: toFields(data) } });
      return idOf(d.name);
    },
    // set/merge only the given top-level (or dotted) field paths
    async patch(path, data, fieldPaths = Object.keys(data)) {
      const qs = fieldPaths.map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&');
      return call(`${base}/${path}?${qs}`, { method: 'PATCH', body: { fields: toFields(data) } });
    },
    // replace a whole document (no update mask = overwrite)
    async set(path, data) {
      return call(`${base}/${path}`, { method: 'PATCH', body: { fields: toFields(data) } });
    },
    // runQuery with a structuredQuery; returns decoded docs
    async query(structuredQuery, parent = '') {
      const rows = await call(`${fsUrl}/v1/${docs}${parent ? `/${parent}` : ''}:runQuery`, { method: 'POST', body: { structuredQuery } });
      return (Array.isArray(rows) ? rows : []).filter((r) => r.document).map((r) => decodeDoc(r.document));
    },
    // Every doc of a collection (pages of 300)
    async listAll(collectionPath, { max = 100000 } = {}) {
      const out = [];
      let pageToken = '';
      do {
        const r = await call(`${base}/${collectionPath}?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`);
        (r.documents || []).forEach((d) => out.push(decodeDoc(d)));
        pageToken = r.nextPageToken || '';
      } while (pageToken && out.length < max);
      return out;
    },
    // delete a list of full resource names, in batches
    async deleteMany(names) {
      for (let i = 0; i < names.length; i += 400) {
        await call(`${fsUrl}/v1/${docs}:commit`, { method: 'POST', body: { writes: names.slice(i, i + 400).map((name) => ({ delete: name })) } });
      }
      return names.length;
    },
    // atomic server-side increment of one numeric field
    async increment(path, field, by = 1) {
      return call(`${fsUrl}/v1/${docs}:commit`, {
        method: 'POST',
        body: { writes: [{ update: { name: `${docs}/${path}` }, updateMask: { fieldPaths: [] }, updateTransforms: [{ fieldPath: field, increment: { integerValue: String(by) } }], currentDocument: { exists: true } }] }
      });
    }
  };
}

// helper for structured query filters
export const eq = (field, value) => ({ fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: toValue(value) } });
export const arrayContains = (field, value) => ({ fieldFilter: { field: { fieldPath: field }, op: 'ARRAY_CONTAINS', value: toValue(value) } });
export const and = (...filters) => ({ compositeFilter: { op: 'AND', filters } });
