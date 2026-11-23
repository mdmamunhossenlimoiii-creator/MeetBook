# Gemini API-only smoke test

This script sends three short, generic test prompts directly through the existing server-side Gemini adapter for:
- `bot_01` — TechTip Nova
- `bot_02` — Pixel Pal
- `bot_03` — Chef Byte

It does **not** initialize Firebase, sign in as a Runner, read or write Firestore, publish posts, send chat messages, or activate bots. It makes up to three Gemini API requests and may consume API quota or incur charges depending on the Google AI project plan.

## Run in a trusted Node.js environment

Use Node.js 20 or newer. Provide `GEMINI_API_KEY` as a protected environment secret (do not paste it into chat, source files, shell command history, or logs). Optionally set `GEMINI_MODEL`; otherwise the adapter default is used.

From the repository root:

```sh
node scripts/gemini-api-smoke-test.mjs
```

The script prints only each bot's short response sample and a PASS/FAIL result. It never prints the API key. A FAIL means the adapter returned its configured fallback, which can indicate a missing/invalid key, unavailable model/API, quota/rate limit, or malformed response.

## Safety boundary

This is an API-only test. Do not add Firebase Runner credentials, enable `settings/global.botsEnabled`, enable a bot Runner workflow, or change production configuration for this test. Do not merge or deploy this branch as part of the smoke test.

## Existing automated tests

Run the repository's existing tests separately with `npm test`. Those tests use mocked fetch responses; they do not prove that a real Gemini API request succeeds.
