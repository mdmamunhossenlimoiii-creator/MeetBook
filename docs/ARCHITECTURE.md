# MeetBook — Architecture

MeetBook is a static, browser-based social application. It uses HTML, CSS and ES-module JavaScript, with Firebase Authentication and Cloud Firestore supplied by a **new MeetBook-owned Firebase project**. GitHub Pages is the intended static hosting platform. There is no application server in the current frontend architecture.

## 1. Overview

```
Browser (MeetBook GitHub Pages project site)
  index.html ── js/app.js (router + shell)
                 ├─ auth.js, feed.js, profile.js, friends.js, messages.js
                 ├─ stories.js, reels.js, groups.js, notifications.js
                 ├─ settings.js, admin.js
                 └─ firebase.js ──► MeetBook Firebase Auth + Cloud Firestore
                                  └► Cloudinary (optional, separately configured)
```

- Single-page app with hash routing (for example, `#/feed`, `#/profile/<uid>`), so GitHub Pages does not need rewrite rules.
- Firebase SDK v10 modular build is loaded from Google's CDN as ES modules.
- `js/firebase-config.js` is the public client configuration file. It intentionally contains empty placeholders until the owner creates a separate MeetBook Firebase project.
- Firebase web configuration is not a private secret. Actual authorization must be enforced by Firestore rules and trusted backend operations.
- Staff roles are represented by `/admins/{uid}` with `role` exactly `super_admin`, `admin` or `moderator`. Unknown or missing roles grant no privilege. The owner initializes the first Super Admin in the MeetBook Firebase project.
- Server-side jobs, when configured, use credentials stored only in MeetBook GitHub Actions Secrets.

## 2. Media and storage design

The existing application stores compressed images as data URLs inside Firestore documents rather than Firebase Storage. Videos are represented by links; optional Cloudinary upload support is separately configured. This design is inherited from the source application and must be reviewed against MeetBook's expected scale and Firestore document limits before launch.

Do not configure or reuse MySocial storage buckets. If MeetBook later adopts Firebase Storage, create its bucket and rules in the MeetBook Firebase project.

## 3. Data model

The existing Firestore rules, indexes and application modules describe these collections:

- Identity and roles: `users`, `admins`, `adminLogs`, `settings`, `announcements`.
- Social graph: `friendRequests`, `friendships`, `follows`.
- Content: `posts`, `posts/{id}/comments`, `stories`, `reels`, `groups`, `groups/{id}/requests`.
- Communication: `chats`, `chats/{id}/messages`.
- Notifications and moderation: `notifications`, `reports`.
- Existing bot-related collections and fields remain isolated and are out of scope for this separation stage.

The existing rules and indexes are retained as the starting point for MeetBook. They must be reviewed and published by the owner only after the new Firebase project has been created and its target identity verified.

## 4. Access control and known privacy limitations

The existing rules include ownership checks, role checks, audience checks for posts/stories, and deny-by-default behavior in protected areas. However, the inherited application documentation and implementation identify limitations that must not be hidden:

- Profile visibility and messaging privacy have historically been enforced in parts of the UI rather than comprehensively in database rules.
- User profile fields may be readable by signed-in users to support rendering author information.
- Some moderation behavior, such as hidden posts and maintenance mode, has UI-level limitations.
- The current architecture does not provide end-to-end encrypted messaging.

These limitations require a dedicated security review before production use. Do not claim full privacy enforcement until rule and backend tests prove it.

## 5. GitHub Actions boundaries

- The Tests workflow is retained and uses a local emulator project named `demo-meetbook`.
- Bot Runner and Bot Chat workflows are retained as source but have no event triggers and include a defensive disabled job.
- The encrypted backup workflow is manual-only and requires an explicit confirmation input.
- Production credentials must be MeetBook-specific and stored in GitHub Secrets, never committed.
- No Firebase deployment or production data operation is performed by repository automation without explicit user authorization.

## 6. Hosting

The intended project-site URL is:

`https://mdmamunhossenlimoiii-creator.github.io/MeetBook/`

The canonical URL and metadata are configured for that address. Actual availability depends on the owner enabling GitHub Pages in the MeetBook repository and verifying deployment.

## 7. Known inherited constraints

- Search is prefix-based rather than full-text.
- Push notifications, presence and end-to-end encryption are not currently part of the documented implementation.
- Firestore read/write quotas and document size limits constrain scale.
- Backup does not include Firebase Authentication passwords or all large embedded images.
- The backup/restore scripts and rules require testing against a dedicated non-production MeetBook project or emulator before production use.
