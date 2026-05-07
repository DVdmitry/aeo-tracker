// Tests for the AI-bot crawlability auditor. Pure parsing + bot-access logic
// is unit-tested directly. Network fetches are stubbed via fetchImpl injection.

import assert from 'node:assert/strict';
import {
  parseRobotsTxt,
  checkBotAccess,
  auditCrawlability,
  AI_BOTS,
} from '../lib/report/crawlability-audit.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch(err => { failed++; console.log(`  ✗ ${name}\n    ${err.message}`); });
}

console.log('\nparseRobotsTxt');

await test('parses simple single-block robots.txt', () => {
  const { groups } = parseRobotsTxt(`User-agent: *\nDisallow: /private\nAllow: /`);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].userAgents, ['*']);
  assert.deepEqual(groups[0].disallow, ['/private']);
  assert.deepEqual(groups[0].allow, ['/']);
});

await test('groups multiple consecutive User-agent lines', () => {
  const { groups } = parseRobotsTxt(`User-agent: GPTBot\nUser-agent: ClaudeBot\nDisallow: /\n\nUser-agent: *\nAllow: /`);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].userAgents, ['GPTBot', 'ClaudeBot']);
  assert.deepEqual(groups[0].disallow, ['/']);
});

await test('strips comments', () => {
  const { groups } = parseRobotsTxt(`# header\nUser-agent: GPTBot # the openai bot\nDisallow: / # block all`);
  assert.equal(groups[0].userAgents[0], 'GPTBot');
  assert.equal(groups[0].disallow[0], '/');
});

await test('captures Sitemap directives separately', () => {
  const { sitemaps } = parseRobotsTxt(`Sitemap: https://example.com/sitemap.xml\nUser-agent: *\nAllow: /`);
  assert.deepEqual(sitemaps, ['https://example.com/sitemap.xml']);
});

await test('returns empty on null/empty input', () => {
  assert.deepEqual(parseRobotsTxt(null), { groups: [], sitemaps: [] });
  assert.deepEqual(parseRobotsTxt(''), { groups: [], sitemaps: [] });
});

console.log('\ncheckBotAccess');

await test('explicit Disallow: / for matching UA → blocked', () => {
  const parsed = parseRobotsTxt(`User-agent: GPTBot\nDisallow: /`);
  assert.equal(checkBotAccess(parsed, 'GPTBot'), 'blocked');
});

await test('explicit empty Disallow → allowed', () => {
  const parsed = parseRobotsTxt(`User-agent: GPTBot\nDisallow:`);
  assert.equal(checkBotAccess(parsed, 'GPTBot'), 'allowed');
});

await test('disallow specific path → partial', () => {
  const parsed = parseRobotsTxt(`User-agent: GPTBot\nDisallow: /admin`);
  assert.equal(checkBotAccess(parsed, 'GPTBot'), 'partial');
});

await test('falls back to wildcard * when bot-specific block missing', () => {
  const parsed = parseRobotsTxt(`User-agent: *\nDisallow: /`);
  assert.equal(checkBotAccess(parsed, 'ClaudeBot'), 'blocked');
});

await test('no robots.txt at all → unspecified', () => {
  assert.equal(checkBotAccess({ groups: [], sitemaps: [] }, 'GPTBot'), 'unspecified');
});

await test('case-insensitive UA match', () => {
  const parsed = parseRobotsTxt(`User-agent: gptbot\nDisallow: /`);
  assert.equal(checkBotAccess(parsed, 'GPTBot'), 'blocked');
});

console.log('\nauditCrawlability (with stub fetch)');

await test('happy path with all 3 files present', async () => {
  const stubFetch = async (url) => {
    if (url.endsWith('/robots.txt')) {
      return { ok: true, status: 200, text: async () => `User-agent: *\nAllow: /\nSitemap: https://x.com/sitemap.xml` };
    }
    if (url.endsWith('/llms.txt')) {
      return { ok: true, status: 200, text: async () => '# LLMs.txt\nKey product info' };
    }
    if (url.endsWith('/sitemap.xml')) {
      return { ok: true, status: 200, text: async () => '<urlset><url><loc>a</loc></url><url><loc>b</loc></url></urlset>' };
    }
    return { ok: false, status: 404, text: async () => '' };
  };
  const r = await auditCrawlability('example.com', { fetchImpl: stubFetch });
  assert.equal(r.summary.hasRobots, true);
  assert.equal(r.summary.hasLlmsTxt, true);
  assert.equal(r.summary.hasSitemap, true);
  assert.equal(r.sitemap.urlCount, 2);
  assert.equal(r.botAccess.length, AI_BOTS.length);
});

await test('blocks counted correctly', async () => {
  const stubFetch = async (url) => {
    if (url.endsWith('/robots.txt')) {
      return { ok: true, status: 200, text: async () => `User-agent: GPTBot\nDisallow: /\n\nUser-agent: ClaudeBot\nDisallow: /\n\nUser-agent: *\nAllow: /` };
    }
    return { ok: false, status: 404, text: async () => '' };
  };
  const r = await auditCrawlability('example.com', { fetchImpl: stubFetch });
  assert.ok(r.summary.blockedCount >= 2);
  const blocked = r.botAccess.filter(b => b.access === 'blocked').map(b => b.name);
  assert.ok(blocked.includes('GPTBot'));
  assert.ok(blocked.includes('ClaudeBot'));
});

await test('robots.txt 404 → all bots unspecified', async () => {
  const stubFetch = async () => ({ ok: false, status: 404, text: async () => '' });
  const r = await auditCrawlability('example.com', { fetchImpl: stubFetch });
  assert.equal(r.summary.hasRobots, false);
  assert.equal(r.summary.unspecifiedCount, AI_BOTS.length);
});

await test('strips https:// prefix from domain input', async () => {
  let calledUrl = null;
  const stubFetch = async (url) => { calledUrl = url; return { ok: false, status: 404, text: async () => '' }; };
  await auditCrawlability('https://example.com/', { fetchImpl: stubFetch });
  assert.ok(calledUrl.startsWith('https://example.com/'));
  assert.ok(!calledUrl.startsWith('https://https://'));
});

await test('throws on missing domain', async () => {
  await assert.rejects(() => auditCrawlability(''), /domain required/);
  await assert.rejects(() => auditCrawlability(null), /domain required/);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
