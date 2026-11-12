# MeetBook Feature Status

This document records source-level presence, not a claim that the app is production-connected or fully verified. The current security review identifies privacy enforcement gaps that must be resolved before public production launch.

| Area | Source status | Verification status |
|---|---|---|
| Registration and login | Existing modules present | Requires MeetBook Firebase configuration and testing |
| Profiles | Existing modules present | Profile-page visibility is an app-level display filter; profile documents remain readable to signed-in users. Do not put sensitive details in public profile fields. |
| Feed and posts | Existing modules present | Not re-verified in this change |
| Comments and reactions | Existing modules/rules present | Not re-verified in this change |
| Friends and following | Existing modules present | Not re-verified in this change |
| Messaging | Existing modules present; private-chat creation and message writes now check recipient `allowMessages` preference in Firestore rules | Real Firestore Emulator: 1,872 cases, 0 mismatches; existing chats are checked on each message write |
| Groups | Existing modules present | Not re-verified in this change |
| Stories and reels | Existing modules present; video file uploads disabled, links only | Requires owner-side image Worker setup and app testing |\n| Image uploads | Signed Cloudinary Worker source and client integration added | Worker not deployed; owner must add credentials and endpoint; real uploads not tested |
| Notifications | Existing modules present | Not re-verified in this change |
| Admin dashboard and moderation | Existing modules/rules present | Super Admin must be initialized in MeetBook Firebase |
| Bot-related source | Retained, isolated | Bot workflows archived outside `.github/workflows/`; no bot work performed |
| Backup scripts | MeetBook naming and project guard prepared | No production backup executed |
| Account deletion job | Script now requires the expected MeetBook project ID; workflow disabled | No production deletion executed |
| GitHub Pages metadata | MeetBook URL configured | Deployment not verified |

Update this matrix only after running the relevant tests and recording evidence.
