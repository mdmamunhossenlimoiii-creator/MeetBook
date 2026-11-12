# MeetBook Security Notes

## Trust boundaries

- MeetBook and MySocial must use different Firebase projects, Authentication tenants, Firestore databases, Storage buckets, administrator records, and credentials.
- Firebase web configuration is public client configuration; Firestore rules and trusted server authorization provide access control.
- Service-account credentials are private and belong only in MeetBook GitHub Actions Secrets when a reviewed workflow requires them.
- No AI bot workflow may run in this project during this stage.

## Required owner actions

- Create a new MeetBook Firebase project.
- Review and publish MeetBook rules/indexes.
- Configure a MeetBook Super Admin identity.
- Add only MeetBook-specific secrets.
- Review GitHub Pages and backup settings before production use.

## Known inherited risks requiring review

- Private one-to-one chat creation and every normal private-message write are checked against the recipient's `settings.allowMessages` preference in Firestore rules. A friends-only recipient requires an existing friendship.
- Some moderation and maintenance behavior is enforced in the client UI.
- `profileVisibility` only hides posts on the profile page through the app interface. It is not a database-level privacy boundary; profile documents remain readable to signed-in users and public posts remain public. Do not put sensitive information in profile fields.
- Current messaging is not end-to-end encrypted.
- Backup excludes Firebase Authentication credentials and may omit large embedded images.

The private-message rules have passed the local matrix and real Firestore Emulator tests. Owner review and publishing to the separate MeetBook Firebase project are still required. Hidden-post and maintenance behavior remain UI-level limitations, and messaging is not end-to-end encrypted.

## Incident hygiene

If a service-account key is exposed, revoke it in Google Cloud IAM, replace the GitHub Secret, and review relevant workflow logs. Never paste secrets into issues or commit history.

## Image upload boundary

- Browser uploads go only to the MeetBook Cloudflare Worker, not directly to Cloudinary.
- The Worker validates a Firebase ID token, checks JPEG file bytes and a 1 MB maximum, and signs Cloudinary requests server-side.
- Cloudinary API secrets belong only in Worker Secret settings. Never commit them.
- CORS is restricted to the configured MeetBook Pages origin. CORS is not an authentication mechanism; Firebase token verification is also required.
- Review Cloudflare account-level abuse controls and usage limits before production. The Worker is not deployed by this repository change.
