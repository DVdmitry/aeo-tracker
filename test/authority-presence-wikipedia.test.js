/**
 * Bug 2 regression — when Wikipedia REST API returns 404, the "Create one"
 * link in the HTML report must point at the article-editor URL, not the
 * /wiki/<slug> path (which itself 404s and dead-ends the user).
 *
 * Source of fix: lib/report/authority-presence.js — `checkWikipedia` builds
 * queryUrl from the create-flow URL pattern. Renderer in sections.js:2135
 * passes queryUrl through unchanged.
 */

import assert from 'node:assert/strict';
import { checkWikipedia } from '../lib/report/authority-presence.js';

let passed = 0;
let failed = 0;
function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch(err => { failed++; console.log(`  ✗ ${name}\n    ${err.message}`); });
}

console.log('\nBug 2 — Wikipedia 404 → create-flow queryUrl');

await test('queryUrl points at edit action, not /wiki/<slug>', async () => {
  const stubFetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
  const r = await checkWikipedia('Typelessform', { fetchImpl: stubFetch });
  assert.equal(r.found, false);
  assert.equal(r.status, 404);
  assert.ok(r.queryUrl, 'queryUrl must be set on 404');
  assert.ok(r.queryUrl.includes('action=edit'), `queryUrl must include action=edit, got: ${r.queryUrl}`);
  assert.ok(r.queryUrl.includes('index.php'), `queryUrl must use index.php (edit endpoint), got: ${r.queryUrl}`);
  assert.ok(r.queryUrl.includes('title=Typelessform'), `queryUrl must include the brand slug as title, got: ${r.queryUrl}`);
  assert.ok(!r.queryUrl.match(/\/wiki\/[^?]+$/), `queryUrl must NOT be the bare /wiki/<slug> pattern, got: ${r.queryUrl}`);
});

await test('multi-word brand → underscore in slug, edit URL', async () => {
  const stubFetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
  const r = await checkWikipedia('Acme Co', { fetchImpl: stubFetch });
  assert.equal(r.found, false);
  assert.ok(r.queryUrl.includes('action=edit'));
  assert.ok(r.queryUrl.includes('Acme_Co') || r.queryUrl.includes('Acme%20Co'), `expect slug for "Acme Co", got: ${r.queryUrl}`);
});

await test('found article → no queryUrl swap, pageUrl wins', async () => {
  const stubFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      title: 'OpenAI',
      type: 'standard',
      extract: 'OpenAI is an AI lab.',
      content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/OpenAI' } },
    }),
  });
  const r = await checkWikipedia('OpenAI', { fetchImpl: stubFetch });
  assert.equal(r.found, true);
  assert.equal(r.pageUrl, 'https://en.wikipedia.org/wiki/OpenAI');
  // queryUrl is only set on the 404 path; for found articles renderer uses pageUrl.
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
