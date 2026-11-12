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

- Profile visibility and messaging privacy may not be fully enforced in Firestore rules.
- Some moderation and maintenance behavior is enforced in the client UI.
- Existing public-facing profile data may be readable to signed-in users.
- Current messaging is not end-to-end encrypted.
- Backup excludes Firebase Authentication credentials and may omit large embedded images.

These are explicit limitations, not verified fixes. Do not describe the platform as production-secure until these areas have been reviewed and tested.

## Incident hygiene

If a service-account key is exposed, revoke it in Google Cloud IAM, replace the GitHub Secret, and review relevant workflow logs. Never paste secrets into issues or commit history.

## Image upload boundary

- Browser uploads go only to the MeetBook Cloudflare Worker, not directly to Cloudinary.
- The Worker validates a Firebase ID token, checks JPEG file bytes and a 1 MB maximum, and signs Cloudinary requests server-side.
- Cloudinary API secrets belong only in Worker Secret settings. Never commit them.
- CORS is restricted to the configured MeetBook Pages origin. CORS is not an authentication mechanism; Firebase token verification is also required.
- Review Cloudflare account-level abuse controls and usage limits before production. The Worker is not deployed by this repository change.
