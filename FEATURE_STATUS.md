# MeetBook Feature Status

This document records repository source status and CI evidence only. Passing CI does not prove that owner-only Firebase/Cloudflare setup, live staging integration, or production deployment has been completed.

| Area | Source status | Verification / remaining work |
|---|---|---|
| Registration and login | Existing modules present; frontend Firebase config points to the separate `meetbook-65d30` project | No live authentication smoke test or production deployment verified. Owner must confirm Firebase Console settings and authorized domains. |
| Profiles and privacy | `users/{uid}` account documents are restricted by Firestore Rules to the owner, staff, and the bot-profile read path. A separate `publicProfiles/{uid}` projection contains only profile-display fields and is readable to signed-in users. | `profileVisibility` currently hides posts on the profile page only; it does not hide name, photo, cover, or bio in the signed-in public-profile projection, and public posts can still appear in feeds. The current setting label promises post visibility, not private profile metadata. If the product requires friends-only profile metadata, that needs a separate friend-aware rules/query/UI migration and remains unresolved. |
| Feed, posts, comments and reactions | Existing modules and restrictive rules present | General app behavior not fully re-verified in a live staging project. |
| Messaging | Private-chat creation and message writes enforce recipient `allowMessages` preference in Firestore Rules | Latest real Firestore Emulator permission matrix: 2,327 cases, 0 mismatches. This is emulator evidence, not a live-user test. |
| Bot identities and behavior | 23 built-in fictional bot profiles have role-specific emoji markers; UI keeps the AI Bot disclosure. The first three bots (`bot_01`–`bot_03`) have a server-side Gemini adapter with template fallback and now receive up to six recent messages from the current private chat as short-term context; remaining bots use keyword/template behavior. This is not durable long-term per-user memory. Real Gemini API execution has not yet been verified. Admins can configure/lifecycle-manage bots but cannot publish or comment as a bot; only the assigned Runner can. | Unit and browser checks pass. The bot Runner remains disabled. |
| Bot Runner security | Runner is restricted by an explicit bot-ID allowlist and global kill switch; user consent, public-post, private-chat, AI-label and bot-to-bot comment-switch checks are enforced in Rules. Firestore Rules also deny Admin bot publishing/commenting. | Durable Firestore transaction-backed quotas are implemented and covered by CI/emulator tests: 12 actions per bot per rolling 24 hours; 15 replies per user per bot per rolling 24 hours with a 60-second cooldown; and 20 user-to-bot inbox messages per rolling 24 hours with a 10-second cooldown. Isolated live staging verification is still required. |
| Bot workflows | `bot-runner.yml` and `bot-chat.yml` remain archived outside `.github/workflows/`; Bot Runner credentials are not configured; a Gemini API secret may be present in repository Actions Secrets, but it does not enable the archived workflows. | Keep disabled until a separate release approval. No live bot activity was started. |
| Image uploads | Signed Cloudinary Worker source and client integration are present; video file uploads remain disabled. | **Owner setup required:** Worker is not deployed and `imageUploadEndpoint` is blank. Owner must configure Cloudflare secrets, deploy the Worker, set the endpoint, configure abuse/rate controls, and test real uploads. |
| App Check | Optional site-key field is present in frontend config. | `appCheckSiteKey` is blank; owner must decide and configure App Check before production if required by the security review. |
| Admin dashboard | Existing admin modules and role checks present | First MeetBook Super Admin initialization and live admin workflow still require owner verification. |
| GitHub Pages | Repository metadata and static app are present | Deployment and actual public URL behavior have not been verified in this review. |
| MySocial separation | MeetBook uses its own Firebase project ID and MeetBook-specific runner policy. | Do not reuse MySocial credentials, Firebase project, or production data. |

## Latest automated verification

For the code-bearing head of PR #5 (`942ff83a813138c3d770234fb75391382eb791f8`), GitHub Actions run `43397604874` completed all three jobs (`unit`, `browser`, `rules-emulator`) successfully. The two later commits on the branch only corrected documentation. This confirms CI only, not real Gemini API or live Firebase integration.

- Unit: 304/304 passed; import check: 0 problems.
- Browser/Admin smoke: passed.
- Firestore Rules Emulator: 2,327 permission cases, 0 mismatches.

The Runner integration tests in the unit suite use the repository's in-memory Firestore/rules test harness. They are not a substitute for a dedicated isolated MeetBook staging project.

## Release decision

**Not release-ready.** The profile-metadata visibility policy (if friends-only metadata is required), isolated staging integration, owner-side Cloudflare Worker setup, Firebase/Pages owner verification, and real end-to-end checks remain outstanding. Durable server-side bot quotas are implemented and covered by CI/emulator tests. Do not merge, enable workflows, activate bots, or deploy based on CI alone.
