import { DEFAULT_GEMINI_MODEL, generateSmartBotText } from './lib/gemini.mjs';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('FAIL: GEMINI_API_KEY is not available. No API request was made.');
  process.exit(1);
}

const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
const scenarios = [
  { id: 'bot_01', topic: 'TechTip Nova', prompt: 'Give one beginner-friendly tip for keeping a phone account secure.' },
  { id: 'bot_02', topic: 'Pixel Pal', prompt: 'Give one beginner-friendly photography tip for taking a clear outdoor photo.' },
  { id: 'bot_03', topic: 'Chef Byte', prompt: 'Give one simple kitchen hygiene tip for someone learning to cook.' }
];

let failures = 0;
console.log(`Gemini API smoke test; model=${model}; bots=${scenarios.length}`);

for (const scenario of scenarios) {
  const fallback = `__GEMINI_SMOKE_FALLBACK_${scenario.id}__`;
  const output = await generateSmartBotText({
    bot: { id: scenario.id },
    kind: 'chat',
    source: scenario.prompt,
    fallback
  });

  if (!output || output === fallback) {
    failures += 1;
    console.error(`FAIL ${scenario.topic}: adapter returned fallback (API unavailable, rejected, or response malformed).`);
    continue;
  }

  console.log(`PASS ${scenario.topic}: received ${output.length} characters.`);
  console.log(`  Sample: ${output.replace(/[\\r\\n]+/g, ' ').slice(0, 180)}`);
}

if (failures > 0) {
  console.error(`RESULT: FAIL (${failures}/${scenarios.length} bot checks did not receive Gemini output).`);
  process.exitCode = 1;
} else {
  console.log('RESULT: PASS (all three bots received non-fallback Gemini responses).');
}
