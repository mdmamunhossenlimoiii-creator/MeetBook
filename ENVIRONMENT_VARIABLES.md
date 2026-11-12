# Environment Variables and GitHub Secrets

The frontend is a no-build static application. Firebase web values are currently configured in `js/firebase-config.js`, not injected from a server environment. Those values are public client configuration and must belong to the MeetBook Firebase project.

## GitHub Actions secrets

| Name | Used by | Purpose |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Manual backup workflow | MeetBook-only service-account JSON |
| `MEETBOOK_FIREBASE_PROJECT_ID` | Manual backup workflow | Expected MeetBook Firebase project ID |
| `BACKUP_PASSPHRASE` | Manual backup workflow | Encrypts MeetBook backup artifacts |

Do not create or add bot secrets. Bot automation is disabled and out of scope.

Do not add service-account JSON to source files, frontend configuration, repository variables, workflow logs, or commits. Store private credentials only in repository Actions Secrets.

The backup script refuses to run if the expected MeetBook project ID is missing or does not match the service account project. It also rejects the known legacy MySocial project ID.
