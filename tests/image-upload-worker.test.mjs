import test from "node:test";
import assert from "node:assert/strict";
import worker, { cloudinarySignature, isJpeg } from "../cloudflare/image-upload/worker.js";

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
