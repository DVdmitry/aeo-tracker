import assert from 'node:assert/strict';
import {
  extractHeadings,
  detectAnswerCapsules,
  analyzeSchemaOrg,
  countFaqs,
  crawlPageSignals,
  checkPageSignals,
} from '../lib/report/page-signals.js';

let passed = 0;
let failed = 0;
function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch(err => { failed++; console.log(`  ✗ ${name}\n    ${err.message}`); });
}

console.log('\nextractHeadings');

await test('counts h1 + h2 with text samples', () => {
  const html = '<h1>Welcome</h1><h2>About us</h2><h2>Pricing</h2><p>...</p>';
  const r = extractHeadings(html);
  assert.equal(r.h1.count, 1);
  assert.equal(r.h1.samples[0], 'Welcome');
  assert.equal(r.h2.count, 2);
  assert.deepEqual(r.h2.samples, ['About us', 'Pricing']);
});

await test('strips inner HTML and decodes entities', () => {
  const html = '<h1><span>Code &amp; Coffee</span></h1>';
  const r = extractHeadings(html);
  assert.equal(r.h1.samples[0], 'Code & Coffee');
});

await test('caps samples at 5 even with more headings', () => {
  const html = Array.from({ length: 8 }, (_, i) => `<h2>Title ${i}</h2>`).join('');
  const r = extractHeadings(html);
  assert.equal(r.h2.count, 8);
  assert.equal(r.h2.samples.length, 5);
});

await test('handles null/empty input', () => {
  assert.equal(extractHeadings(null).h1.count, 0);
  assert.equal(extractHeadings('').h2.count, 0);
});

console.log('\ndetectAnswerCapsules');

await test('h2 followed by 40-60w para → has capsule', () => {
  const para50 = Array.from({ length: 50 }, (_, i) => `word${i}`).join(' ');
  const html = `<h2>What is X?</h2><p>${para50}</p>`;
  const r = detectAnswerCapsules(html);
  assert.equal(r.totalH2, 1);
  assert.equal(r.withCapsule, 1);
  assert.equal(r.coverage, 100);
});

await test('h2 followed by 30w para → no capsule', () => {
  const para30 = Array.from({ length: 30 }, (_, i) => `w${i}`).join(' ');
  const html = `<h2>Topic</h2><p>${para30}</p>`;
  const r = detectAnswerCapsules(html);
  assert.equal(r.withCapsule, 0);
  assert.equal(r.coverage, 0);
});

await test('mixed: some capsules, some not → partial coverage', () => {
  const para50 = Array.from({ length: 50 }, (_, i) => `w${i}`).join(' ');
  const para20 = Array.from({ length: 20 }, (_, i) => `w${i}`).join(' ');
  const html = `<h2>A</h2><p>${para50}</p><h2>B</h2><p>${para20}</p><h2>C</h2><p>${para50}</p>`;
  const r = detectAnswerCapsules(html);
  assert.equal(r.totalH2, 3);
  assert.equal(r.withCapsule, 2);
  assert.equal(r.coverage, 67);
});

console.log('\nanalyzeSchemaOrg');

await test('parses Organization schema', () => {
  const html = `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Acme',
    url: 'https://acme.com',
    logo: 'https://acme.com/logo.svg',
    sameAs: ['https://linkedin.com/acme'],
  })}</script>`;
  const r = analyzeSchemaOrg(html);
  assert.equal(r.blockCount, 1);
  assert.equal(r.parseFailures, 0);
  assert.equal(r.hasOrganization, true);
  assert.ok(r.orgFields.includes('name'));
  assert.ok(r.orgFields.includes('sameAs'));
});

await test('detects FAQPage + BreadcrumbList + Person', () => {
  const html = [
    `<script type="application/ld+json">${JSON.stringify({ '@type': 'FAQPage', mainEntity: [] })}</script>`,
    `<script type="application/ld+json">${JSON.stringify({ '@type': 'BreadcrumbList', itemListElement: [] })}</script>`,
    `<script type="application/ld+json">${JSON.stringify({ '@type': 'Person', name: 'Alex' })}</script>`,
  ].join('');
  const r = analyzeSchemaOrg(html);
  assert.equal(r.blockCount, 3);
  assert.equal(r.hasFaqPage, true);
  assert.equal(r.hasBreadcrumb, true);
  assert.equal(r.hasPerson, true);
});

await test('handles @graph nesting', () => {
  const html = `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Organization', name: 'A' },
      { '@type': 'Person', name: 'B' },
    ],
  })}</script>`;
  const r = analyzeSchemaOrg(html);
  assert.equal(r.hasOrganization, true);
  assert.equal(r.hasPerson, true);
});

await test('counts parse failures gracefully', () => {
  const html = `<script type="application/ld+json">{ broken json }</script>`;
  const r = analyzeSchemaOrg(html);
  assert.equal(r.blockCount, 1);
  assert.equal(r.parseFailures, 1);
});

console.log('\ncountFaqs');

await test('schemaCount from FAQPage mainEntity', () => {
  const html = `<script type="application/ld+json">${JSON.stringify({
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Q1?' },
      { '@type': 'Question', name: 'Q2?' },
      { '@type': 'Question', name: 'Q3?' },
    ],
  })}</script>`;
  const r = countFaqs(html);
  assert.equal(r.schemaCount, 3);
  assert.equal(r.total, 3);
});

await test('heuristic count from question-headings', () => {
  const html = `<h3>What is X?</h3><h3>How do I Y?</h3><summary>Where is Z?</summary>`;
  const r = countFaqs(html);
  assert.equal(r.heuristicCount, 3);
  assert.equal(r.total, 3);
});

await test('schemaCount preferred over heuristic when both present', () => {
  const html = [
    `<h3>Q?</h3>`,
    `<script type="application/ld+json">${JSON.stringify({
      '@type': 'FAQPage', mainEntity: [{}, {}, {}, {}, {}]
    })}</script>`,
  ].join('');
  const r = countFaqs(html);
  assert.equal(r.schemaCount, 5);
  assert.equal(r.heuristicCount, 1);
  assert.equal(r.total, 5);
});

console.log('\ncrawlPageSignals (with stub fetch)');

await test('happy path — full signals returned', async () => {
  const para50 = Array.from({ length: 50 }, (_, i) => `w${i}`).join(' ');
  const html = `<!DOCTYPE html><html><head>
    <script type="application/ld+json">${JSON.stringify({ '@type': 'Organization', name: 'Acme', url: 'https://acme.com' })}</script>
  </head><body>
    <h1>Acme — Industrial Software</h1>
    <h2>What we do</h2><p>${para50}</p>
  </body></html>`;
  const stubFetch = async () => ({ ok: true, status: 200, text: async () => html });
  const r = await crawlPageSignals('acme.com', { fetchImpl: stubFetch });
  assert.equal(r.ok, true);
  assert.equal(r.headings.h1.count, 1);
  assert.equal(r.headings.h2.count, 1);
  assert.equal(r.answerCapsules.totalH2, 1);
  assert.equal(r.answerCapsules.withCapsule, 1);
  assert.equal(r.schemaOrg.hasOrganization, true);
});

await test('http error → ok:false with status', async () => {
  const stubFetch = async () => ({ ok: false, status: 404 });
  const r = await crawlPageSignals('acme.com', { fetchImpl: stubFetch });
  assert.equal(r.ok, false);
  assert.equal(r.status, 404);
});

await test('throws → graceful error result', async () => {
  const stubFetch = async () => { throw new Error('network down'); };
  const r = await crawlPageSignals('acme.com', { fetchImpl: stubFetch });
  assert.equal(r.ok, false);
  assert.ok(r.error.includes('network'));
});

await test('null domain → defensive empty', async () => {
  const r = await crawlPageSignals(null);
  assert.equal(r.ok, false);
});

console.log('\ncheckPageSignals (top-level wrapper)');

await test('wraps homepage result + adds metadata', async () => {
  const stubFetch = async () => ({ ok: true, status: 200, text: async () => '<h1>X</h1>' });
  const r = await checkPageSignals('acme.com', { fetchImpl: stubFetch });
  assert.equal(r.domain, 'acme.com');
  assert.ok(r.ranAt);
  assert.equal(r.homepage.ok, true);
  assert.equal(r.homepage.headings.h1.count, 1);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
