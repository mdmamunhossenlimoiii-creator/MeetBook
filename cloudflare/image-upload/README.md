# MeetBook image upload Worker

This Worker receives authenticated image uploads from MeetBook and signs the Cloudinary request on the server. It does not use Firebase Storage and does not accept video uploads.

## Required configuration

The checked-in `wrangler.toml` sets the MeetBook Firebase project ID, Cloudinary cloud name, and GitHub Pages origin. Confirm all three values before deploying.

Add these two values as Worker secrets (never commit them):

- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

The API secret must remain in Cloudflare Worker Secret settings. Do not paste it into MeetBook source code, GitHub files, or chat.

## Deploy

From the repository root, with Wrangler installed and authenticated to the intended Cloudflare account:

```sh
npx wrangler secret put CLOUDINARY_API_KEY --config cloudflare/image-upload/wrangler.toml
npx wrangler secret put CLOUDINARY_API_SECRET --config cloudflare/image-upload/wrangler.toml
npx wrangler deploy --config cloudflare/image-upload/wrangler.toml
```

Copy the deployed Worker URL into `imageUploadEndpoint` in `js/firebase-config.js`, then commit that URL on the MeetBook branch. The URL is public configuration, not a secret.

## Security behavior

- Only POST and CORS preflight are supported.
- Browser origin must exactly match the configured MeetBook Pages origin.
- Every upload requires a Firebase ID token for the configured MeetBook Firebase project.
- Firebase JWT signature and standard project/issuer/time claims are verified against Google's public signing keys.
- Request body is capped while streaming; the uploaded file must be JPEG, match the JPEG file signature, and be at most 1 MiB.
- Cloudinary signature is generated server-side. The folder is fixed to `MeetBook/images`; overwrite is disabled.
- Only an HTTPS URL on `res.cloudinary.com` for the configured Cloudinary cloud is returned.

CORS is not authentication; Firebase token verification is also required. Before production, configure suitable Cloudflare abuse/rate controls and review current free-plan limits. This repository change does not deploy the Worker or configure account-level controls.
