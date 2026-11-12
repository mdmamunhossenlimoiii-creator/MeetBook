# MeetBook Firebase Setup (Owner-operated)

All Firebase Console work belongs to the repository owner. The Coding Agent must not log in to Firebase, create projects, change live settings, or deploy rules.

## 1. Create a new project

1. Open Firebase Console and create a completely new project for MeetBook.
2. Do not select, import, or reuse the MySocial project.
3. Register a new Web App in the MeetBook project.
4. Enable Email/Password and optionally Google sign-in.
5. Create a Cloud Firestore database in Production mode.
6. Configure any optional services only inside this MeetBook project.

## 2. Configure the frontend

Open `js/firebase-config.js` and replace the empty strings in `firebaseConfig` with the values from the new MeetBook Web App.

Required values: `apiKey`, `authDomain`, `projectId`, `storageBucket` (if used), `messagingSenderId`, and `appId`.

The `projectId` must be the new MeetBook project ID. Do not use `mysocial-33681`. The web config is public client configuration; never put a service-account private key in this file.

## 3. Firestore rules and indexes

The repository contains `firestore.rules` and `firestore.indexes.json`. Review them before applying them. Confirm the Firebase Console project selector shows the new MeetBook project before publishing. The owner performs this operation.

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
- `MEETBOOK_FIREBASE_PROJECT_ID`: exact project ID of the new MeetBook Firebase project.
- `BACKUP_PASSPHRASE`: unique high-entropy passphrase for MeetBook backup encryption.

Use a least-privilege service account. Never commit its JSON key or paste it into public issues, chat, source files, or logs.

## 7. Verification checklist

- [ ] Firebase Console project ID is the new MeetBook ID.
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

1. The repository includes the Worker in `cloudflare/image-upload/`. Review its source before deploying.
2. Deploy the Worker using the instructions in `cloudflare/image-upload/README.md`.
3. Configure the Worker variables for the MeetBook Firebase project, Cloudinary cloud name, and the exact GitHub Pages origin.
4. Add the Cloudinary API key as a Worker variable and the Cloudinary API secret as a Worker secret. Never put the API secret in this repository, frontend config, or chat.
5. After deployment, add the Worker URL to `imageUploadEndpoint` in `js/firebase-config.js`.
6. The Worker verifies Firebase ID tokens, accepts JPEG images only up to 1 MB, checks the file signature, and creates a signed Cloudinary upload in the fixed `MeetBook/images` folder.
7. Test post photos, profile photos, cover photos, stories, and message photos before launch.

The Cloudinary upload preset is not used by this signed server-side flow. Keep the preset in Signed mode; do not switch it to Unsigned. The Worker must be deployed and configured before image uploads can work.
