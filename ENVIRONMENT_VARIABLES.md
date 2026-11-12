# Environment Variables and GitHub Secrets

The frontend is a no-build static application. Firebase web values are currently configured in `js/firebase-config.js`, not injected from a server environment. Those values are public client configuration and must belong to the MeetBook Firebase project.

## GitHub Actions secrets

| Name | Used by | Purpose |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Manual backup workflow | MeetBook-only service-account JSON |
| `MEETBOOK_FIREBASE_PROJECT_ID` | Manual backup workflow | Expected MeetBook Firebase project ID |
| `BACKUP_PASSPHRASE` | Manual backup workflow | Encrypts MeetBook backup artifacts |

## Bot Runner credentials — not configured

The limited Bot Runner policy in `WORKFLOWS.md` permits implementation and isolated testing only. Bot Runner and Bot Chat remain disabled, and no bot credentials should be created or added at this stage.

If a separate release approval is granted later, the runner must use a dedicated, least-privilege identity restricted to the MeetBook Firebase project. Prefer short-lived credentials or an appropriately scoped workload identity where supported. Never use a personal account password, put private credentials in frontend code, repository files, ordinary repository variables, test fixtures, or logs, or reuse MySocial credentials. The exact credential name, permissions, rotation, and storage must be reviewed before activation. The Firestore document `botRunners/{runnerUid}` must be provisioned by the owner with `enabled: true` and an explicit `botIds: ["bot_01", ...]` allowlist. The global `settings/global.botsEnabled` flag must also be explicitly `true`; missing values fail closed. A runner cannot act as bots outside its allowlist. Do not create this document or any secrets as part of this documentation change.

Do not add service-account JSON to source files, frontend configuration, repository variables, workflow logs, or commits. Store private credentials only in repository Actions Secrets when separately approved and required by a reviewed workflow.

The backup script refuses to run if the expected MeetBook project ID is missing or does not match the service account project. It also rejects the known legacy MySocial project ID.
