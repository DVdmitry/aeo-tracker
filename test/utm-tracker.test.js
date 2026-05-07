import assert from 'node:assert/strict';
import { extractUtmParams, aggregateUtmCitations } from '../lib/report/utm-tracker.js';

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (err) { failed++; console.log(`  ✗ ${name}\n    ${err.message}`); }
}

console.log('\nextractUtmParams');

test('extracts all 5 standard UTMs', () => {
  const u = extractUtmParams('https://acme.com/p?utm_source=ai&utm_medium=chatgpt&utm_campaign=q4&utm_term=crm&utm_content=hero');
  assert.equal(u.utm_source, 'ai');
  assert.equal(u.utm_medium, 'chatgpt');
  assert.equal(u.utm_campaign, 'q4');
  assert.equal(u.utm_term, 'crm');
  assert.equal(u.utm_content, 'hero');
});

test('extracts host without www', () => {
  const u = extractUtmParams('https://www.acme.com/p?utm_source=ai');
  assert.equal(u.host, 'acme.com');
});

test('returns null when no UTM params present', () => {
  assert.equal(extractUtmParams('https://acme.com/page'), null);
  assert.equal(extractUtmParams('https://acme.com/page?ref=x'), null);
});

test('returns null on malformed URL', () => {
  assert.equal(extractUtmParams('not a url'), null);
  assert.equal(extractUtmParams(''), null);
  assert.equal(extractUtmParams(null), null);
});

console.log('\naggregateUtmCitations');

test('aggregates by source and campaign', () => {
  const out = aggregateUtmCitations([
    { provider: 'openai', query: 'Q1', canonicalCitations: [
      'https://acme.com/x?utm_source=ai&utm_campaign=q4',
      'https://acme.com/y?utm_source=ai&utm_campaign=q4',
      'https://acme.com/z?utm_source=ai&utm_campaign=brand',
    ]},
  ], 'acme.com');
  assert.equal(out.totalUtmCitations, 3);
  assert.equal(out.bySource[0].source, 'ai');
  assert.equal(out.bySource[0].count, 3);
  assert.equal(out.byCampaign[0].campaign, 'q4');
  assert.equal(out.byCampaign[0].count, 2);
});

test('ignores citations on third-party domains', () => {
  const out = aggregateUtmCitations([
    { provider: 'openai', canonicalCitations: [
      'https://other.com/x?utm_source=ai',
      'https://acme.com/y?utm_source=ai',
    ]},
  ], 'acme.com');
  assert.equal(out.totalUtmCitations, 1);
});

test('groups by engine with campaign list', () => {
  const out = aggregateUtmCitations([
    { provider: 'openai', canonicalCitations: ['https://acme.com/x?utm_source=ai&utm_campaign=q4'] },
    { provider: 'gemini', canonicalCitations: ['https://acme.com/y?utm_source=ai&utm_campaign=brand'] },
  ], 'acme.com');
  assert.equal(out.byEngine.length, 2);
});

test('empty input → zero', () => {
  const out = aggregateUtmCitations([], 'acme.com');
  assert.equal(out.totalUtmCitations, 0);
});

test('caps samples to 8', () => {
  const cells = Array.from({ length: 20 }, (_, i) => ({
    provider: 'openai', query: `Q${i}`,
    canonicalCitations: [`https://acme.com/${i}?utm_source=ai&utm_campaign=c${i}`],
  }));
  const out = aggregateUtmCitations(cells, 'acme.com');
  assert.equal(out.samples.length, 8);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
