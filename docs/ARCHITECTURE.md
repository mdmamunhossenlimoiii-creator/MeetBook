# MySocial — Architecture

A Facebook-style social platform that runs entirely on free tiers:
static HTML/CSS/ES-module JS on **GitHub Pages**, backed by **Firebase Auth** and **Cloud Firestore**.
There is no build step and no server of our own.

## 1. Overview

```
Browser (GitHub Pages, static files)
  index.html ── js/app.js (router + shell)
                 ├─ auth.js, feed.js, profile.js, friends.js, messages.js
                 ├─ stories.js, reels.js, groups.js, notifications.js
                 ├─ settings.js, admin.js
                 └─ firebase.js  ──►  Firebase Auth + Cloud Firestore (Spark plan)
                                 └►  Cloudinary (optional, free tier, video upload only)
```

* Single-page app, hash routing (`#/feed`, `#/profile/<uid>`, …) so GitHub Pages needs no rewrite rules.
* Firebase SDK v10 modular build is loaded from Google's CDN as ES modules.
* All security is enforced by `firestore.rules`. The frontend holds no secrets: the Firebase web config is public by design.
* Staff rights = a document at `/admins/{uid}` with `role` = `super_admin` | `admin` | `moderator` (a missing or unknown role grants NOTHING: rules and app fail closed). The first one is created by hand in the Firebase console; afterwards only a super_admin can change staff. No admin credential exists in the frontend, and rules block everyone else from writing `/admins`.
* Server-side work (permanent account deletion, backups) runs in **GitHub Actions** with a Google service account kept in GitHub Secrets (`scripts/`). The browser only queues a request in `/deletionRequests`.

## 2. Why images are stored in Firestore, not Storage

Cloud Storage for Firebase availability on the no-cost plan has changed over time (non-default buckets need Blaze). To guarantee a 100 % free setup, the app does **not** use Storage:

* Images are resized and re-encoded in the browser (avatar 256 px, cover 1000 px, post/chat/story images ≤ 900 px, JPEG q≈0.7) and stored as data URLs inside the Firestore document (typically 40–150 KB, hard cap 1 MB per document, enforced in the UI at ~700 KB).
* Videos are never stored in Firestore. A short video / post video is a **link** (direct `.mp4`/`.webm` URL, or a YouTube/Shorts URL). Optionally, if you create a free Cloudinary account and fill `cloudinary` in `js/firebase-config.js`, the Reels page can upload a video file (≤ 50 MB) directly from the browser to Cloudinary (unsigned preset) and store the resulting URL.

## 3. Data model (Firestore)

| Collection | Document id | Fields |
|---|---|---|
| `users` | uid | name, nameLower, bio, photo, cover, banned, suspendedUntil, verified, lastActiveAt, createdAt, settings{profileVisibility, allowMessages, defaultVisibility, allowBotEngagement} |
| `users` (AI bots) | `bot_01`…`bot_30` | same fields as a user plus `isBot: true`, username, personality, interests[], lang, active, autoPost/autoComment/autoReaction/chatEnabled, dailyLimit, ideas[], ideasBn[]; photo is a generated SVG data URL. No Firebase Auth account exists for a bot. Only an admin can create one or write posts/comments as one (rules), and bot posts must be public with `videoUrl == ''`. |
| `botRunners` | uid | existence only; created by hand. Marks the automation account used by the GitHub Action; rules let it write only as AI bots. |
| `botState` | `runner` | used (which post ideas each bot used), commented (post:bot pairs), updatedAt. Read/write only by the bot-runner. |
| `users/{uid}/saved` | postId | createdAt |
| `admins` | uid | role (`super_admin`/`admin`/`moderator`), addedBy, addedAt |
| `adminLogs` | auto | actorUid, actorName, role, action, target, details, createdAt. Create-only; nobody can edit or delete |
| `settings` | `global` | maintenance, maintenanceMessage, registrationOpen, botsEnabled, botToBotComments. Public read, admin write |
| `announcements` | auto | text, level, active, expiresAt, createdAt |
| `deletionRequests` | uid | status (`pending`/`done`/`refused`), requestedBy, note. Super admin creates; the Action finishes it |
| `system` | `backups` | last backup status written by the backup Action; super admin read-only |
| `botInbox` | auto | fromUid, botId, chatId, text, handled. A user's message to a bot, answered by the bot Action |
| `botLogs` | auto | botId, botName, kind (post/comment/reaction/chat), targetId, text, createdAt |
| `posts` | auto | uid, authorName, text, image, videoUrl, hidden, commentsDisabled, visibility (`public`/`friends`/`me`/`group`), audience[uids], groupId, sharedFrom{postId,uid,authorName,text}, reactions{uid:type}, commentCount, shareCount, createdAt |
| `posts/{id}/comments` | auto | uid, authorName, text, createdAt |
| `reports` | auto | kind (`user`/`post`/`comment`/`group`/`reel`), targetId, postId (for comments), targetUid, reason, details, reporterUid, status (`open`/`resolved`), action, createdAt |
| `friendRequests` | `from_to` | from, to, createdAt |
| `friendships` | sorted `uidA_uidB` | members[2], createdAt |
| `follows` | `follower_followed` | follower, followed, createdAt |
| `chats` | private: sorted `uidA_uidB`; group: auto | type, members[], name, createdBy, lastMessage{text,uid}, lastAt, lastRead{uid:ts}, createdAt |
| `chats/{id}/messages` | auto | uid, text, image, createdAt |
| `stories` | auto | uid, authorName, image, text, bg, audience[], createdAt, expiresAt |
| `reels` | auto | uid, authorName, videoUrl, caption, likes{uid:true}, createdAt |
| `groups` | auto | name, nameLower, description, privacy, ownerUid, members[], createdAt |
| `groups/{id}/requests` | uid | createdAt (join request for private groups) |
| `notifications` | auto | to, from, fromName, type, postId, extra, read, createdAt |

### Why `audience` arrays?
Firestore security rules cannot prove a *query* is allowed if it depends on a per-document `exists()` lookup. So friends-only posts and stories store an `audience` array (the author + their friends **at the time of posting**) and are fetched with `array-contains`. Consequence: someone who becomes a friend later does not see older friends-only posts. This is a deliberate free-tier-friendly trade-off.

### Counters without Cloud Functions
Cloud Functions need the paid plan, so counters live on the document. Rules only allow:
* the caller's own key in `reactions` / `likes`,
* `commentCount` / `shareCount` changing by at most 1.

### Admin panel code layout
`js/admin/index.js` (sidebar + role gate, sections loaded on demand) with one module per section: `dashboard`, `reports`, `users`, `posts`, `content`, `bots`, `announcements`, `settings`, `logs`, `staff`, `server`, plus `common.js` (roles, activity log, chart). Bot logic: `js/bots-data.js` (profiles, post ideas), `js/bots-brain.js` (templates, topic detection, replies; pure, shared with the Node scripts), `js/bots.js` (Firestore actions).

## 4. Required composite indexes

`firestore.indexes.json` lists them all (deploy with Firebase CLI, or create from the link Firestore prints in the browser console / in the app's error notice the first time a query runs). Indexes are free.

## 5. Free-tier limits and how the app respects them

Figures are from Firebase's pricing page at the time of writing — verify before launch at <https://firebase.google.com/pricing>.

| Resource (Spark, no-cost) | Limit | How MySocial stays inside |
|---|---|---|
| Firestore reads | 50,000 / day | page size 20, author profiles cached per session, reaction state inside the post doc (no extra reads), saved ids loaded once |
| Firestore writes | 20,000 / day | reactions/comments are single small writes; read receipts only on opening a chat |
| Firestore deletes | 20,000 / day | expired stories are only deleted by their owner |
| Firestore storage | 1 GiB | images are compressed in the browser before storing |
| Firestore egress | 10 GiB / month | thumbnails kept small; videos are not stored |
| Auth | email/password and Google are no-cost | phone/SMS auth is not used |
| GitHub Pages | ~1 GB site, ~100 GB / month soft limits | static files only, no media hosted |
| Cloudinary (optional) | free monthly credits | only used when you configure it |

Note: `get()` / `exists()` calls inside `firestore.rules` are billed as document reads too. Every write by a signed-in user costs one extra read (the "is this user banned?" check), and writes into groups, comments and chats cost one or two more.

At roughly 100–300 daily active users the free quota is usually enough; beyond that, expect to hit the daily read limit first.

## 6. Security checklist

* `firestore.rules` — deny by default; ownership checks; banned users cannot write; admin via `/admins/{uid}`.
* **App Check** — set `appCheckSiteKey` (reCAPTCHA v3) in `js/firebase-config.js` and enable enforcement for Firestore in the console. App Check is the only protection against scripted abuse of the public config.
* All user text is HTML-escaped before rendering; links get `rel="noopener noreferrer"`.
* Privacy settings (profile visibility, who can message) are enforced in the UI only; user profile documents (name, bio, photo) are readable by every signed-in user because names must show on posts. Post and story visibility **is** enforced by the rules.

## 7. Known limits

* Search is by name prefix (Firestore has no full-text search).
* No push notifications, no presence/online status, no end-to-end encryption.
* "Load more" re-subscribes with a larger limit; fine for hundreds of posts, not millions.
