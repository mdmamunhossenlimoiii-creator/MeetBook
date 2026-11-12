# MeetBook Feature Status

This document records source-level presence, not a claim that the app is production-connected or fully verified.

| Area | Source status | Verification status |
|---|---|---|
| Registration and login | Existing modules present | Requires MeetBook Firebase configuration and testing |
| Profiles | Existing modules present | Not re-verified in this change |
| Feed and posts | Existing modules present | Not re-verified in this change |
| Comments and reactions | Existing modules/rules present | Not re-verified in this change |
| Friends and following | Existing modules present | Not re-verified in this change |
| Messaging | Existing modules present | Privacy limitations require review |
| Groups | Existing modules present | Not re-verified in this change |
| Stories and reels | Existing modules present | Not re-verified in this change |
| Notifications | Existing modules present | Not re-verified in this change |
| Admin dashboard and moderation | Existing modules/rules present | Super Admin must be initialized in MeetBook Firebase |
| Bot-related source | Retained, isolated | Bot workflows disabled; no bot work performed |
| Backup scripts | MeetBook naming and project guard prepared | No production backup executed |
| Account deletion job | Script now requires the expected MeetBook project ID; workflow disabled | No production deletion executed |
| GitHub Pages metadata | MeetBook URL configured | Deployment not verified |

Update this matrix only after running the relevant tests and recording evidence.
