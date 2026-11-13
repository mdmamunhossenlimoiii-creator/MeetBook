// Privacy-bounded helpers for per-user, per-bot long-term memory.
export const BOT_MEMORY_MAX_CHARS = 1200;
export const BOT_MEMORY_MAX_MESSAGES = 6;

export function botMemoryDocId(botId, uid) {
  if (!/^bot_\d{2}$/.test(String(botId)) || !/^[A-Za-z0-9_-]{1,128}$/.test(String(uid))) {
    throw new TypeError('Invalid bot memory identity.');
  }
  return `${botId}_${uid}`;
}

export function sanitizeBotMemory(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim().slice(0, BOT_MEMORY_MAX_CHARS);
}

export function memoryMessages(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter((m) => !/^bot_\d{2}$/.test(String(m?.uid || '')))
    .slice(-BOT_MEMORY_MAX_MESSAGES)
    .map((m) => ({
      speaker: 'User',
      text: typeof m?.text === 'string' ? m.text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, 500) : ''
    })).filter((m) => m.text);
}
