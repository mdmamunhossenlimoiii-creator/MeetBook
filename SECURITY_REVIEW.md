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

- The runner uses Firestore transaction-backed quota reservations, and Rules validate the fixed-path counters. CI/emulator coverage exists, but isolated live staging verification and review of concurrency behavior remain required before activation.
- `profileVisibility` currently means “who can see my posts on my profile page” in the app UI. It does not hide profile metadata from signed-in users, and it does not hide public posts from feeds. The Settings screen already discloses this. A stronger private-profile feature needs a separate data-model and query migration; changing the user-document read rule alone would break existing feed/profile lookups.
- Firestore Admin SDK / service-account operations bypass Firestore Rules. Any future service account must remain least-privilege and be reviewed separately.
- The Admin bot panel is limited to bot creation/configuration, enable/disable, deletion and activity review; manual post/comment-as-bot controls were removed. The archived Bot Runner workflows remain disabled. No secrets, Firebase production rules, project settings, or live data were changed.

## Required verification before release

- Unit/static tests, permission matrix, browser smoke tests, and Firestore Emulator suite must pass on the updated pull request.
- Run a dedicated integration test with a real isolated MeetBook staging project before any production enablement.
- Implement and test an atomic server-side rate limiter before exposing automated activity to users.
