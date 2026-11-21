# MeetBook Firebase Setup (Owner-operated)

All Firebase Console work belongs to the repository owner. The Coding Agent must not log in to Firebase, create projects, change live settings, or deploy rules.

## 1. Confirm the dedicated MeetBook project

1. Open Firebase Console and verify that the existing project `meetbook-65d30` is dedicated to MeetBook and is not shared with MySocial.
2. Do not select, import, or reuse the MySocial project.
3. If `meetbook-65d30` is not the approved MeetBook project, the owner must create a separate dedicated project and update the MeetBook Web App configuration plus all project-ID variables consistently before live use. Do not create a second project unless this check fails.
4. Register a Web App in the approved MeetBook project if one is not already registered.
5. Enable Email/Password and optionally Google sign-in.
6. Create a Cloud Firestore database in Production mode if it does not already exist.
7. Configure any optional services only inside this MeetBook project.

## 2. Configure the frontend

Verify `js/firebase-config.js` matches the approved MeetBook Web App. The current branch already contains public client configuration for `meetbook-65d30`; replace it only if the owner approves a different dedicated MeetBook project.

Required values: `apiKey`, `authDomain`, `projectId`, `storageBucket` (if used), `messagingSenderId`, and `appId`.

The `projectId` must match the approved dedicated MeetBook project (currently `meetbook-65d30`, if confirmed). Do not use `mysocial-33681`. The web config is public client configuration; never put a service-account private key in this file.

## 3. Firestore rules and indexes

The repository contains `firestore.rules` and `firestore.indexes.json`. Review them before applying them. Confirm the Firebase Console project selector shows the approved dedicated MeetBook project before publishing. The owner performs this operation.

The local emulator configuration in `firebase.json` is for development/testing and uses the `demo-meetbook` project ID in the test workflow.

## 4. Initialize the first Super Admin

1. Register a normal MeetBook account through the MeetBook app after Firebase is configured.
2. In MeetBook Firebase Authentication, copy that account's UID.
3. In MeetBook Firestore, create `admins/{that-uid}`.
4. Set `role: "super_admin"` and the required audit fields expected by the current rules/application.
5. Never create this record in MySocial or reuse a MySocial UID as an administrator identity.

The existing rules allow only an already-authorized Super Admin to manage staff. The first Super Admin bootstrap is therefore a deliberate owner-operated Console step. Do not grant this role to an arbitrary account.

## 5. Authorized domains

After GitHub Pages is enabled for this repository, add the actual MeetBook Pages hostname to Firebase Authentication's authorized domains. Do not add the MySocial hostname as a substitute.

## 6. GitHub Actions secrets

Only configure these after the MeetBook project is created and the backup workflow has been reviewed:

- `FIREBASE_SERVICE_ACCOUNT`: MeetBook-only service-account JSON.
- `MEETBOOK_FIREBASE_PROJECT_ID`: approved dedicated MeetBook project ID (currently `meetbook-65d30`, if confirmed). If the owner selects another project, update this variable and the frontend config consistently.
- `BACKUP_PASSPHRASE`: unique high-entropy passphrase for MeetBook backup encryption.

Use a least-privilege service account. Never commit its JSON key or paste it into public issues, chat, source files, or logs.

## 7. Verification checklist

- [ ] Firebase Console project ID is the approved dedicated MeetBook ID (currently configured as `meetbook-65d30`, if confirmed).
- [ ] `js/firebase-config.js` contains that project's web app values.
- [ ] The project ID is not `mysocial-33681`.
- [ ] Authentication providers are enabled in the MeetBook project.
- [ ] Firestore exists in the MeetBook project.
- [ ] Rules and indexes have been reviewed and owner-published.
- [ ] MeetBook Pages hostname is authorized.
- [ ] Super Admin UID belongs to a MeetBook Authentication user.
- [ ] GitHub Secrets contain only MeetBook-specific credentials.

No production Firebase operation is performed by this repository setup guide.

## 8. Image uploads (Cloudinary through a signed Worker)

MeetBook image uploads use Cloudinary through a separate authenticated Cloudflare Worker. Firebase Storage is not required. Video file uploads remain disabled; video links are a separate feature.

1. Review the Worker source in cloudflare/image-upload/ and the security notes in its README before deployment.
2. Confirm the actual GitHub Pages hostname. The expected origin for this repository site is https://mdmamunhossenlimoiii-creator.github.io (the origin does not include the /MeetBook/ path); change it only if the real Pages domain is different.
3. Configure the Worker for the MeetBook Firebase project, Cloudinary cloud name, and exact Pages origin.
4. Add CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET as Cloudflare Worker secrets only. Never commit either credential or put it in frontend config/chat.
5. The checked-in Wrangler configuration includes the SQLite-backed UploadLimiter Durable Object binding and first migration. Keep both in future deploys and confirm Durable Objects are enabled for the selected Cloudflare account/plan.
6. Before enabling uploads, verify existing users/{uid} documents have banned explicitly set to Boolean false and suspendedUntil is absent, null, or expired. The Worker reads only the signed-in user's own document through Firestore Rules. Missing/malformed account status or a failed lookup intentionally blocks uploads; do not loosen Rules to bypass this.
7. Deploy the Worker and Durable Object migration using cloudflare/image-upload/README.md. Configure Cloudflare outer abuse/rate controls in addition to the per-user 20-per-24-hour quota and 5-second cooldown.
8. After deployment and a successful security review, add the deployed Worker URL to imageUploadEndpoint in js/firebase-config.js. It is public endpoint configuration, not a secret.
9. Test post photos, profile photos, cover photos, stories, and message photos in isolated staging. Verify banned/suspended test accounts are denied and an eligible test account can upload.

The Cloudinary upload preset is not used by this signed server-side flow. Keep the preset in Signed mode; do not switch it to Unsigned. The Worker and Durable Object are not deployed by repository CI, and imageUploadEndpoint remains blank until the owner completes the setup.
