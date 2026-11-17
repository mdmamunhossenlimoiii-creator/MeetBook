const FIREBASE_JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const FIRESTORE_DOCUMENTS_BASE = "https://firestore.googleapis.com/v1/projects/";
const CLOUDINARY_UPLOAD_BASE = "https://api.cloudinary.com/v1_1/";
const UPLOAD_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_UPLOADS_PER_WINDOW = 20;
const UPLOAD_COOLDOWN_MS = 5_000;
const UPLOAD_TIMESTAMPS_KEY = "upload-timestamps";

function json(data, status, origin, allowedOrigin) {
  const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "vary": "Origin" };
  if (origin && origin === allowedOrigin) {
    headers["access-control-allow-origin"] = origin;
    headers["access-control-allow-methods"] = "POST, OPTIONS";
    headers["access-control-allow-headers"] = "Authorization, Content-Type";
    headers["access-control-max-age"] = "600";
  }
  return new Response(JSON.stringify(data), { status, headers });
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function decodeJsonPart(value) {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
}

async function verifyFirebaseToken(token, projectId, fetcher = fetch) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3 || !projectId) throw new Error("unauthorized");
  let header, claims;
  try { header = decodeJsonPart(parts[0]); claims = decodeJsonPart(parts[1]); }
  catch { throw new Error("unauthorized"); }
  const now = Math.floor(Date.now() / 1000);
  if (header.alg !== "RS256" || !header.kid || claims.aud !== projectId ||
      claims.iss !== "https://securetoken.google.com/" + projectId ||
      typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 128 ||
      !Number.isFinite(claims.exp) || claims.exp <= now ||
      !Number.isFinite(claims.iat) || claims.iat > now + 60 ||
      !Number.isFinite(claims.auth_time) || claims.auth_time > now + 60) {
    throw new Error("unauthorized");
  }
  const response = await fetcher(FIREBASE_JWKS_URL);
  if (!response.ok) throw new Error("auth_keys_unavailable");
  const jwks = await response.json();
  const jwk = (jwks.keys || []).find((key) => key.kid === header.kid && key.kty === "RSA");
  if (!jwk) throw new Error("unauthorized");
  const key = await crypto.subtle.importKey("jwk", jwk, {
    name: "RSASSA-PKCS1-v1_5", hash: "SHA-256"
  }, false, ["verify"]);
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5", key, decodeBase64Url(parts[2]),
    new TextEncoder().encode(parts[0] + "." + parts[1])
  );
  if (!valid) throw new Error("unauthorized");
  return claims.sub;
}

async function verifyAccountEligibility(uid, token, projectId, fetcher = fetch) {
  if (!uid || !token || !projectId) throw new Error("account_status_unavailable");
  const documentUrl = FIRESTORE_DOCUMENTS_BASE + encodeURIComponent(projectId) +
    "/databases/(default)/documents/users/" + encodeURIComponent(uid);
  let response;
  try {
    response = await fetcher(documentUrl, {
      headers: { authorization: "Bearer " + token, accept: "application/json" },
      cache: "no-store"
    });
  } catch {
    throw new Error("account_status_unavailable");
  }
  if (!response.ok) throw new Error("account_status_unavailable");

  let document;
  try { document = await response.json(); }
  catch { throw new Error("account_status_unavailable"); }
  const fields = document && document.fields;
  // Missing or malformed account state is not treated as an eligible account.
  if (!fields || !fields.banned || fields.banned.booleanValue !== false) {
    throw new Error("account_not_eligible");
  }

  const suspension = fields.suspendedUntil;
  if (suspension && !Object.prototype.hasOwnProperty.call(suspension, "nullValue")) {
    const until = typeof suspension.timestampValue === "string" ? Date.parse(suspension.timestampValue) : NaN;
    if (!Number.isFinite(until)) throw new Error("account_status_unavailable");
    if (until > Date.now()) throw new Error("account_suspended");
  }
  return true;
}

async function sha1Hex(value) {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function cloudinarySignature(params, apiSecret) {
  const canonical = Object.keys(params).sort().map((key) => key + "=" + params[key]).join("&");
  return sha1Hex(canonical + apiSecret);
}

function isJpeg(bytes) {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

async function reserveUploadSlot(binding, uid) {
  if (!binding || typeof binding.idFromName !== "function" || typeof binding.get !== "function") {
    throw new Error("upload_limiter_unavailable");
  }
  const stub = binding.get(binding.idFromName(uid));
  const response = await stub.fetch("https://upload-limiter/reserve", { method: "POST" });
  const result = await response.json().catch(() => ({}));
  if (response.status === 429) {
    return {
      allowed: false,
      retryAfterSeconds: Number.isFinite(result.retryAfterSeconds) ? Math.max(1, result.retryAfterSeconds) : 60
    };
  }
  if (!response.ok || result.allowed !== true) throw new Error("upload_limiter_unavailable");
  return { allowed: true };
}

async function handleUpload(request, env, origin, fetcher = fetch) {
  const allowedOrigin = env.ALLOWED_ORIGIN;
  if (!allowedOrigin || origin !== allowedOrigin) return json({ error: "origin_not_allowed" }, 403, origin, allowedOrigin);
  if (!env.FIREBASE_PROJECT_ID || !env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
    return json({ error: "upload_service_not_configured" }, 503, origin, allowedOrigin);
  }
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return json({ error: "authentication_required" }, 401, origin, allowedOrigin);
  let uid;
  try { uid = await verifyFirebaseToken(match[1], env.FIREBASE_PROJECT_ID, fetcher); }
  catch { return json({ error: "authentication_failed" }, 401, origin, allowedOrigin); }

  try {
    await verifyAccountEligibility(uid, match[1], env.FIREBASE_PROJECT_ID, fetcher);
  } catch (error) {
    if (error && (error.message === "account_not_eligible" || error.message === "account_suspended")) {
      return json({ error: "account_not_eligible" }, 403, origin, allowedOrigin);
    }
    return json({ error: "account_status_unavailable" }, 503, origin, allowedOrigin);
  }

  const length = Number(request.headers.get("content-length") || 0);
  if (length > 1_100_000) return json({ error: "image_too_large" }, 413, origin, allowedOrigin);
  // Enforce a hard streaming cap even if Content-Length is absent or untrusted.
  if (!request.body) return json({ error: "invalid_multipart_body" }, 400, origin, allowedOrigin);
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 1_100_000) {
        await reader.cancel();
        return json({ error: "image_too_large" }, 413, origin, allowedOrigin);
      }
      chunks.push(value);
    }
  } catch {
    return json({ error: "invalid_multipart_body" }, 400, origin, allowedOrigin);
  }
  const boundedHeaders = new Headers(request.headers);
  boundedHeaders.delete("content-length");
  const boundedRequest = new Request(request.url, {
    method: "POST",
    headers: boundedHeaders,
    body: new Blob(chunks, { type: request.headers.get("content-type") || "application/octet-stream" })
  });
  let form;
  try { form = await boundedRequest.formData(); }
  catch { return json({ error: "invalid_multipart_body" }, 400, origin, allowedOrigin); }
  const file = form.get("file");
  if (!(file instanceof File) || file.type !== "image/jpeg" || file.size < 4 || file.size > 1_048_576) {
    return json({ error: "jpeg_required_max_1mb" }, 415, origin, allowedOrigin);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isJpeg(bytes)) return json({ error: "invalid_image_content" }, 415, origin, allowedOrigin);

  let reservation;
  try { reservation = await reserveUploadSlot(env.UPLOAD_LIMITER, uid); }
  catch { return json({ error: "upload_limiter_unavailable" }, 503, origin, allowedOrigin); }
  if (!reservation.allowed) {
    return json({ error: "upload_rate_limited", retryAfterSeconds: reservation.retryAfterSeconds }, 429, origin, allowedOrigin);
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = "user_" + uid.slice(0, 24) + "_" + crypto.randomUUID().replace(/-/g, "");
  const params = {
    allowed_formats: "jpg",
    folder: "MeetBook/images",
    overwrite: "false",
    public_id: publicId,
    timestamp: String(timestamp)
  };
  const signature = await cloudinarySignature(params, env.CLOUDINARY_API_SECRET);
  const upload = new FormData();
  upload.append("file", new Blob([bytes], { type: "image/jpeg" }), "meetbook-photo.jpg");
  upload.append("api_key", env.CLOUDINARY_API_KEY);
  for (const [key, value] of Object.entries(params)) upload.append(key, value);
  upload.append("signature", signature);

  let cloudResponse;
  try {
    cloudResponse = await fetcher(CLOUDINARY_UPLOAD_BASE + encodeURIComponent(env.CLOUDINARY_CLOUD_NAME) + "/image/upload", {
      method: "POST", body: upload
    });
  } catch {
    return json({ error: "image_provider_unavailable" }, 502, origin, allowedOrigin);
  }
  const result = await cloudResponse.json().catch(() => ({}));
  if (!cloudResponse.ok || typeof result.secure_url !== "string") {
    return json({ error: "image_upload_failed" }, 502, origin, allowedOrigin);
  }
  let url;
  try { url = new URL(result.secure_url); } catch { return json({ error: "invalid_provider_response" }, 502, origin, allowedOrigin); }
  if (url.protocol !== "https:" || url.hostname !== "res.cloudinary.com" ||
      url.pathname.split("/")[1] !== env.CLOUDINARY_CLOUD_NAME) {
    return json({ error: "invalid_provider_response" }, 502, origin, allowedOrigin);
  }
  return json({ secure_url: url.href }, 201, origin, allowedOrigin);
}

export class UploadLimiter {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "method_not_allowed" }), {
        status: 405, headers: { "content-type": "application/json", "cache-control": "no-store" }
      });
    }

    try {
      const result = await this.state.storage.transaction(async () => {
        const now = Date.now();
        const saved = await this.state.storage.get(UPLOAD_TIMESTAMPS_KEY);
        const timestamps = (Array.isArray(saved) ? saved : [])
          .filter((value) => Number.isFinite(value) && value > now - UPLOAD_WINDOW_MS)
          .sort((a, b) => a - b);

        if (timestamps.length >= MAX_UPLOADS_PER_WINDOW) {
          const retryAfterSeconds = Math.max(1, Math.ceil((timestamps[0] + UPLOAD_WINDOW_MS - now) / 1000));
          await this.state.storage.put(UPLOAD_TIMESTAMPS_KEY, timestamps);
          return { allowed: false, retryAfterSeconds };
        }

        const lastUpload = timestamps[timestamps.length - 1];
        if (Number.isFinite(lastUpload) && now - lastUpload < UPLOAD_COOLDOWN_MS) {
          const retryAfterSeconds = Math.max(1, Math.ceil((lastUpload + UPLOAD_COOLDOWN_MS - now) / 1000));
          await this.state.storage.put(UPLOAD_TIMESTAMPS_KEY, timestamps);
          return { allowed: false, retryAfterSeconds };
        }

        timestamps.push(now);
        await this.state.storage.put(UPLOAD_TIMESTAMPS_KEY, timestamps);
        return { allowed: true };
      });

      return new Response(JSON.stringify(result), {
        status: result.allowed ? 200 : 429,
        headers: { "content-type": "application/json", "cache-control": "no-store" }
      });
    } catch {
      // The upload path fails closed if durable quota storage is unavailable.
      return new Response(JSON.stringify({ error: "upload_limiter_unavailable" }), {
        status: 503, headers: { "content-type": "application/json", "cache-control": "no-store" }
      });
    }
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("origin") || "";
    const allowedOrigin = env.ALLOWED_ORIGIN || "";
    if (request.method === "OPTIONS") {
      if (origin !== allowedOrigin || !allowedOrigin) return json({ error: "origin_not_allowed" }, 403, origin, allowedOrigin);
      return new Response(null, { status: 204, headers: {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "Authorization, Content-Type",
        "access-control-max-age": "600",
        "vary": "Origin"
      } });
    }
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, origin, allowedOrigin);
    return handleUpload(request, env, origin);
  }
};

export { cloudinarySignature, verifyFirebaseToken, verifyAccountEligibility, isJpeg, handleUpload };
