# GitHub Actions Workflow Policy

| Workflow | Policy | Notes |
|---|---|---|
| `tests.yml` | Enabled | Pull requests and pushes to `main`; no Firebase production credentials |
| `bot-runner.yml` | Disabled | No event triggers; defensive job condition is false |
| `bot-chat.yml` | Disabled | No event triggers; defensive job condition is false |
| `backup.yml` | Manual-only | Requires explicit `confirm_backup=true` and MeetBook-only secrets |

The emulator test uses the `demo-meetbook` project ID. It must remain isolated from production.

Do not add Bot Runner or Bot Chat secrets. Do not re-enable bot workflows as part of this project. Review any additional workflow file before enabling it. No maintenance workflow was confirmed during this limited path-based audit; inspect `.github/workflows/` in GitHub before enabling or adding maintenance automation.

The backup workflow must not run on a schedule. Production backup execution requires a deliberate manual dispatch with the confirmation input.
