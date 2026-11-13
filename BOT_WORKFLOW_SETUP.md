# MeetBook Bot Workflow Setup — owner checklist

This setup is for the existing MeetBook Firebase project only: `meetbook-65d30`.
It does not use MySocial credentials or a second Firebase project.

## Workflow behavior

- The two owner-test workflows remain manual-only (`workflow_dispatch`) and default to `dry_run=true`. A dry run signs in and checks the project/global switch, but performs no Firestore writes and does not call Gemini.
- Two scheduled workflows are included: social activity every 6 hours and chat polling every 20 minutes. Both are **skipped by default** unless the repository variable `BOT_SCHEDULE_LIVE_ENABLED` is explicitly set to `yes`.
- Scheduled workflows use the separate `meetbook-bot-scheduled` GitHub Environment, require its own secrets/expected-project variable, and share a concurrency lock with manual bot workflows.
- Social runs are bounded to at most one post and one engagement per run. Chat-only runs process at most one pending chat reply and do not post or comment.
- The Firestore global kill switch, runner enablement, and per-runner bot allowlist remain mandatory. Missing/off settings fail closed.

## GitHub owner setup

1. Open the MeetBook repository Settings → Environments and create an environment named `meetbook-bot-live`.
2. Add required reviewers to that environment (owner approval required). Do not allow self-review if the repository settings provide that option.
3. Add these **Environment secrets**:
   - `BOT_RUNNER_EMAIL`: email of a dedicated Firebase Auth runner account, not a personal account.
   - `BOT_RUNNER_PASSWORD`: password for that dedicated runner account.
   - `GEMINI_API_KEY`: key for server-side Gemini requests. Never put it in browser files, commits, logs, or chat.
4. Add this **Environment variable**:
   - `BOT_RUNNER_EXPECTED_PROJECT_ID` = `meetbook-65d30`
5. Do not set `BOT_LIVE_TEST_APPROVED` yet. It is a separate release gate and should be added only after the owner has reviewed the live test scope and approved one specific action.
6. Create a second environment named `meetbook-bot-scheduled`. Add the same three environment secrets and the environment variable `BOT_RUNNER_EXPECTED_PROJECT_ID=meetbook-65d30`.
7. Leave the repository variable `BOT_SCHEDULE_LIVE_ENABLED` unset (or set it to `no`). Scheduled jobs remain skipped until the owner deliberately changes it to `yes` after the controlled tests pass.

## Firebase owner setup — do not enable the kill switch yet

1. In Firebase Authentication for `meetbook-65d30`, create a dedicated runner account. Do not use the owner's personal login.
2. Record the new account's UID.
3. In Firestore, create `botRunners/{runnerUid}` with only:
   ```json
   {
     "enabled": false,
     "botIds": ["bot_01", "bot_02", "bot_03"]
   }
   ```
   Keep `enabled=false` during setup. The document is owner-created; Firestore Rules deny client writes to it.
4. Verify that only the first three bot profiles exist and are correctly identified as bots. Keep bots 04–23 inactive and outside the runner allowlist.
5. Keep `settings/global.botsEnabled=false` and `botToBotComments=false` until the release checklist is complete.
6. Keep `BOT_SCHEDULE_LIVE_ENABLED` unset/no until the owner has verified runner registration, bot profiles, consent, quotas, and scheduled job configuration.
7. Do not create or edit any user consent documents on behalf of users. Users must opt in themselves.

## Controlled test order

1. Run either manual workflow with `dry_run=true` first. It validates runner authentication and project guard, then exits safely while the global bot switch or runner registration is OFF; it must not reply or write data.
2. Inspect the workflow logs for the exact global switch state, runner allowlist, project guard success, and the absence of secrets/private message bodies.
3. Before a real chat reply, confirm the selected bot is explicitly active with chat enabled, the sender initiated the private chat, the sender has not opted out, the privacy disclosure is visible, and the global kill switch/runner allowlist are intentionally enabled.
4. Use a single owner-controlled test account and one pending chat request. Then use `confirm_live=true` only after the GitHub Environment approval and separate owner release flag are configured.
5. Verify exactly one reply in the existing private chat, no public post/comment/reaction, and a bot audit record that contains no private message body.
6. Keep public posting disabled until a separate review authorizes it. If any unexpected action occurs, set the global switch and runner's `enabled` flag to false immediately.

## Scheduled automation release gate

Scheduled activity is deliberately opt-in. After the owner has completed the controlled tests and reviewed the exact activity limits, set the repository variable `BOT_SCHEDULE_LIVE_ENABLED=yes` to enable scheduled jobs. Setting it to anything else, or removing it, skips both jobs. The Firestore `settings/global.botsEnabled` kill switch, each bot's explicit activity flags, runner registration, and the per-bot allowlist are still required. To stop activity immediately, set the repository variable to `no` and turn `settings/global.botsEnabled` OFF.

Do not paste secrets into chat or issues. Never point tests at MySocial or a different Firebase project.
