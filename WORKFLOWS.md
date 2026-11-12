# GitHub Actions Workflow Policy

| Workflow | Policy | Notes |
|---|---|---|
| `tests.yml` | Enabled | Pull requests and pushes to `main`; no Firebase production credentials |
| `bot-runner.yml` | Disabled | Manual dispatch only; defensive job condition is false |
| `bot-chat.yml` | Disabled | No event triggers; defensive job condition is false |
| `backup.yml` | Manual-only | Requires explicit `confirm_backup=true` and MeetBook-only secrets |
| `maintenance.yml` (account deletion queue) | Disabled | Destructive Auth and Firestore deletion is blocked pending separate owner review |

The emulator test uses the `demo-meetbook` project ID. It must remain isolated from production.

Do not add Bot Runner or Bot Chat secrets. Do not re-enable bot workflows as part of this project. Review any additional workflow file before enabling it. The file `maintenance.yml` was found to be an account-deletion queue, not a routine maintenance task. It is manual-dispatch-only and its job is unconditionally skipped. It can permanently delete Authentication users and Firestore data; do not remove the disabled condition until a separate owner-approved deletion policy and MeetBook project guard are reviewed.

The backup workflow must not run on a schedule. Production backup execution requires a deliberate manual dispatch with the confirmation input.
