# MeetBook Backup and Restore

## Current design

The repository contains an encrypted Firestore JSON backup script. The GitHub Actions workflow uploads the encrypted output as an artifact belonging to the MeetBook repository with a 30-day retention period.

The workflow is manual-only. Each dispatch requires the user to set `confirm_backup` to true. There is no scheduled production backup. The script requires all three MeetBook-specific secrets:

- `FIREBASE_SERVICE_ACCOUNT`
- `MEETBOOK_FIREBASE_PROJECT_ID`
- `BACKUP_PASSPHRASE` (at least 12 characters; use a unique high-entropy value)

The script verifies that the service account's project ID exactly matches `MEETBOOK_FIREBASE_PROJECT_ID` and refuses the known legacy MySocial project ID.

## Included limitations

The current backup script exports the configured Firestore collections and selected subcollections. It does not back up Firebase Authentication accounts/passwords. Large embedded images may be omitted unless explicitly configured. Review the collection list in `scripts/backup.mjs` before relying on it for disaster recovery.

## Restore safety

Restore is a local, manually operated process. It is dry-run by default and requires an explicit project confirmation. It skips privileged/admin and deletion-request collections. Never run a restore against production without reviewing the archive, confirming the MeetBook project ID, and making a separate pre-restore backup.

## Retention and verification

GitHub artifact retention is configured to 30 days. Downloaded artifacts should be stored in a secure, access-controlled location if a longer retention period is required. Verify archive integrity and test restoration in a dedicated non-production MeetBook project before relying on a backup.

No production backup or restore has been run by this repository change.
