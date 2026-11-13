# GitHub Actions Workflow Policy

| Workflow | Policy | Notes |
|---|---|---|
| `tests.yml` | Enabled | Pull requests and pushes to `main`; no Firebase production credentials |
| `bot-runner.yml` | Manual-only; dry-run by default | One selected bot; at most one public post; live action requires protected environment approval and owner release flag |
| `bot-chat.yml` | Manual-only; dry-run by default | One selected Gemini bot; at most one user-initiated private chat reply; live action requires protected environment approval and owner release flag |
| `backup.yml` | Manual-only | Requires explicit `confirm_backup=true` and MeetBook-only secrets |
| `maintenance.yml` (account deletion queue) | Disabled | Destructive Auth and Firestore deletion is blocked pending separate owner review |

The emulator test uses the `demo-meetbook` project ID. It must remain isolated from production.

## Limited Bot Runner policy approval

This policy authorizes implementation, code review, and isolated testing of MeetBook bot automation. The new workflows are manual-only and dry-run by default; this policy does **not** authorize live actions, adding production credentials, enabling the Firebase kill switch, or deploying changes. Each live action requires a separate release-readiness review and the owner's explicit approval.

### Permitted behavior after separate release approval

- Bots may publish role-relevant posts and make relevant comments or reactions only in areas where automated bot activity is allowed.
- Each bot must have a distinct fictional character role and topic scope. Roleplay must not claim that a bot is a real person or a real licensed professional.
- Bot profiles and bot-authored content must be clearly identified as AI/bot-generated. If asked directly, a bot must answer truthfully that it is an AI bot.
- No unsolicited direct messages. A bot may reply in a conversation only after a user initiates it or explicitly opts in; users must be able to stop or disable bot interactions.
- Never interact with private posts, private groups, blocked users, or users who opted out. Respect existing access controls; automation must not bypass Firestore rules or visibility checks.
- Do not generate repetitive, misleading, manipulative, harassing, or bulk promotional content. Keep posts and comments relevant to the bot's configured role and the conversation.
- Enforce Firestore transaction-backed per-bot and per-user rolling-window quotas, duplicate-content checks, cooldowns, and a global emergency stop. Current enforced limits: 12 bot actions per rolling 24 hours, 15 replies per user per bot per rolling 24 hours with a 60-second cooldown, and 20 user-to-bot inbox messages per rolling 24 hours with a 10-second cooldown. Runner quota slots are reserved atomically before actions (a failed action still consumes its slot); inbox quota increments and inbox-item creation must share one atomic batch.
- Record bot actions in auditable logs with bot ID, action type, target visibility/context, and timestamp. Do not log private message bodies or unnecessary personal data.
- Admin controls are limited to creating/configuring bots, enabling/disabling them, and deleting them. These controls do not override platform safety, privacy, or security protections.

### Security and release gates

- Keep Firebase Security Rules restrictive. Never grant broad client access for bot convenience. Private account documents are owner/staff-only; signed-in users read a separate profile-display projection, and the Runner reads only a minimal bot-consent projection rather than full user settings.
- Use least-privilege, MeetBook-only credentials for any future runner. Do not use a personal account password, expose secrets to the browser, commit credentials, or print them in logs.
- Keep bot workflows manual-only with no schedule, push, or pull-request trigger. Both default to dry-run; live actions require `confirm_live=true`, the protected `meetbook-bot-live` environment, and the explicit `BOT_LIVE_TEST_APPROVED=yes` owner release flag. Do not enable unattended bot activity.
- Before any live activation, review the runner's exact permissions, project-ID guard, secret handling, rate limits, opt-out enforcement, audit logs, rollback/kill switch, and tests. Require unit, browser, Firestore emulator, and relevant integration/security tests to pass.
- Each runner registration must explicitly set `enabled: true` and a narrow `botIds` allowlist. Firestore Rules require both this flag and `settings/overall.botsEnabled == true`; missing or false values deny runner actions. Firestore Rules and REST transactions enforce a 12-action rolling 24-hour cap per bot, a 15-reply rolling 24-hour cap per user per bot, and a 60-second per-user reply cooldown. User-to-bot inbox creation is separately limited to 20 messages per rolling 24 hours with a 10-second cooldown.
- Any production activation, credential creation, workflow re-enablement, Firebase configuration/rules change, or deployment requires the owner's explicit separate approval.

The emulator test must remain isolated from production. Do not point tests at the live MeetBook database.

## Other workflow restrictions

Do not re-enable the account-deletion `maintenance.yml` workflow. It can permanently delete Authentication users and Firestore data; a separate owner-approved deletion policy and MeetBook project guard are required before reconsideration.

The backup workflow must not run on a schedule. Production backup execution requires a deliberate manual dispatch with the confirmation input.
