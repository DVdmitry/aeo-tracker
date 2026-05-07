import assert from 'node:assert/strict';
import {
  deriveCompetitorDomain,
  findPricingPage,
  extractPrices,
  classifyTier,
  processCompetitor,
  classifyCompetitorPricing,
} from '../lib/report/competitor-pricing.js';

let passed = 0;
let failed = 0;
function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch(err => { failed++; console.log(`  ✗ ${name}\n    ${err.message}`); });
}

console.log('\nderiveCompetitorDomain');

await test('matches citation hostname containing slug', () => {
  const r = deriveCompetitorDomain('Profound', [
    'https://tryprofound.com/pricing?utm_source=openai',
    'https://www.techradar.com/profound-review',
  ]);
  assert.equal(r, 'tryprofound.com');
});

await test('matches when slug is contained inside host (semrush)', () => {
  const r = deriveCompetitorDomain('Semrush', ['https://www.semrush.com/pricing/']);
  assert.equal(r, 'semrush.com');
});

await test('null name → null', () => {
  assert.equal(deriveCompetitorDomain(null, []), null);
});

await test('no matching citation → null', () => {
  assert.equal(deriveCompetitorDomain('UnknownBrand', ['https://example.com/x']), null);
});

console.log('\nfindPricingPage (with stub fetch)');

await test('citation URL ending in /pricing → source=citation, no fetch', async () => {
  let calls = 0;
  const stubFetch = async () => { calls++; return { ok: true, status: 200 }; };
  const r = await findPricingPage('acme.com', ['https://acme.com/pricing?utm=x'], { fetchImpl: stubFetch });
  assert.equal(r.source, 'citation');
  assert.equal(r.url, 'https://acme.com/pricing?utm=x');
  assert.equal(calls, 0);
});

await test('heuristic guess returns first 200', async () => {
  const stubFetch = async (url) => {
    if (url === 'https://acme.com/pricing') return { ok: true, status: 200 };
    return { ok: false, status: 404 };
  };
  const r = await findPricingPage('acme.com', [], { fetchImpl: stubFetch });
  assert.equal(r.source, 'heuristic');
  assert.equal(r.url, 'https://acme.com/pricing');
});

await test('all 404 → null', async () => {
  const stubFetch = async () => ({ ok: false, status: 404 });
  const r = await findPricingPage('acme.com', [], { fetchImpl: stubFetch });
  assert.equal(r.url, null);
  assert.equal(r.source, null);
});

console.log('\nextractPrices');

await test('plain $XX prices', () => {
  const r = extractPrices('<p>Starter $19/mo · Pro $99 · Business $299</p>');
  assert.deepEqual(r.prices, [19, 99, 299]);
  assert.equal(r.hasFree, false);
  assert.equal(r.hasContactSales, false);
});

await test('Free tier detected', () => {
  const r = extractPrices('<p>Free forever · Pro $29</p>');
  assert.equal(r.hasFree, true);
  assert.deepEqual(r.prices, [29]);
});

await test('Contact sales detected', () => {
  const r = extractPrices('<p>Enterprise: Contact sales</p>');
  assert.equal(r.hasContactSales, true);
});

await test('comma-thousands handled', () => {
  const r = extractPrices('<p>Annual $1,299/yr</p>');
  assert.deepEqual(r.prices, [1299]);
});

await test('absurd values filtered (defensive)', () => {
  const r = extractPrices('<p>$200000 fake · $99 real</p>');
  assert.deepEqual(r.prices, [99]);
});

console.log('\nclassifyTier');

await test('free tier', () => {
  const r = classifyTier({ prices: [], hasFree: true, hasContactSales: false });
  assert.equal(r.tier, 'free');
  assert.equal(r.entryPrice, 0);
});

await test('freemium (free + paid) → free with med confidence', () => {
  const r = classifyTier({ prices: [29, 99], hasFree: true, hasContactSales: false });
  assert.equal(r.tier, 'free');
  assert.equal(r.confidence, 'med');
});

await test('low tier ($19)', () => {
  const r = classifyTier({ prices: [19, 49], hasFree: false, hasContactSales: false });
  assert.equal(r.tier, 'low');
  assert.equal(r.entryPrice, 19);
  assert.equal(r.confidence, 'high');
});

await test('mid tier ($199)', () => {
  const r = classifyTier({ prices: [199, 499], hasFree: false, hasContactSales: false });
  assert.equal(r.tier, 'mid');
});

await test('high tier ($999)', () => {
  const r = classifyTier({ prices: [999, 1999], hasFree: false, hasContactSales: false });
  assert.equal(r.tier, 'high');
});

await test('enterprise (price > 2000)', () => {
  const r = classifyTier({ prices: [2999], hasFree: false, hasContactSales: false });
  assert.equal(r.tier, 'enterprise');
});

await test('contact sales only → enterprise med', () => {
  const r = classifyTier({ prices: [], hasFree: false, hasContactSales: true });
  assert.equal(r.tier, 'enterprise');
  assert.equal(r.confidence, 'med');
});

await test('no signal → unknown low', () => {
  const r = classifyTier({ prices: [], hasFree: false, hasContactSales: false });
  assert.equal(r.tier, 'unknown');
  assert.equal(r.confidence, 'low');
});

console.log('\nprocessCompetitor (e2e)');

await test('happy path — citation pricing → low tier', async () => {
  const stubFetch = async (url) => {
    if (url === 'https://acme.com/pricing') {
      return { ok: true, status: 200, text: async () => '<p>Starter $9/mo</p>' };
    }
    return { ok: false, status: 404 };
  };
  const r = await processCompetitor(
    { name: 'Acme' },
    ['https://acme.com/pricing'],
    { fetchImpl: stubFetch }
  );
  assert.equal(r.domain, 'acme.com');
  assert.equal(r.tier, 'low');
  assert.equal(r.entryPrice, 9);
});

await test('no domain derivable → unknown with error', async () => {
  const r = await processCompetitor({ name: 'Mystery' }, ['https://unrelated.com/x'], { fetchImpl: async () => ({}) });
  assert.equal(r.tier, 'unknown');
  assert.equal(r.error, 'no-domain-derivable');
});

await test('pricing page 404 → unknown', async () => {
  const stubFetch = async () => ({ ok: false, status: 404 });
  const r = await processCompetitor({ name: 'Acme' }, ['https://acme.com/about'], { fetchImpl: stubFetch });
  assert.equal(r.tier, 'unknown');
  assert.equal(r.error, 'no-pricing-page-found');
});

console.log('\nclassifyCompetitorPricing (batch)');

await test('processes top-5 in parallel, drops rest', async () => {
  const stubFetch = async () => ({ ok: true, status: 200, text: async () => '<p>$29</p>' });
  const competitors = Array.from({ length: 8 }, (_, i) => ({ name: `Brand${i}` }));
  const citations = competitors.map((_, i) => `https://brand${i}.com/pricing`);
  const r = await classifyCompetitorPricing(competitors, citations, { fetchImpl: stubFetch });
  assert.equal(r.length, 5);
  assert.ok(r.every(x => x.domain && x.domain.startsWith('brand')));
});

await test('respects custom limit', async () => {
  const stubFetch = async () => ({ ok: true, status: 200, text: async () => '<p>$29</p>' });
  const competitors = [{ name: 'A' }, { name: 'B' }, { name: 'C' }];
  const r = await classifyCompetitorPricing(competitors, [], { limit: 2, fetchImpl: stubFetch });
  assert.equal(r.length, 2);
});

await test('empty input → empty output', async () => {
  assert.deepEqual(await classifyCompetitorPricing([], []), []);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
