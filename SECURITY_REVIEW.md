# MeetBook Bot Runner Security Review

## Changes made on the feature branch

- Firestore Rules now fail closed unless `settings/overall.botsEnabled == true`, the runner registration is explicitly enabled, and its `botIds` allowlist is non-empty.
- Bot posts, comments, reactions, chat replies, audit writes, inbox reads, and chat-history reads are restricted to active bot IDs assigned to that runner.
- Runner reactions carry an explicit bot identity marker; Firestore Rules verify that exact bot remains active and assigned.
- Bot comment creation and parent counter increment are one atomic Firestore commit. Rules require a newly created AI comment from that same active assigned bot before allowing the counter to advance.
- Runner comments on another AI bot's post are denied unless the global `settings/overall.botToBotComments` switch is explicitly true; Admin manual moderation remains separate.
- Bot Inbox creation now requires a real private chat, an active/chat-enabled bot, a same-batch user-authored message reference, and a quota increment. Version-2 inbox documents contain routing metadata and a message ID only; they do not duplicate private message text. Runner list queries exclude legacy unversioned items, and senders may delete their own legacy requests.
- Runner inbox updates are limited to marking an assigned bot's request handled/skipped. Rules permit the sender to delete their own inbox item but not rewrite it. The chat UI lets a sender unsend their own message; if the Runner has not yet fetched the referenced message, it skips the now-unavailable request. There is no separate inbox-item cancel button.
- The Bot Runner filters its work to assigned bots, fails closed on missing configuration, caps each bot at 12 actions per day across all Runner accounts, caps each user's bot replies at 15 per day across all Runner accounts, and applies a shared 60-second per-user reply cooldown.
- Private chat reply text is no longer copied into bot audit logs. A missing or permission-denied optional memory document is treated as no saved memory; it must never abort an otherwise authorized chat reply.
- Optional long-term memory processes only the last six user-authored messages, redacts obvious email/phone patterns, and excludes messages or summaries matching common credential, financial, ID, precise-address/location, health, political/religious, or sexuality/identity terms. This conservative heuristic cannot guarantee detection of every sensitive detail; memory remains off by default and users can disable or delete it.
- The Runner can directly get only the minimal consent projection for a specific user when checking an eligible interaction; collection listing is denied. This is a per-document access boundary, not an anonymity guarantee for a UID already known to an authorized Runner.
- The post Runner stores normalized SHA-256 fingerprints (up to 4,000) and compares its last 100 normalized post texts for near-duplicates across all bots assigned to that dedicated Runner. Repeated generated output falls back to a fresh role template or is skipped; the fingerprint is saved before post creation, and the manual bot workflows share a serialized concurrency group. This history is per Runner account, not shared between multiple Runner accounts.

## Important limitations

- The runner uses Firestore transaction-backed quota reservations, and Rules validate fixed-path per-bot, per-user, global-activity and Gemini counters. CI/emulator coverage exists, but isolated live staging verification and review of concurrency behavior remain required before activation.
- Detailed profile metadata is served through `publicProfiles/{uid}` and is restricted by Firestore Rules to the owner, staff, bots, everyone when visibility is `everyone`, or friends when visibility is `friends`. Reads now fail closed unless each public projection has its exact allowlisted shape; `publicDirectory/{uid}` exposes only minimal discovery fields. Public posts continue to follow their own audience settings and can appear in feeds independently of profile metadata visibility. The admin backfill replaces exact minimal directory projections; human detailed profiles and bot-consent projections are replaced by the owner on sign-in/profile/settings writes. Existing-account migration must still be verified before release.
- Firestore Admin SDK / service-account operations bypass Firestore Rules. Any future service account must remain least-privilege and be reviewed separately.
- The Admin bot panel is limited to bot creation, enable/disable, deletion and activity review. Firestore Rules allow only the `active` Boolean to change on existing bot profiles; personality, topic, name and other identity fields are immutable after creation. Admins cannot publish or comment as bots. Only manual dry-run/live-gated workflows are present; no scheduled or unattended bot workflows are enabled. Blocked or suspended users are excluded from public engagement, private chat-history reads, bot replies, and bot-memory access. The assigned active bot may read only ID-only routing metadata for the user-initiated inbox item addressed to it. The Runner must pass the separate chat-eligibility check before reading the referenced message or chat history; blocked/suspended items are marked skipped. Staff cannot read inbox metadata or private chat bodies. No secrets, Firebase production rules, project settings, or live data were changed.

## Built-in bot role-profile integrity

- The Runner treats each of the 23 built-in bots' role emoji, personality, and interest list as canonical. Missing optional profile fields fall back to built-in metadata; explicit malformed or conflicting values cause that bot to be skipped with a warning. Owner-authored post ideas and language preferences remain supported.
- The Admin dashboard surfaces a read-only mismatch warning. This check never repairs or overwrites a live profile. The owner must review all 23 existing bot documents and resolve any warning before activation; preserve intentional custom values for separate review rather than silently replacing them.

## Image upload Worker security

- The signed Cloudinary Worker validates the Firebase ID token and reads only the caller's own users/{uid} document through Firestore REST with that same token, so existing Firestore Rules still authorize the read. The users rule permits an owner to read their own document; the Worker does not use Admin SDK or service-account credentials.
- Uploads require the banned field to be explicitly Boolean false. A profile with isBot=true is not eligible for human image uploads; a present but malformed isBot value fails closed, while legacy human profiles may omit the field. A future suspendedUntil timestamp blocks the upload. Missing/malformed account state and Firestore lookup errors fail closed. Existing accounts with a missing banned field must be migrated/verified by the owner before enabling uploads; do not weaken Rules or silently default an unknown account to eligible.
- A SQLite-backed Durable Object keyed by Firebase UID enforces at most 20 valid image uploads per rolling 24 hours plus a 5-second cooldown. It reserves quota atomically; missing/unavailable limiter storage blocks the upload. This is per-user protection, not a replacement for Cloudflare's outer abuse/rate controls.
- The Worker and its Durable Object migration are source-only until the owner deploys them. Cloudinary credentials remain Worker secrets; imageUploadEndpoint stays blank until the deployed URL is verified. The configured Pages origin must be confirmed against the actual site hostname.

## Required verification before release

- The persistent duplicate-post fingerprint guard and its exact/near-duplicate regression were added on 2026-11-20. This feature-branch head has no confirmed CI result yet; the latest full CI evidence available is on PR #19 before this change.

- Unit/static tests, permission matrix, browser smoke tests, and Firestore Emulator suite must pass on the updated pull request.
- Run a dedicated integration test with a real isolated MeetBook staging project before any production enablement. Main-branch Bot Chat Run #30's visible summary showed exit code 1, but the actual dispatch input and step-level error log were not available; its mode and root cause remain unverified. The feature branch handles optional `botMemories` permission failures non-fatally and includes a regression test, but this has not been confirmed as Run #30's cause. No live reply is verified.
- Firestore transaction-backed rolling-window quotas and cooldowns are implemented and CI/emulator-tested. Isolated live staging verification and concurrency review remain required before exposing automated activity to users.


## Identity override protection — 2026-11-25
- Built-in bot IDs have fixed fictional name, username and bio in addition to canonical role emoji, personality and interests. Explicit stored overrides are treated as mismatches; missing legacy fields fall back to built-in values.
- The Runner skips a mismatched profile and uses canonical identity fields for accepted profiles. Admin creation uses the next approved built-in identity; identity fields are read-only. Manual post/comment helpers also fail closed on an identity mismatch.
- Regression tests cover substituted human-style names and professional-credential bios. This does not replace the owner audit of live bot profiles or isolated staging verification.
