import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import worker, {
  cloudinarySignature,
  isJpeg,
  verifyFirebaseToken,
  verifyAccountEligibility,
  UploadLimiter,
  handleUpload
} from "../cloudflare/image-upload/worker.js";

const b64url = (value) => Buffer.from(value).toString("base64url");

async function makeIdentity(uid = "test-user", projectId = "demo-meetbook") {
  const pair = await crypto.subtle.generateKey({
    name: "RSASSA-PKCS1-v1_5", modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256"
  }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  jwk.kid = "test-kid";
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", kid: "test-kid" }));
  const payload = b64url(JSON.stringify({
    aud: projectId, iss: "https://securetoken.google.com/" + projectId,
    sub: uid, iat: now, exp: now + 3600, auth_time: now
  }));
  const message = header + "." + payload;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(message)
  );
  return { uid, projectId, jwk, token: message + "." + b64url(signature) };
}

function makeFetcher(identity, profile, cloudinaryResult = null) {
  const calls = [];
  const fetcher = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("securetoken@system.gserviceaccount.com")) {
      return new Response(JSON.stringify({ keys: [identity.jwk] }), {
        status: 200, headers: { "content-type": "application/json" }
      });
    }
    if (String(url).startsWith("https://firestore.googleapis.com/")) {
      return new Response(JSON.stringify({ fields: profile }), {
        status: 200, headers: { "content-type": "application/json" }
      });
    }
    if (String(url).startsWith("https://api.cloudinary.com/")) {
      return new Response(JSON.stringify(cloudinaryResult || {
        secure_url: "https://res.cloudinary.com/demo/image/upload/MeetBook/images/test.jpg"
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error("unexpected_fetch_target");
  };
  return { fetcher, calls };
}

function activeProfile(extra = {}) {
  return { banned: { booleanValue: false }, ...extra };
}

function makeUploadRequest(identity) {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0x00])], {
    type: "image/jpeg"
  }), "test.jpg");
  return new Request("https://worker.example/upload", {
    method: "POST",
    headers: {
      origin: "https://meetbook.example",
      authorization: "Bearer " + identity.token
    },
    body: form
  });
}

const uploadEnv = {
  ALLOWED_ORIGIN: "https://meetbook.example",
  FIREBASE_PROJECT_ID: "demo-meetbook",
  CLOUDINARY_CLOUD_NAME: "demo",
  CLOUDINARY_API_KEY: "test-key",
  CLOUDINARY_API_SECRET: "test-secret"
};

test("Cloudinary signature is stable and parameter-order independent", async () => {
  const a = await cloudinarySignature({ timestamp: "123", folder: "MeetBook/images" }, "secret");
  const b = await cloudinarySignature({ folder: "MeetBook/images", timestamp: "123" }, "secret");
  assert.equal(a, b);
  assert.match(a, /^[a-f0-9]{40}$/);
});

test("JPEG content is checked by its file signature", () => {
  assert.equal(isJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0x00])), true);
  assert.equal(isJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), false);
});

test("Firebase ID token signature and project claims are verified", async () => {
  const identity = await makeIdentity();
  const fetcher = async () => new Response(JSON.stringify({ keys: [identity.jwk] }), {
    status: 200, headers: { "content-type": "application/json" }
  });
  assert.equal(await verifyFirebaseToken(identity.token, identity.projectId, fetcher), identity.uid);
  await assert.rejects(() => verifyFirebaseToken(identity.token, "another-project", fetcher));
});

test("account eligibility requires banned=false and accepts an absent suspension", async () => {
  const identity = await makeIdentity();
  let seen;
  const fetcher = async (url, options) => {
    seen = { url: String(url), options };
    return new Response(JSON.stringify({ fields: activeProfile() }), { status: 200 });
  };
  assert.equal(await verifyAccountEligibility(identity.uid, identity.token, identity.projectId, fetcher), true);
  assert.match(seen.url, /documents\/users\/test-user$/);
  assert.equal(seen.options.headers.authorization, "Bearer " + identity.token);
});

test("account eligibility accepts an expired suspension", async () => {
  const identity = await makeIdentity();
  const fetcher = async () => new Response(JSON.stringify({
    fields: activeProfile({ suspendedUntil: { timestampValue: new Date(Date.now() - 60_000).toISOString() } })
  }), { status: 200 });
  assert.equal(await verifyAccountEligibility(identity.uid, identity.token, identity.projectId, fetcher), true);
});

test("account eligibility rejects banned and malformed legacy account state", async () => {
  const identity = await makeIdentity();
  const bannedFetcher = async () => new Response(JSON.stringify({
    fields: { banned: { booleanValue: true } }
  }), { status: 200 });
  await assert.rejects(
    () => verifyAccountEligibility(identity.uid, identity.token, identity.projectId, bannedFetcher),
    /account_not_eligible/
  );
  const missingFlagFetcher = async () => new Response(JSON.stringify({ fields: {} }), { status: 200 });
  await assert.rejects(
    () => verifyAccountEligibility(identity.uid, identity.token, identity.projectId, missingFlagFetcher),
    /account_not_eligible/
  );
});

test("account eligibility rejects a currently suspended account and fails closed on lookup errors", async () => {
  const identity = await makeIdentity();
  const suspendedFetcher = async () => new Response(JSON.stringify({
    fields: activeProfile({ suspendedUntil: { timestampValue: new Date(Date.now() + 60_000).toISOString() } })
  }), { status: 200 });
  await assert.rejects(
    () => verifyAccountEligibility(identity.uid, identity.token, identity.projectId, suspendedFetcher),
    /account_suspended/
  );
  const unavailableFetcher = async () => new Response("unavailable", { status: 503 });
  await assert.rejects(
    () => verifyAccountEligibility(identity.uid, identity.token, identity.projectId, unavailableFetcher),
    /account_status_unavailable/
  );
});

test("worker rejects a banned account before reading the upload body", async () => {
  const identity = await makeIdentity();
  const { fetcher, calls } = makeFetcher(identity, { banned: { booleanValue: true } });
  const request = new Request("https://worker.example/upload", {
    method: "POST",
    headers: { origin: uploadEnv.ALLOWED_ORIGIN, authorization: "Bearer " + identity.token }
  });
  const response = await handleUpload(request, uploadEnv, uploadEnv.ALLOWED_ORIGIN, fetcher);
  assert.equal(response.status, 403);
  assert.equal(calls.length, 2);
  assert.equal(calls.some((call) => call.url.startsWith("https://api.cloudinary.com/")), false);
});

test("worker fails closed when the Durable Object upload limiter is not configured", async () => {
  const identity = await makeIdentity();
  const { fetcher, calls } = makeFetcher(identity, activeProfile());
  const response = await handleUpload(makeUploadRequest(identity), uploadEnv, uploadEnv.ALLOWED_ORIGIN, fetcher);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "upload_limiter_unavailable");
  assert.equal(calls.some((call) => call.url.startsWith("https://api.cloudinary.com/")), false);
});

test("worker returns 429 when the per-user upload limiter denies a request", async () => {
  const identity = await makeIdentity();
  const { fetcher, calls } = makeFetcher(identity, activeProfile());
  const env = {
    ...uploadEnv,
    UPLOAD_LIMITER: {
      idFromName: (name) => name,
      get: () => ({
        fetch: async () => new Response(JSON.stringify({ allowed: false, retryAfterSeconds: 7 }), { status: 429 })
      })
    }
  };
  const response = await handleUpload(makeUploadRequest(identity), env, uploadEnv.ALLOWED_ORIGIN, fetcher);
  assert.equal(response.status, 429);
  assert.equal((await response.json()).retryAfterSeconds, 7);
  assert.equal(calls.some((call) => call.url.startsWith("https://api.cloudinary.com/")), false);
});

test("worker uploads only after account and Durable Object quota checks pass", async () => {
  const identity = await makeIdentity();
  const { fetcher, calls } = makeFetcher(identity, activeProfile());
  let limiterUid;
  const env = {
    ...uploadEnv,
    UPLOAD_LIMITER: {
      idFromName: (name) => { limiterUid = name; return name; },
      get: () => ({
        fetch: async () => new Response(JSON.stringify({ allowed: true }), { status: 200 })
      })
    }
  };
  const response = await handleUpload(makeUploadRequest(identity), env, uploadEnv.ALLOWED_ORIGIN, fetcher);
  assert.equal(response.status, 201);
  assert.equal(limiterUid, identity.uid);
  assert.equal((await response.json()).secure_url, "https://res.cloudinary.com/demo/image/upload/MeetBook/images/test.jpg");
  assert.equal(calls.filter((call) => call.url.startsWith("https://api.cloudinary.com/")).length, 1);
});

function makeDurableObjectState(initialTimestamps = []) {
  const values = new Map([["upload-timestamps", initialTimestamps]]);
  const storage = {
    async get(key) { return values.get(key); },
    async put(key, value) { values.set(key, structuredClone(value)); },
    async transaction(callback) { return callback(); }
  };
  return { storage, values };
}

test("Durable Object limiter allows one upload then enforces cooldown", async () => {
  const state = makeDurableObjectState();
  const limiter = new UploadLimiter(state);
  const request = () => new Request("https://limiter/reserve", { method: "POST" });
  const first = await limiter.fetch(request());
  const second = await limiter.fetch(request());
  assert.equal(first.status, 200);
  assert.equal((await first.json()).allowed, true);
  assert.equal(second.status, 429);
  assert.equal((await second.json()).allowed, false);
});

test("Durable Object limiter enforces the rolling 24-hour per-user cap", async () => {
  const now = Date.now();
  const timestamps = Array.from({ length: 20 }, (_, index) => now - 100_000 + index * 1_000);
  const state = makeDurableObjectState(timestamps);
  const limiter = new UploadLimiter(state);
  const response = await limiter.fetch(new Request("https://limiter/reserve", { method: "POST" }));
  assert.equal(response.status, 429);
  assert.ok((await response.json()).retryAfterSeconds > 0);
});

test("Durable Object limiter prunes timestamps older than 24 hours", async () => {
  const state = makeDurableObjectState([Date.now() - 25 * 60 * 60 * 1000]);
  const limiter = new UploadLimiter(state);
  const response = await limiter.fetch(new Request("https://limiter/reserve", { method: "POST" }));
  assert.equal(response.status, 200);
  assert.equal(state.values.get("upload-timestamps").length, 1);
});

test("Durable Object limiter rejects non-POST internal requests", async () => {
  const limiter = new UploadLimiter(makeDurableObjectState());
  const response = await limiter.fetch(new Request("https://limiter/reserve", { method: "GET" }));
  assert.equal(response.status, 405);
});

test("worker rejects requests from an unapproved origin", async () => {
  const response = await worker.fetch(new Request("https://worker.example/upload", {
    method: "POST", headers: { origin: "https://attacker.example" }
  }), { ALLOWED_ORIGIN: "https://meetbook.example" });
  assert.equal(response.status, 403);
});

test("worker rejects unsupported methods", async () => {
  const response = await worker.fetch(new Request("https://worker.example/upload", {
    method: "GET", headers: { origin: "https://meetbook.example" }
  }), { ALLOWED_ORIGIN: "https://meetbook.example" });
  assert.equal(response.status, 405);
});

test("worker requires a Firebase bearer token", async () => {
  const response = await worker.fetch(new Request("https://worker.example/upload", {
    method: "POST", headers: { origin: "https://meetbook.example" }
  }), { ALLOWED_ORIGIN: "https://meetbook.example", FIREBASE_PROJECT_ID: "demo",
    CLOUDINARY_CLOUD_NAME: "demo", CLOUDINARY_API_KEY: "key", CLOUDINARY_API_SECRET: "secret" });
  assert.equal(response.status, 401);
});

test("browser code never uploads directly to Cloudinary or exposes a video file uploader", async () => {
  const utils = await readFile(new URL("../js/utils.js", import.meta.url), "utf8");
  const reels = await readFile(new URL("../js/reels.js", import.meta.url), "utf8");
  assert.match(utils, /auth\.currentUser\.getIdToken\(\)/);
  assert.doesNotMatch(utils, /api\.cloudinary\.com/);
  assert.doesNotMatch(utils, /uploadVideoToCloudinary/);
  assert.doesNotMatch(reels, /uploadVideoToCloudinary|type=["']file["']/i);
});
