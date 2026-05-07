import assert from 'node:assert/strict';
import { checkWikipedia, checkReddit, checkAuthorityPresence } from '../lib/report/authority-presence.js';

let passed = 0;
let failed = 0;
function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch(err => { failed++; console.log(`  ✗ ${name}\n    ${err.message}`); });
}

console.log('\ncheckWikipedia (with stub fetch)');

await test('happy path — article exists', async () => {
  const stubFetch = async (url) => ({
    ok: true,
    status: 200,
    json: async () => ({
      title: 'OpenAI',
      type: 'standard',
      extract: 'OpenAI is an American AI company.',
      content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/OpenAI' } },
      timestamp: '2026-04-21T12:00:00Z',
    }),
  });
  const r = await checkWikipedia('OpenAI', { fetchImpl: stubFetch });
  assert.equal(r.found, true);
  assert.equal(r.title, 'OpenAI');
  assert.equal(r.isDisambiguation, false);
  assert.ok(r.extract.includes('OpenAI'));
});

await test('404 returned for unknown brand', async () => {
  const stubFetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
  const r = await checkWikipedia('Unknownxyzbrand', { fetchImpl: stubFetch });
  assert.equal(r.found, false);
  assert.equal(r.status, 404);
});

await test('disambiguation flagged', async () => {
  const stubFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ title: 'Acme', type: 'disambiguation', extract: 'Acme may refer to:' }),
  });
  const r = await checkWikipedia('Acme', { fetchImpl: stubFetch });
  assert.equal(r.found, true);
  assert.equal(r.isDisambiguation, true);
});

await test('throws → graceful error result', async () => {
  const stubFetch = async () => { throw new Error('network down'); };
  const r = await checkWikipedia('X', { fetchImpl: stubFetch });
  assert.equal(r.found, false);
  assert.ok(r.error.includes('network'));
});

await test('null brand → defensive empty', async () => {
  const r = await checkWikipedia(null);
  assert.equal(r.found, false);
});

console.log('\ncheckReddit (with stub fetch)');

await test('aggregates top subreddits', async () => {
  const stubFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      data: { children: [
        { data: { subreddit: 'CRMSoftware', title: 'Best CRM?' } },
        { data: { subreddit: 'CRMSoftware', title: 'Salesforce reviews' } },
        { data: { subreddit: 'Sales', title: 'Pipedrive vs Hubspot' } },
      ]},
    }),
  });
  const r = await checkReddit('Salesforce', { fetchImpl: stubFetch });
  assert.equal(r.found, true);
  assert.equal(r.mentionCount, 3);
  assert.equal(r.topSubs[0].name, 'CRMSoftware');
  assert.equal(r.topSubs[0].count, 2);
});

await test('zero matches → not found', async () => {
  const stubFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ data: { children: [] } }),
  });
  const r = await checkReddit('Unknown', { fetchImpl: stubFetch });
  assert.equal(r.found, false);
  assert.equal(r.mentionCount, 0);
});

await test('http 429 → graceful', async () => {
  const stubFetch = async () => ({ ok: false, status: 429, json: async () => ({}) });
  const r = await checkReddit('X', { fetchImpl: stubFetch });
  assert.equal(r.found, false);
  assert.equal(r.status, 429);
});

console.log('\ncheckAuthorityPresence (combined)');

await test('runs both in parallel and combines result', async () => {
  let calls = 0;
  const stubFetch = async (url) => {
    calls++;
    if (url.includes('wikipedia.org')) {
      return { ok: true, status: 200, json: async () => ({ title: 'X', type: 'standard', extract: '', content_urls: { desktop: { page: 'u' } } }) };
    }
    return { ok: true, status: 200, json: async () => ({ data: { children: [{ data: { subreddit: 's', title: 't' } }] } }) };
  };
  const r = await checkAuthorityPresence('TestBrand', { fetchImpl: stubFetch });
  assert.equal(r.brand, 'TestBrand');
  assert.equal(r.wikipedia.found, true);
  assert.equal(r.reddit.found, true);
  assert.equal(calls, 2);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
