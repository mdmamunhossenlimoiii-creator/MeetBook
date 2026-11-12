// Service-account -> OAuth2 access token using only Node's built-in crypto (no firebase-admin needed).
// The service-account JSON is read from the FIREBASE_SERVICE_ACCOUNT environment variable, which comes
// from a GitHub Actions secret. It is never written to disk or printed.
import { createSign } from 'node:crypto';

const b64u = (b) => Buffer.from(b).toString('base64url');

export function parseServiceAccount(raw) {
  let sa;
  try { sa = JSON.parse(raw); } catch { throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON.'); }
  if (!sa.client_email || !sa.private_key || !sa.project_id) throw new Error('FIREBASE_SERVICE_ACCOUNT is missing client_email / private_key / project_id.');
  return sa;
}

export function makeTokenGetter(sa, { tokenUrl = process.env.TOKEN_URL || 'https://oauth2.googleapis.com/token' } = {}) {
  let cached = null;
  return async () => {
    if (cached && cached.exp > Date.now() + 60000) return cached.token;
    const now = Math.floor(Date.now() / 1000);
    const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claim = b64u(JSON.stringify({
      iss: sa.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform',
      aud: tokenUrl, iat: now, exp: now + 3600
    }));
    const sig = createSign('RSA-SHA256').update(`${head}.${claim}`).sign(sa.private_key, 'base64url');
    const res = await fetch(tokenUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claim}.${sig}` })
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.access_token) throw new Error(`Could not get an access token (${res.status}): ${String(j.error_description || j.error || '').slice(0, 200)}`);
    cached = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
    return cached.token;
  };
}
