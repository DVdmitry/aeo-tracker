/**
 * Apache/nginx access-log parser, scoped to AI-bot crawl-frequency analysis.
 *
 * Supports both formats out of the box:
 *   - Common Log Format (CLF):       `host - - [date] "method path proto" status bytes`
 *   - Combined Log Format (default): CLF + ` "referer" "user-agent"`
 *
 * Pure parsing — caller is responsible for I/O. Lines that don't match either
 * pattern are silently skipped (logs often contain debug noise, partial
 * lines from rotated files, or non-HTTP entries).
 */

import { AI_BOTS } from './crawlability-audit.js';

// Combined Log Format with quoted user-agent at the end.
//   IP - - [21/Apr/2026:08:00:00 +0000] "GET /path HTTP/1.1" 200 1234 "ref" "UA"
const COMBINED_RE = /^(\S+) \S+ \S+ \[([^\]]+)\] "(\S+) ([^"]*?) ([^"]+)" (\d{3}) (\S+) "([^"]*)" "([^"]*)"/;
// CLF without referer/UA — final two quoted strings missing.
const CLF_RE = /^(\S+) \S+ \S+ \[([^\]]+)\] "(\S+) ([^"]*?) ([^"]+)" (\d{3}) (\S+)\s*$/;

/**
 * Parse a single log line. Returns null on no match.
 */
export function parseLogLine(line) {
  if (!line || typeof line !== 'string') return null;
  const trimmed = line.trim();
  if (!trimmed) return null;

  const m = trimmed.match(COMBINED_RE);
  if (m) {
    return {
      ip: m[1],
      timestamp: m[2],
      method: m[3],
      path: m[4],
      status: parseInt(m[6], 10),
      userAgent: m[9],
      date: parseLogDate(m[2]),
    };
  }
  const c = trimmed.match(CLF_RE);
  if (c) {
    return {
      ip: c[1],
      timestamp: c[2],
      method: c[3],
      path: c[4],
      status: parseInt(c[6], 10),
      userAgent: '',
      date: parseLogDate(c[2]),
    };
  }
  return null;
}

/**
 * Convert "21/Apr/2026:08:00:00 +0000" to "2026-04-21". Returns null on parse fail.
 */
export function parseLogDate(s) {
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\w{3})\/(\d{4})/);
  if (!m) return null;
  const months = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
  const month = months[m[2].toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${month}-${m[1].padStart(2, '0')}`;
}

/**
 * Parse a whole log file's worth of text. Splits on newlines, returns the
 * array of successfully-parsed entries.
 */
export function parseAccessLog(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .split(/\r?\n/)
    .map(parseLogLine)
    .filter(Boolean);
}

/**
 * Match a User-Agent string against the AI_BOTS catalogue. Case-insensitive
 * substring match; returns the bot definition or null.
 */
export function matchBot(userAgent) {
  if (!userAgent || typeof userAgent !== 'string') return null;
  const ua = userAgent.toLowerCase();
  for (const bot of AI_BOTS) {
    if (ua.includes(bot.name.toLowerCase())) return bot;
  }
  return null;
}

/**
 * Aggregate parsed entries into per-bot stats.
 *
 * Returns:
 *   {
 *     totalEntries,
 *     totalBotHits,
 *     byBot: {
 *       [botName]: { hits, firstSeen, lastSeen, sample, paths: [{path, hits}] }
 *     }
 *   }
 */
export function summariseBotCrawls(entries) {
  const byBot = {};
  let totalBotHits = 0;
  for (const entry of entries || []) {
    const bot = matchBot(entry.userAgent);
    if (!bot) continue;
    totalBotHits++;
    if (!byBot[bot.name]) {
      byBot[bot.name] = {
        provider: bot.provider,
        hits: 0,
        firstSeen: entry.date || null,
        lastSeen: entry.date || null,
        sample: entry.userAgent,
        paths: new Map(),
      };
    }
    const slot = byBot[bot.name];
    slot.hits++;
    if (entry.date) {
      if (!slot.firstSeen || entry.date < slot.firstSeen) slot.firstSeen = entry.date;
      if (!slot.lastSeen  || entry.date > slot.lastSeen)  slot.lastSeen  = entry.date;
    }
    if (entry.path) {
      slot.paths.set(entry.path, (slot.paths.get(entry.path) || 0) + 1);
    }
  }

  // Convert path Maps → top-5 arrays for serialisable output
  for (const [name, info] of Object.entries(byBot)) {
    const sorted = Array.from(info.paths.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([path, hits]) => ({ path, hits }));
    info.paths = sorted;
    byBot[name] = info;
  }

  return {
    totalEntries: (entries || []).length,
    totalBotHits,
    byBot,
  };
}
