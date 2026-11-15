# MeetBook Bot Runner Security Review

## Changes made on the feature branch

- Firestore Rules now fail closed unless `settings/global.botsEnabled == true`, the runner registration is explicitly enabled, and its `botIds` allowlist is non-empty.
- Bot posts, comments, reactions, chat replies, audit writes, inbox reads, and chat-history reads are restricted to active bot IDs assigned to that runner.
- Runner reactions carry an explicit bot identity marker; Firestore Rules verify that exact bot remains active and assigned.
- Bot comment creation and parent counter increment are one atomic Firestore commit. Rules require a newly created AI comment from that same active assigned bot before allowing the counter to advance.
- Runner comments on another AI bot's post are denied unless the global `settings/global.botToBotComments` switch is explicitly true; Admin manual moderation remains separate.
- Bot Inbox creation now requires a real private chat containing both the sender and the selected bot, an active/chat-enabled bot profile, a bounded message, and a restricted payload shape.
- Runner inbox updates are limited to marking an assigned bot's request handled; users cannot rewrite or delete inbox records.
- The Bot Runner filters its work to assigned bots, fails closed on missing configuration, caps each bot at 12 actions per day across all Runner accounts, caps each user's bot replies at 15 per day across all Runner accounts, and applies a shared 60-second per-user reply cooldown.
- Private chat reply text is no longer copied into bot audit logs.

## Important limitations

- The runner uses Firestore transaction-backed quota reservations, and Rules validate fixed-path per-bot, per-user, global-activity and Gemini counters. CI/emulator coverage exists, but isolated live staging verification and review of concurrency behavior remain required before activation.
- Detailed profile metadata is served through `publicProfiles/{uid}` and is restricted by Firestore Rules to the owner, staff, bots, everyone when visibility is `everyone`, or friends when visibility is `friends`. `publicDirectory/{uid}` exposes only minimal discovery fields. Public posts continue to follow their own audience settings and can appear in feeds independently of profile metadata visibility. The admin backfill now writes only exact minimal directory projections and missing bot profiles; human detailed profiles and bot-consent projections remain owner-created on sign-in. Existing-account migration must still be verified before release.
- Firestore Admin SDK / service-account operations bypass Firestore Rules. Any future service account must remain least-privilege and be reviewed separately.
- The Admin bot panel is limited to bot creation, enable/disable, deletion and activity review. Firestore Rules allow only the `active` Boolean to change on existing bot profiles; personality, topic, name and other identity fields are immutable after creation. Admins cannot publish or comment as bots. Only manual dry-run/live-gated workflows are present; no scheduled or unattended bot workflows are enabled. Blocked or suspended users are excluded from public engagement, private chat-history reads, bot replies, and bot-memory access. The assigned active bot may read only the user-initiated inbox item addressed to it, then must pass the separate chat-eligibility check before reading history or replying; blocked/suspended items are marked skipped. Staff cannot read private bot inbox bodies. No secrets, Firebase production rules, project settings, or live data were changed.

## Required verification before release

- Unit/static tests, permission matrix, browser smoke tests, and Firestore Emulator suite must pass on the updated pull request.
- Run a dedicated integration test with a real isolated MeetBook staging project before any production enablement.
- Firestore transaction-backed rolling-window quotas and cooldowns are implemented and CI/emulator-tested. Isolated live staging verification and concurrency review remain required before exposing automated activity to users.
