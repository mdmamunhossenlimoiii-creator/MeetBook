# MeetBook Feature Status

This document records repository source status and CI evidence only. Passing CI does not prove that owner-only Firebase/Cloudflare setup, live staging integration, or production deployment has been completed.

| Area | Source status | Verification / remaining work |
|---|---|---|
| Registration and login | Existing modules present; frontend Firebase config points to the separate `meetbook-65d30` project | No live authentication smoke test or production deployment verified. Owner must confirm Firebase Console settings and authorized domains. |
| Profiles and privacy | Full `publicProfiles/{uid}` metadata is now restricted by Firestore Rules to the owner, staff, bots, or friends when `profileVisibility == friends`. A separate `publicDirectory/{uid}` exposes only display name/name search and minimal account markers for discovery; it excludes bio, photo, cover and settings. | Global/Friends search uses the minimal directory. A private profile route shows only the directory name and friend-request controls when detailed metadata is denied. Profile visibility and directory projections are bound to canonical `users/{uid}` fields using `getAfter`. Public posts remain governed by each post's own audience and may still appear in feeds. Existing accounts receive the directory projection during the next successful profile bootstrap; a full migration check is still required before release. |
| Feed, posts, comments and reactions | Existing modules and restrictive rules present | General app behavior not fully re-verified in a live staging project. |
| Messaging | Private-chat creation and message writes enforce recipient `allowMessages` preference in Firestore Rules | Latest real Firestore Emulator permission matrix: 2,327 cases, 0 mismatches. This is emulator evidence, not a live-user test. |
| Bot identities and behavior | 23 built-in fictional bot profiles have role-specific emoji markers; UI keeps the AI Bot disclosure. The first three bots (`bot_01`–`bot_03`) use Gemini with template fallback and up to six recent messages as short-term context. An opt-in, per-user/per-bot long-term memory summary is implemented for those three bots only; raw transcripts are not stored. Remaining bots use keyword/template behavior and do not yet have Gemini memory summarization. | Memory is off by default. Users can opt in, see the disclosure, inspect/delete individual summaries, clear all saved summaries, or disable memory. Account deletion also purges owned bot memories. Summaries are bounded to 1,200 characters, built only from user-authored messages, and obvious email/phone patterns are redacted. Real Gemini API memory summarization has not been verified. |
| Bot Runner security | Runner is restricted by an explicit bot-ID allowlist and global kill switch; user consent, public-post, private-chat, AI-label and bot-to-bot comment-switch checks are enforced in Rules. Firestore Rules also deny Admin bot publishing/commenting. | Durable Firestore transaction-backed quotas are implemented and covered by CI/emulator tests: 12 actions per bot per rolling 24 hours; 15 replies per user per bot per rolling 24 hours with a 60-second cooldown; and 20 user-to-bot inbox messages per rolling 24 hours with a 10-second cooldown. Isolated live staging verification is still required. |
| Bot workflows | `bot-runner.yml` and `bot-chat.yml` remain archived outside `.github/workflows/`; Bot Runner credentials are not configured; a Gemini API secret may be present in repository Actions Secrets, but it does not enable the archived workflows. | Keep disabled until a separate release approval. No live bot activity was started. |
| Image uploads | Signed Cloudinary Worker source and client integration are present; video file uploads remain disabled. | **Owner setup required:** Worker is not deployed and `imageUploadEndpoint` is blank. Owner must configure Cloudflare secrets, deploy the Worker, set the endpoint, configure abuse/rate controls, and test real uploads. |
| App Check | Optional site-key field is present in frontend config. | `appCheckSiteKey` is blank; owner must decide and configure App Check before production if required by the security review. |
| Admin dashboard | Existing admin modules and role checks present | First MeetBook Super Admin initialization and live admin workflow still require owner verification. |
| GitHub Pages | Repository metadata and static app are present | Deployment and actual public URL behavior have not been verified in this review. |
| MySocial separation | MeetBook uses its own Firebase project ID and MeetBook-specific runner policy. | Do not reuse MySocial credentials, Firebase project, or production data. |

## Latest automated verification

PR #7 implements opt-in long-term memory and Firestore-enforced profile metadata privacy. GitHub Actions run `43403846923` completed all three jobs successfully on the code head that includes the account-deletion cleanup.

- Unit: 330/330 passed; import check: passed. This includes frontend syntax checks and an account-deletion test confirming owned bot memories and the public directory projection are purged.
- Browser/Admin smoke: passed.
- Firestore Rules Emulator: 2,674 permission cases, 0 mismatches.
- Additional emulator assertions verified atomic profile-visibility and bot-memory-consent updates, owner-only memory listing, and memory opt-out revocation plus deletion.

This is CI/emulator evidence only. No real Gemini API summarization, isolated staging integration, Firebase Console publishing, or production deployment has been performed.

## Release decision

**Not release-ready.** The new profile privacy and opt-in memory changes require successful CI, full existing-account projection migration, isolated staging verification, and owner-side Firebase/Cloudflare/Pages checks. Real Gemini API memory summarization has not been run. Durable server-side bot quotas remain covered by CI/emulator tests. Do not merge, enable workflows, activate bots, or deploy based on CI alone.
