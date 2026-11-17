# MeetBook image upload Worker

This Worker receives authenticated image uploads from MeetBook and signs the Cloudinary request on the server. It does not use Firebase Storage and does not accept video uploads.

## Required configuration

The checked-in \`wrangler.toml\` sets the MeetBook Firebase project ID, Cloudinary cloud name, and GitHub Pages origin. Confirm all three values before deploying.

Add these two values as Worker secrets (never commit them):

- \`CLOUDINARY_API_KEY\`
- \`CLOUDINARY_API_SECRET\`

The API secret must remain in Cloudflare Worker Secret settings. Do not paste it into MeetBook source code, GitHub files, or chat.

## Deploy

From the repository root, with Wrangler installed and authenticated to the intended Cloudflare account:

\`\`\`sh
npx wrangler secret put CLOUDINARY_API_KEY --config cloudflare/image-upload/wrangler.toml
npx wrangler secret put CLOUDINARY_API_SECRET --config cloudflare/image-upload/wrangler.toml
npx wrangler deploy --config cloudflare/image-upload/wrangler.toml
\`\`\`

The first deployment also creates the SQLite-backed \`UploadLimiter\` Durable Object namespace from the checked-in migration. Keep that binding and migration in every future deployment. Cloudflare Durable Objects must be enabled for the selected account/plan.

Copy the deployed Worker URL into \`imageUploadEndpoint\` in \`js/firebase-config.js\`, then commit that public URL on the MeetBook branch. The URL is not a secret.

## Security behavior

- Only POST and CORS preflight are supported.
- Browser origin must exactly match the configured MeetBook Pages origin.
- Every upload requires a Firebase ID token for the configured MeetBook Firebase project; the JWT signature and standard project/issuer/time claims are verified against Google's public signing keys.
- Before reading the upload body, the Worker reads only the caller's own \`users/{uid}\` document through Firestore REST using that same ID token. Firestore Rules therefore remain in force. Uploads are denied unless \`banned\` is explicitly Boolean \`false\`; a future \`suspendedUntil\` timestamp is also denied. Missing/malformed account state or a failed Firestore lookup fails closed.
- The per-user SQLite-backed Durable Object limiter permits at most 20 valid image uploads in a rolling 24-hour window and applies a 5-second per-user cooldown. It is keyed by Firebase UID, shared across Worker instances, and reserves quota atomically. Missing or unavailable limiter storage fails closed; a denied request returns HTTP 429.
- Request body is capped while streaming; the uploaded file must be JPEG, match the JPEG file signature, and be at most 1 MiB.
- Cloudinary signatures are generated server-side. The folder is fixed to \`MeetBook/images\`; overwrite is disabled.
- Only an HTTPS URL on \`res.cloudinary.com\` for the configured Cloudinary cloud is returned.

CORS is not authentication. Firebase token verification, account eligibility, and the Durable Object limiter are independent checks. Configure suitable Cloudflare abuse/rate controls as an additional outer layer and review current plan limits. This repository change does not deploy the Worker, create its Cloudflare namespace, configure Cloudinary secrets, or change the frontend endpoint.
