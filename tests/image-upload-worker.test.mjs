import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import worker, { cloudinarySignature, isJpeg, verifyFirebaseToken } from "../cloudflare/image-upload/worker.js";

const b64url = (value) => Buffer.from(value).toString("base64url");

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
  const pair = await crypto.subtle.generateKey({
    name: "RSASSA-PKCS1-v1_5", modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256"
  }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  jwk.kid = "test-kid";
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", kid: "test-kid" }));
  const payload = b64url(JSON.stringify({
    aud: "demo-meetbook", iss: "https://securetoken.google.com/demo-meetbook",
    sub: "test-user", iat: now, exp: now + 3600, auth_time: now
  }));
  const message = `${header}.${payload}`;
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(message));
  const token = `${message}.${b64url(sig)}`;
  const fetcher = async () => new Response(JSON.stringify({ keys: [jwk] }), {
    status: 200, headers: { "content-type": "application/json" }
  });
  assert.equal(await verifyFirebaseToken(token, "demo-meetbook", fetcher), "test-user");
  await assert.rejects(() => verifyFirebaseToken(token, "another-project", fetcher));
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
