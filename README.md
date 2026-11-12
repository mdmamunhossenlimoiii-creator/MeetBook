# MeetBook

MeetBook is an independent social platform built from the existing application code in this repository. Its Firebase project, authentication, Firestore data, administrator identities, GitHub Actions configuration, backups, and GitHub Pages identity must be separate from MySocial.

**Important:** The repository is being prepared for the owner's own Firebase project. The Firebase web configuration intentionally contains empty placeholders. MeetBook is not production-connected or published merely because this repository contains the application code.

## Platform separation rules

- Work only in this MeetBook repository.
- MySocial is a read-only reference/source project; never modify it.
- Never reuse MySocial Firebase project IDs, credentials, user accounts, administrator identities, backup files, or backup secrets.
- The owner performs all Firebase Console operations. Repository code and documentation are prepared here; the agent must not log in to or deploy Firebase.
- Never publish the site, deploy Firebase rules, run a production backup/restore, or activate bot automation without explicit authorization.
- AI bot implementation is out of scope. Existing bot code is retained but its scheduled workflows are disabled.

## Existing application features

The current codebase includes:

- Email/password and Google sign-in.
- Image uploads through a separate Cloudinary image-only unsigned preset (owner configuration required); Firebase Storage is not used.
- Video file uploads are disabled; users may share supported video links.
- User profiles with photo, cover and bio.
- Feed posts with photo and video links.
- Reactions, comments, sharing, saving and reporting.
- Friend requests and following.
- Private and group chat.
- 24-hour stories and short-video reels.
- Public/private groups and join requests.
- Notifications and privacy preferences.
- Responsive light/dark interface.
- Admin dashboard, user management, staff roles, moderation, reports, announcements, maintenance settings and activity logs.

Feature presence in source code is not proof of production readiness. See [FEATURE_STATUS.md](FEATURE_STATUS.md) and [SECURITY.md](SECURITY.md) for known limitations and verification boundaries.

## Firebase setup — owner performs these steps

1. Create a brand-new Firebase project exclusively for MeetBook. Do not select or reuse the MySocial project.
2. Register a new Web App inside that MeetBook project.
3. Enable the sign-in providers you intend to support (Email/Password and, optionally, Google).
4. Create the MeetBook Firestore database in Production mode.
5. Add the GitHub Pages domain to Authentication's authorized domains after Pages is configured.
6. Copy the new Web App configuration into `js/firebase-config.js`. The file currently contains empty placeholders.
7. Review and publish `firestore.rules` and `firestore.indexes.json) yourself from the Firebase Console or Firebase CLI after confirming the target project ID.
8. Configure the Super Admin using the instructions in [FIREBASE_SETUP.md](FIREBASE_SETUP.md).
9. Configure GitHub Actions secrets only after checking that each credential belongs to the new MeetBook project.

Full instructions: [FIREBASE_SETUP.md](FIREBASE_SETUP.md).

**Never place a Firebase service-account private key in frontend files.** The web config is public client configuration; service-account JSON belongs only in GitHub Actions Secrets when needed.

## Independent GitHub Pages address

The repository-specific project-site address is expected to be:

https://mdmamunhossenlimoiii-creator.github.io/MeetBook/

This is the configured canonical address, not proof that GitHub Pages is enabled or deployed. The owner must enable GitHub Pages in the MeetBook repository's Settings and verify the deployed site before announcing it.

Deployment notes: [DEPLOYMENT.md](DEPLOYMENT.md).

## GitHub Actions

| Workflow | Current policy |
|---|---|
| Tests | Retained; runs on pull requests and pushes to `main`; no secrets required |
| AI bot activity | Archived outside `.github/workflows/` as `.disabled`; GitHub Actions cannot execute it |
| AI bot chat replies | Archived outside `.github/workflows/` as `.disabled`; GitHub Actions cannot execute it |
| MeetBook encrypted backup | Manual dispatch only; requires explicit confirmation and MeetBook-only secrets |
| Account deletion queue (`maintenance.yml`) | Archived outside `.github/workflows/`; destructive deletion requires separate owner review |

The backup workflow uses an encrypted artifact associated with this repository and a 30-day artifact retention setting. It is not scheduled. A user must explicitly select the confirmation input to authorize each run. The backup script also checks that the service-account project ID matches `MEETBOOK_FIREBASE_PROJECT_ID` and rejects the known MySocial project ID.

See [WORKFLOWS.md](WORKFLOWS.md) and [BACKUP_AND_RESTORE.md](BACKUP_AND_RESTORE.md).

## Local development

The app uses browser ES modules and does not require a build step. Run a local static server from the repository root:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. Firebase features remain unavailable until the owner supplies the new MeetBook Web App configuration. Use a dedicated non-production Firebase project or the configured local emulator for tests.

## Tests

```bash
npm test
npm run test:browser
npm run test:emulator
```

- `npm test`: local unit, permission-matrix, mutation, script and import checks.
- `npm run test:browser`: requires Playwright and Chromium.
- `npm run test:emulator`: requires Java and network access to install/run the Firebase Emulator.

The emulator uses the reserved `demo-meetbook` project ID and must not connect to a production Firebase project. Tests must be run before claiming that the current branch is verified.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Firebase setup](FIREBASE_SETUP.md)
- [Environment variables and GitHub Secrets](ENVIRONMENT_VARIABLES.md)
- [Security](SECURITY.md)
- [Backup and restore](BACKUP_AND_RESTORE.md)
- [GitHub Pages deployment](DEPLOYMENT.md)
- [GitHub Actions workflows](WORKFLOWS.md)
- [Feature status](FEATURE_STATUS.md)
