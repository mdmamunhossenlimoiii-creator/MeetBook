# MeetBook Security Notes

## Trust boundaries

- MeetBook and MySocial must use different Firebase projects, Authentication tenants, Firestore databases, Storage buckets, administrator records, and credentials.
- Firebase web configuration is public client configuration; Firestore rules and trusted server authorization provide access control.
- Service-account credentials are private and belong only in MeetBook GitHub Actions Secrets when a reviewed workflow requires them.
- No AI bot workflow may run in this project during this stage.
- Long-term bot memory is opt-in and off by default. Only the first three Gemini-powered bots can use it. Each memory is isolated by bot and user and stores a bounded summary, not a raw transcript. Recent user-authored messages may be sent to Gemini again for summarization when enabled; this can consume additional API quota.
- Users can inspect and delete individual summaries, clear all summaries, or disable memory. Disabling memory revokes Runner access and deletes stored summaries in the same batch. The account-deletion job also purges all `botMemories` owned by the deleted user and removes their `publicDirectory` projection. The Runner can read/write one exact memory only for an assigned bot while the user's consent projection is enabled; only the owner can list or delete memory records.

## Required owner actions

- Create a new MeetBook Firebase project.
- Review and publish MeetBook rules/indexes.
- Configure a MeetBook Super Admin identity.
- Add only MeetBook-specific secrets.
- Review GitHub Pages and backup settings before production use.

## Known inherited risks requiring review

- Private one-to-one chat creation and every normal private-message write are checked against the recipient's `settings.allowMessages` preference in Firestore rules. A friends-only recipient requires an existing friendship.
- Some moderation and maintenance behavior is enforced in the client UI.
- Full `publicProfiles/{uid}` metadata is restricted by Firestore Rules when `profileVisibility == 'friends'`; only the owner, friends, staff, or bot-profile viewers can read it. `publicDirectory/{uid}` remains searchable by signed-in users but contains only a display name, normalized name, and minimal account markers (no bio, photo, cover, or settings). Public posts remain governed by their own audience and may still appear in feeds. Existing accounts need the directory projection bootstrap on next sign-in before this experience is complete.
- Current messaging is not end-to-end encrypted.
- Backup excludes Firebase Authentication credentials and may omit large embedded images.

The private-message, friend-only profile metadata, and bot-memory permission rules have passed the local matrix and real Firestore Emulator tests. This is emulator evidence only; real Gemini memory summarization and isolated staging integration have not been performed. Owner review and publishing to the separate MeetBook Firebase project are still required. Hidden-post and maintenance behavior remain UI-level limitations, and messaging is not end-to-end encrypted.

## Incident hygiene

If a service-account key is exposed, revoke it in Google Cloud IAM, replace the GitHub Secret, and review relevant workflow logs. Never paste secrets into issues or commit history.

## Image upload boundary

- Browser uploads go only to the MeetBook Cloudflare Worker, not directly to Cloudinary.
- The Worker validates a Firebase ID token, checks JPEG file bytes and a 1 MB maximum, and signs Cloudinary requests server-side.
- Cloudinary API secrets belong only in Worker Secret settings. Never commit them.
- CORS is restricted to the configured MeetBook Pages origin. CORS is not an authentication mechanism; Firebase token verification is also required.
- Review Cloudflare account-level abuse controls and usage limits before production. The Worker is not deployed by this repository change.
