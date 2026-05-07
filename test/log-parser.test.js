import assert from 'node:assert/strict';
import { parseLogLine, parseAccessLog, parseLogDate, matchBot, summariseBotCrawls } from '../lib/report/log-parser.js';

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (err) { failed++; console.log(`  ✗ ${name}\n    ${err.message}`); }
}

const SAMPLE_COMBINED = `192.0.2.1 - - [21/Apr/2026:08:00:00 +0000] "GET / HTTP/1.1" 200 1234 "-" "GPTBot/1.0"`;
const SAMPLE_CLF      = `192.0.2.1 - - [21/Apr/2026:08:00:00 +0000] "GET / HTTP/1.1" 200 1234`;

console.log('\nparseLogLine');

test('parses Combined Log Format', () => {
  const e = parseLogLine(SAMPLE_COMBINED);
  assert.ok(e);
  assert.equal(e.method, 'GET');
  assert.equal(e.path, '/');
  assert.equal(e.status, 200);
  assert.equal(e.userAgent, 'GPTBot/1.0');
  assert.equal(e.date, '2026-04-21');
});

test('parses CLF (no UA)', () => {
  const e = parseLogLine(SAMPLE_CLF);
  assert.ok(e);
  assert.equal(e.userAgent, '');
  assert.equal(e.status, 200);
});

test('returns null on garbage line', () => {
  assert.equal(parseLogLine('not a log entry at all'), null);
  assert.equal(parseLogLine(''), null);
  assert.equal(parseLogLine(null), null);
});

console.log('\nparseLogDate');

test('formats correctly', () => {
  assert.equal(parseLogDate('21/Apr/2026:08:00:00 +0000'), '2026-04-21');
  assert.equal(parseLogDate('5/Jan/2026:08:00:00 +0000'),  '2026-01-05');
});

test('returns null on bad input', () => {
  assert.equal(parseLogDate(''), null);
  assert.equal(parseLogDate('garbage'), null);
});

console.log('\nparseAccessLog');

test('parses multi-line log', () => {
  const text = `${SAMPLE_COMBINED}\n${SAMPLE_COMBINED}\nbad line\n${SAMPLE_CLF}`;
  const out = parseAccessLog(text);
  assert.equal(out.length, 3);
});

console.log('\nmatchBot');

test('matches GPTBot UA', () => {
  const bot = matchBot('Mozilla/5.0 (compatible; GPTBot/1.0; +https://openai.com/gptbot)');
  assert.ok(bot);
  assert.equal(bot.name, 'GPTBot');
});

test('matches case-insensitively', () => {
  assert.ok(matchBot('Mozilla/5.0 (compatible; gptbot/1.0)'));
});

test('returns null on non-bot UA', () => {
  assert.equal(matchBot('Mozilla/5.0 (X11; Linux x86_64) Firefox/127'), null);
  assert.equal(matchBot(''), null);
  assert.equal(matchBot(null), null);
});

console.log('\nsummariseBotCrawls');

test('aggregates per-bot stats', () => {
  const entries = [
    { userAgent: 'GPTBot/1.0', date: '2026-04-21', path: '/' },
    { userAgent: 'GPTBot/1.0', date: '2026-04-22', path: '/blog' },
    { userAgent: 'ClaudeBot/1.0', date: '2026-04-21', path: '/' },
    { userAgent: 'Mozilla/5.0', date: '2026-04-21', path: '/' }, // not a bot
  ];
  const stats = summariseBotCrawls(entries);
  assert.equal(stats.totalBotHits, 3);
  assert.equal(stats.byBot.GPTBot.hits, 2);
  assert.equal(stats.byBot.GPTBot.firstSeen, '2026-04-21');
  assert.equal(stats.byBot.GPTBot.lastSeen, '2026-04-22');
  assert.equal(stats.byBot.ClaudeBot.hits, 1);
});

test('empty input → zero stats', () => {
  const s = summariseBotCrawls([]);
  assert.equal(s.totalBotHits, 0);
  assert.deepEqual(s.byBot, {});
});

test('top paths surfaced', () => {
  const entries = [
    { userAgent: 'GPTBot', date: '2026-04-21', path: '/' },
    { userAgent: 'GPTBot', date: '2026-04-21', path: '/' },
    { userAgent: 'GPTBot', date: '2026-04-21', path: '/blog' },
  ];
  const s = summariseBotCrawls(entries);
  assert.ok(Array.isArray(s.byBot.GPTBot.paths));
  assert.equal(s.byBot.GPTBot.paths[0].path, '/');
  assert.equal(s.byBot.GPTBot.paths[0].hits, 2);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
