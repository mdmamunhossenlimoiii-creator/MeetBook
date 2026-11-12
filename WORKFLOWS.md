# GitHub Actions Workflow Policy

| Workflow | Policy | Notes |
|---|---|---|
| `tests.yml` | Enabled | Pull requests and pushes to `main`; no Firebase production credentials |
| `bot-runner.yml` | Disabled pending release approval | Archived outside `.github/workflows/` as `.disabled`; no Actions trigger |
| `bot-chat.yml` | Disabled pending release approval | Archived outside `.github/workflows/` as `.disabled`; no Actions trigger |
| `backup.yml` | Manual-only | Requires explicit `confirm_backup=true` and MeetBook-only secrets |
| `maintenance.yml` (account deletion queue) | Disabled | Destructive Auth and Firestore deletion is blocked pending separate owner review |

The emulator test uses the `demo-meetbook` project ID. It must remain isolated from production.

## Limited Bot Runner policy approval

This policy authorizes implementation, code review, and isolated testing of MeetBook bot automation only. It does **not** authorize enabling a production workflow, adding credentials, running bots against live users, or deploying changes. Those actions require a separate release-readiness review and the owner's explicit approval.

### Permitted behavior after separate release approval

- Bots may publish role-relevant posts and make relevant comments or reactions only in areas where automated bot activity is allowed.
- Each bot must have a distinct fictional character role and topic scope. Roleplay must not claim that a bot is a real person or a real licensed professional.
- Bot profiles and bot-authored content must be clearly identified as AI/bot-generated. If asked directly, a bot must answer truthfully that it is an AI bot.
- No unsolicited direct messages. A bot may reply in a conversation only after a user initiates it or explicitly opts in; users must be able to stop or disable bot interactions.
- Never interact with private posts, private groups, blocked users, or users who opted out. Respect existing access controls; automation must not bypass Firestore rules or visibility checks.
- Do not generate repetitive, misleading, manipulative, harassing, or bulk promotional content. Keep posts and comments relevant to the bot's configured role and the conversation.
- Enforce per-bot and per-user rate limits, duplicate-content checks, cooldowns, and a global emergency stop. Limits must be configurable, conservative by default, and covered by tests.
- Record bot actions in auditable logs with bot ID, action type, target visibility/context, and timestamp. Do not log private message bodies or unnecessary personal data.
- Admin controls are limited to creating/configuring bots, enabling/disabling them, and deleting them. These controls do not override platform safety, privacy, or security protections.

### Security and release gates

- Keep Firebase Security Rules restrictive. Never grant broad client access for bot convenience.
- Use least-privilege, MeetBook-only credentials for any future runner. Do not use a personal account password, expose secrets to the browser, commit credentials, or print them in logs.
- Keep bot workflows archived outside `.github/workflows/` until a separate release approval. Do not add or enable workflow triggers under this limited policy.
- Before any live activation, review the runner's exact permissions, project-ID guard, secret handling, rate limits, opt-out enforcement, audit logs, rollback/kill switch, and tests. Require unit, browser, Firestore emulator, and relevant integration/security tests to pass.
- Any production activation, credential creation, workflow re-enablement, Firebase configuration/rules change, or deployment requires the owner's explicit separate approval.

The emulator test must remain isolated from production. Do not point tests at the live MeetBook database.

## Other workflow restrictions

Do not re-enable the account-deletion `maintenance.yml` workflow. It can permanently delete Authentication users and Firestore data; a separate owner-approved deletion policy and MeetBook project guard are required before reconsideration.

The backup workflow must not run on a schedule. Production backup execution requires a deliberate manual dispatch with the confirmation input.
