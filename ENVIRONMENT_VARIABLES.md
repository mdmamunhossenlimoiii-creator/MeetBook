# Environment Variables and GitHub Secrets

The frontend is a no-build static application. Firebase web values are currently configured in `js/firebase-config.js`, not injected from a server environment. Those values are public client configuration and must belong to the MeetBook Firebase project.

## GitHub Actions secrets

| Name | Used by | Purpose |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Manual backup workflow | MeetBook-only service-account JSON |
| `MEETBOOK_FIREBASE_PROJECT_ID` | Manual backup workflow | Expected MeetBook Firebase project ID |
| `BACKUP_PASSPHRASE` | Manual backup workflow | Encrypts MeetBook backup artifacts |

## Bot Runner environment — owner setup required

The manual-only workflows use a dedicated MeetBook Firebase Authentication account and are dry-run by default. Create the `meetbook-bot-live` GitHub Environment with required owner reviewers before adding any credentials.

Environment secrets required for a preflight or live run:
- `BOT_RUNNER_EMAIL` — dedicated MeetBook-only Firebase Auth runner account.
- `BOT_RUNNER_PASSWORD` — password for that dedicated account.
- `GEMINI_API_KEY` — server-side Gemini key; required by the workflows for live actions only.

Environment variable required:
- `BOT_RUNNER_EXPECTED_PROJECT_ID` = `meetbook-65d30`.

The separate repository variable `BOT_LIVE_TEST_APPROVED` must remain unset until the owner approves a specific limited live test. A live run also requires `confirm_live=true` and the protected environment approval. Keep the Firestore runner document disabled and the global kill switch off until the release checklist is complete. The owner must create `botRunners/{runnerUid}` with a narrow `botIds: ["bot_01", "bot_02", "bot_03"]` allowlist; `enabled` remains false until the limited test is separately approved. Never use a personal account password, put private credentials in frontend code, repository files, ordinary unprotected variables, test fixtures, or logs, or reuse MySocial credentials. Do not paste secrets into chat.

Do not add service-account JSON to source files, frontend configuration, repository variables, workflow logs, or commits. Store private credentials only in repository Actions Secrets when separately approved and required by a reviewed workflow.

The backup script refuses to run if the expected MeetBook project ID is missing or does not match the service account project. It also rejects the known legacy MySocial project ID.
