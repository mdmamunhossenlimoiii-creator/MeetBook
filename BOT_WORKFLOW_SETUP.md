# MeetBook Bot Workflow Setup — owner checklist

This setup is for the existing MeetBook Firebase project only: `meetbook-65d30`.
It does not use MySocial credentials or a second Firebase project.

## Workflow behavior

- Both workflows are manual-only (`workflow_dispatch`); there are no schedules, push triggers, or background polling.
- Both default to `dry_run=true`. A dry run signs in and checks the project/global switch, but performs no Firestore writes and does not call Gemini.
- The Runner workflow is isolated to one selected bot and at most one public post; comments/reactions/private chats are not processed in post mode.
- The Chat workflow is isolated to one selected bot and at most one already user-initiated private chat request.
- Chat mode accepts only `bot_01`, `bot_02`, or `bot_03`.
- Live mode requires `confirm_live=true`, a protected GitHub Environment approval, and the explicit repository variable `BOT_LIVE_TEST_APPROVED=yes`.
- The Firestore global kill switch and runner allowlist remain mandatory. Missing/off settings fail closed.

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
6. Do not create or edit any user consent documents on behalf of users. Users must opt in themselves.

## Controlled test order

1. Run the Chat workflow with `dry_run=true` first. It should not reply or write data.
2. Inspect the workflow logs for project guard success, global switch status, runner allowlist, and the absence of secrets/private message bodies.
3. Before a real chat reply, confirm the selected bot is enabled, the sender initiated the private chat, the sender has not opted out, the privacy disclosure is visible, and the global kill switch/runner allowlist are intentionally enabled.
4. Use a single owner-controlled test account and one pending chat request. Then use `confirm_live=true` only after the GitHub Environment approval and separate owner release flag are configured.
5. Verify exactly one reply in the existing private chat, no public post/comment/reaction, and a bot audit record that contains no private message body.
6. Keep public posting disabled until a separate review authorizes it. If any unexpected action occurs, set the global switch and runner's `enabled` flag to false immediately.

Do not paste secrets into chat or issues. Never point tests at MySocial or a different Firebase project.
