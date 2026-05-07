import assert from 'node:assert/strict';
import { detectAdsInResponse, summariseAdsAcrossResults } from '../lib/report/ads-detector.js';

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (err) { failed++; console.log(`  ✗ ${name}\n    ${err.message}`); }
}

console.log('\ndetectAdsInResponse — text markers');

test('catches "sponsored content" inline', () => {
  const r = detectAdsInResponse('Here is some sponsored content from Acme.', []);
  assert.equal(r.adMarkers.length, 1);
  assert.equal(r.hasAdSignal, true);
});

test('catches "[paid]" tag', () => {
  const r = detectAdsInResponse('[paid] Acme is a great option.', []);
  assert.equal(r.adMarkers.length, 1);
});

test('catches "(advertisement)"', () => {
  const r = detectAdsInResponse('(advertisement) Try Acme today.', []);
  assert.equal(r.adMarkers.length, 1);
});

test('catches "promoted by"', () => {
  const r = detectAdsInResponse('This list is promoted by Acme.', []);
  assert.equal(r.adMarkers.length, 1);
});

test('does NOT false-positive on natural prose', () => {
  const r = detectAdsInResponse('We sponsor open-source projects to give back.', []);
  // "sponsor" alone (without "sponsored content/by/post/placement") should not match
  assert.equal(r.adMarkers.length, 0);
  assert.equal(r.hasAdSignal, false);
});

test('catches multiple markers in one response', () => {
  const r = detectAdsInResponse('Sponsored post about X. Also [paid] mention.', []);
  assert.ok(r.adMarkers.length >= 2);
});

console.log('\ndetectAdsInResponse — ad-network citations');

test('catches doubleclick.net', () => {
  const r = detectAdsInResponse('text', ['https://googleads.g.doubleclick.net/path']);
  assert.equal(r.adNetworkCitations.length, 1);
});

test('catches taboola, outbrain', () => {
  const r = detectAdsInResponse('text', ['https://trc.taboola.com/x', 'https://www.outbrain.com/y']);
  assert.equal(r.adNetworkCitations.length, 2);
});

test('ignores non-ad citations', () => {
  const r = detectAdsInResponse('text', ['https://g2.com/x', 'https://reddit.com/y']);
  assert.equal(r.adNetworkCitations.length, 0);
});

console.log('\nsummariseAdsAcrossResults');

test('aggregates per-provider', () => {
  const out = summariseAdsAcrossResults([
    { provider: 'openai', query: 'Q1', adMarkers: [{ kind: 'sponsored-content', snippet: 'x' }] },
    { provider: 'openai', query: 'Q2', adNetworkCitations: [{ url: 'x', host: 'doubleclick.net' }] },
    { provider: 'gemini', query: 'Q1' },
  ]);
  assert.equal(out.totalCellsScanned, 3);
  assert.equal(out.totalCellsWithAdSignal, 2);
  assert.equal(out.byProvider.openai, 2);
});

test('caps samples to 5', () => {
  const results = Array.from({ length: 20 }, (_, i) => ({
    provider: 'openai', query: `Q${i}`,
    adMarkers: [{ kind: 'sponsored-content', snippet: `sample ${i}` }],
  }));
  const out = summariseAdsAcrossResults(results);
  assert.equal(out.samples.length, 5);
});

test('empty input → zero counts', () => {
  const out = summariseAdsAcrossResults([]);
  assert.equal(out.totalCellsScanned, 0);
  assert.equal(out.totalCellsWithAdSignal, 0);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
