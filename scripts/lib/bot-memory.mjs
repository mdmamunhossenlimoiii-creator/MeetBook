// Privacy-bounded helpers for per-user, per-bot long-term memory.
export const BOT_MEMORY_MAX_CHARS = 1200;
export const BOT_MEMORY_MAX_MESSAGES = 6;

// Conservative filter: do not send messages containing obvious sensitive categories
// to the optional long-term memory summarizer. This is a heuristic, not a substitute
// for the user's choice to avoid sharing sensitive data with an AI service.
const SENSITIVE_MEMORY_TEXT = /\b(?:password|passcode|otp|one[- ]time(?: password| code)?|verification code|security code|recovery code|pin code|api key|access token|secret key|credit card|debit card|card number|cvv|cvc|bank account|account number|routing number|iban|swift code|bank balance|salary|income|transaction|passport number|national id|nid|social security number|ssn|tax id|driver'?s license|date of birth|birth date|dob|home address|street address|exact address|house number|apartment number|postcode|postal code|zip code|gps coordinates|latitude|longitude|coordinates|medical history|diagnosis|disease|medication|medicine|symptom|doctor|hospital|therapy|depression|anxiety|diabetes|blood pressure|pregnan(?:t|cy)|allerg(?:y|ies)|disability|mental health|politic(?:al|s)?|election|party membership|religion|religious|sexual orientation|sexuality|gender identity|transgender|nonbinary|gay|lesbian|bisexual|sex life|ethnicity|race|caste)\b|পাসওয়ার্ড|পাসওয়ার্ড|ওটিপি|ভেরিফিকেশন কোড|যাচাইকরণ কোড|পিন কোড|ব্যাংক|ব্যাংক হিসাব|কার্ড নম্বর|অ্যাকাউন্ট নম্বর|হিসাব নম্বর|ব্যালেন্স|বেতন|আয়|আয়|পাসপোর্ট|জাতীয় পরিচয়পত্র|জাতীয় পরিচয়পত্র|জন্মতারিখ|ঠিকানা|বাড়ির ঠিকানা|বাড়ির ঠিকানা|জিপিএস|অক্ষাংশ|দ্রাঘিমাংশ|রোগ|ওষুধ|চিকিৎসা|ডাক্তার|হাসপাতাল|ডায়াবেটিস|ডায়াবেটিস|রক্তচাপ|গর্ভবতী|মানসিক স্বাস্থ্য|ধর্ম|ধর্মীয়|ধর্মীয়|রাজনীতি|রাজনৈতিক|নির্বাচন|যৌনতা|যৌন পরিচয়|যৌন পরিচয়|লিঙ্গ পরিচয়|লিঙ্গ পরিচয়|জাতিগত|বর্ণ/i;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN = /(?:\+\s*)?\d[\d\s().-]{7,}\d/g;
const stripControls = (value) => value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
const redactContactDetails = (value) => value.replace(EMAIL_PATTERN, '[redacted]').replace(PHONE_PATTERN, '[redacted]');

export function botMemoryDocId(botId, uid) {
  if (!/^bot_\d{2}$/.test(String(botId)) || !/^[A-Za-z0-9_-]{1,128}$/.test(String(uid))) {
    throw new TypeError('Invalid bot memory identity.');
  }
  return String(botId) + '_' + String(uid);
}

export function sanitizeBotMemory(value) {
  if (typeof value !== 'string') return '';
  const clean = stripControls(value);
  if (SENSITIVE_MEMORY_TEXT.test(clean)) return '';
  return redactContactDetails(clean).trim().slice(0, BOT_MEMORY_MAX_CHARS);
}

export function memoryMessages(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter((m) => !/^bot_\d{2}$/.test(String(m?.uid || '')))
    .slice(-BOT_MEMORY_MAX_MESSAGES)
    .map((m) => {
      const text = typeof m?.text === 'string' ? stripControls(m.text).slice(0, 500) : '';
      if (!text || SENSITIVE_MEMORY_TEXT.test(text)) return null;
      return { speaker: 'User', text: redactContactDetails(text) };
    }).filter((m) => m && m.text);
}
