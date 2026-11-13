# Gemini Smart AI setup for MeetBook

## What this change enables
- `bot_01` TechTip Nova, `bot_02` Pixel Pal and `bot_03` Chef Byte use Gemini for original posts, consent-based comments and replies to user-initiated bot chats.
- Bots `bot_04` and later keep their existing template-based behavior.
- Default model: `gemini-3.8-flash`. Override with `GEMINI_MODEL` only if Google changes model availability.
- If `GEMINI_API_KEY` is missing or the API is unavailable, the three bots safely fall back to their existing template responses.
- The API key is read only by the server-side GitHub Actions runner. It is never placed in frontend JavaScript or committed to Git.
- For private chat replies, Gemini may receive up to six recent messages from that same chat, plus a short per-user/per-bot memory summary only when the user explicitly opts in. Raw chat transcripts are not stored in long-term memory. The app must disclose this processing before users enable the feature.

## Required secret
Add `GEMINI_API_KEY` as an Environment secret in the protected GitHub Environment `meetbook-bot-live`. Do not put it in `js/firebase-config.js`, any browser file, an issue, a commit, or a chat message.

Optional repository Actions variable:
- `GEMINI_MODEL` = `gemini-3.8-flash` (the code already defaults to this).

## Important: the Gemini key alone does not activate the runner
The current MeetBook bot architecture intentionally requires its separate low-privilege Firebase runner identity and explicit Firestore allowlist. The manual workflows default to dry-run and have no schedule. Before a live action, the owner must configure:
- GitHub Actions secrets `BOT_RUNNER_EMAIL` and `BOT_RUNNER_PASSWORD` for a dedicated MeetBook-only Firebase Auth runner account.
- Firestore `botRunners/{runnerUid}` with `enabled: true` and `botIds: ["bot_01", "bot_02", "bot_03"]`.
- Firestore `settings/global.botsEnabled: true`.
- The three bot profile documents must exist and be active.
- GitHub Environment `meetbook-bot-live` must require owner review. Live dispatch additionally requires `confirm_live=true` and repository variable `BOT_LIVE_TEST_APPROVED=yes`.
- `BOT_RUNNER_EXPECTED_PROJECT_ID` must be set as an Environment variable to `meetbook-65d30`.
- The bot runner and chat workflows process only one selected bot/action per manual dispatch; the Chat workflow is limited to one user-initiated private chat reply.
- Creating the workflows does not create credentials, change production Firestore data, or start live bot activity.

## Privacy and safety
- The app discloses in the AI chat banner that messages are sent to Google Gemini.
- Google states that Free Tier prompts and responses may be used to improve Google products. Users should not send passwords, verification codes, financial details or sensitive personal information to these bots.
- Comments and reactions remain opt-in for human users; no unsolicited direct messages are generated.
- Keep the global bot kill switch and per-bot/user quotas enabled.


## Firebase project guard
The Bot Runner must receive `BOT_RUNNER_EXPECTED_PROJECT_ID` and it must exactly match the MeetBook frontend configuration (`meetbook-65d30`). Missing or mismatched values stop the runner before Firebase Authentication sign-in. MeetBook uses one Firebase project; automated tests use local mocks and the Firestore Emulator rather than writing test data to live user collections.
