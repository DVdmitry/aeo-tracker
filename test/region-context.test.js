import assert from 'node:assert/strict';
import {
  extractTldCountry,
  aggregateTldDistribution,
  extractRegionSignals,
  aggregateRegionContext,
  checkRegionContext,
} from '../lib/report/region-context.js';

let passed = 0;
let failed = 0;
function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch(err => { failed++; console.log(`  ✗ ${name}\n    ${err.message}`); });
}

console.log('\nextractTldCountry');

await test('plain ccTLD', () => {
  assert.equal(extractTldCountry('https://example.de/page'), 'de');
  assert.equal(extractTldCountry('https://example.pl/'), 'pl');
});

await test('.co.uk → uk', () => {
  assert.equal(extractTldCountry('https://example.co.uk/'), 'uk');
});

await test('.com → null', () => {
  assert.equal(extractTldCountry('https://example.com/'), null);
});

await test('invalid URL → null', () => {
  assert.equal(extractTldCountry('not-a-url'), null);
});

console.log('\naggregateTldDistribution');

await test('counts per ccTLD + identifies topCountry/topRegion', () => {
  const r = aggregateTldDistribution([
    'https://a.de/', 'https://b.de/', 'https://c.de/',
    'https://d.fr/',
    'https://e.com/', // ignored — not ccTLD
  ]);
  assert.equal(r.total, 4);
  assert.equal(r.counts.de, 3);
  assert.equal(r.counts.fr, 1);
  assert.equal(r.topCountry, 'de');
  assert.equal(r.topRegion, 'EU');
});

await test('all .com → empty result', () => {
  const r = aggregateTldDistribution(['https://a.com/', 'https://b.com/']);
  assert.equal(r.total, 0);
  assert.equal(r.topCountry, null);
});

await test('handles empty input', () => {
  assert.equal(aggregateTldDistribution([]).total, 0);
  assert.equal(aggregateTldDistribution(null).total, 0);
});

console.log('\nextractRegionSignals — Gemini');

await test('Gemini gl param → high confidence region', () => {
  const cell = {
    provider: 'gemini',
    raw: {
      candidates: [{ groundingMetadata: {
        searchEntryPoint: { renderedContent: '<a href="https://google.com/search?q=x&hl=en&gl=de">x</a>' },
        webSearchQueries: ['best product germany'],
      } }],
    },
  };
  const r = extractRegionSignals(cell);
  assert.equal(r.detectedRegion, 'DE');
  assert.equal(r.confidence, 'high');
  assert.equal(r.source, 'gemini.searchEntryPoint.gl');
  assert.deepEqual(r.signals.webSearchQueries, ['best product germany']);
});

await test('Gemini hl-only → med confidence', () => {
  const cell = {
    provider: 'gemini',
    raw: { candidates: [{ groundingMetadata: {
      searchEntryPoint: { renderedContent: '?hl=fr' },
    } }] },
  };
  const r = extractRegionSignals(cell);
  assert.equal(r.detectedRegion, 'FR');
  assert.equal(r.confidence, 'med');
});

console.log('\nextractRegionSignals — Perplexity');

await test('Perplexity search_results TLDs → high confidence', () => {
  const cell = {
    provider: 'perplexity',
    raw: { search_results: [
      { url: 'https://a.de/' }, { url: 'https://b.de/' }, { url: 'https://c.de/' }, { url: 'https://d.com/' },
    ]},
  };
  const r = extractRegionSignals(cell);
  assert.equal(r.detectedRegion, 'DE');
  assert.equal(r.confidence, 'high');
});

console.log('\nextractRegionSignals — OpenAI fallback');

await test('OpenAI canonicalCitations TLD distribution', () => {
  const cell = {
    provider: 'openai',
    canonicalCitations: ['https://a.pl/', 'https://b.pl/', 'https://c.com/'],
  };
  const r = extractRegionSignals(cell);
  assert.equal(r.detectedRegion, 'PL');
  assert.equal(r.confidence, 'low'); // only 2 hits, threshold 3 for med
});

await test('No signals → none confidence', () => {
  const cell = { provider: 'anthropic', canonicalCitations: [] };
  const r = extractRegionSignals(cell);
  assert.equal(r.detectedRegion, null);
  assert.equal(r.confidence, 'none');
});

console.log('\naggregateRegionContext');

await test('dominant region with high confidence', () => {
  const signals = [
    { provider: 'gemini', detectedRegion: 'DE', confidence: 'high' },
    { provider: 'gemini', detectedRegion: 'DE', confidence: 'high' },
    { provider: 'gemini', detectedRegion: 'DE', confidence: 'high' },
    { provider: 'openai', detectedRegion: 'DE', confidence: 'med' },
  ];
  const r = aggregateRegionContext(signals);
  assert.equal(r.dominantRegion, 'DE');
  assert.equal(r.confidence, 'high');
  assert.equal(r.perRegion.DE, 4);
  assert.equal(r.perProvider.gemini, 'DE');
  assert.equal(r.mixedSignals, false);
});

await test('mixed signals → low confidence + flagged', () => {
  const signals = [
    { provider: 'gemini', detectedRegion: 'DE' },
    { provider: 'openai', detectedRegion: 'US' },
    { provider: 'perplexity', detectedRegion: 'FR' },
    { provider: 'gemini', detectedRegion: 'PL' },
  ];
  const r = aggregateRegionContext(signals);
  assert.equal(r.confidence, 'low');
  assert.equal(r.mixedSignals, true);
});

await test('no signals → null dominant', () => {
  const r = aggregateRegionContext([]);
  assert.equal(r.dominantRegion, null);
  assert.equal(r.confidence, 'none');
});

console.log('\ncheckRegionContext (top-level)');

await test('summary with mixed providers → aggregated output', () => {
  const summary = {
    results: [
      { provider: 'gemini', raw: { candidates: [{ groundingMetadata: {
        searchEntryPoint: { renderedContent: '?gl=us' },
      } }] } },
      { provider: 'openai', canonicalCitations: ['https://a.com/', 'https://b.com/'] }, // no signal
      { provider: 'perplexity', raw: { search_results: [
        { url: 'https://a.us/' }, { url: 'https://b.us/' }, { url: 'https://c.us/' },
      ]} },
    ],
  };
  const r = checkRegionContext(summary);
  assert.equal(r.aggregate.dominantRegion, 'US');
  assert.ok(r.perCell.length >= 2);
});

await test('empty summary → none confidence', () => {
  const r = checkRegionContext({ results: [] });
  assert.equal(r.aggregate.confidence, 'none');
});

await test('null summary → defensive empty', () => {
  const r = checkRegionContext(null);
  assert.equal(r.aggregate.dominantRegion, null);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
