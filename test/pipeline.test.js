// End-to-end pipeline test.
//
// Walks a synthetic engine response through the production extraction chain:
//   detect-mention → two-model LLM extract → classify-response-quality
//
// The LLM calls are replaced by deterministic mock providers so the test is
// offline and fast. It proves the composition holds together — each module
// has its own unit tests (extract-competitors-llm.test.js, response-quality.test.js,
// validate-queries.test.js).

import assert from 'node:assert/strict';
import {
  detectMention,
  findPosition,
  extractUrls,
} from '../lib/mention.js';
import { extractWithTwoModels } from '../lib/report/extract-competitors-llm.js';
import { classifyResponseQuality } from '../lib/report/response-quality.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch(err => { failed++; console.log(`  ✗ ${name}\n    ${err.message}`); });
}

// ─── Synthetic responses mirroring real AI-engine output ───

const SYNTH_OPENAI = `# Top AEO agencies 2026

Here are the top Answer Engine Optimization agencies in 2026:

1. **NoGood** — full-service AEO + SEO, strong track record.
2. **Omniscient Digital** — content-led AEO for B2B SaaS.
3. **Minuttia** — programmatic AEO specialist.

Source: https://example.com/aeo-report
`;

const SYNTH_GEMINI_EMPTY = `I cannot provide specific recommendations for AEO agencies.`;

const SYNTH_CLAUDE_NARRATIVE = `Measuring AI search visibility involves tracking how often your brand appears in AI-generated answers across different engines. The concept is analogous to traditional SEO ranking, but with different signals. You should focus on citation rate, mention frequency, and share of voice across the major answer engines. Long-term success requires consistent monitoring and iterative content optimization. There is no single industry-standard metric yet, which makes baseline establishment particularly important for any serious measurement program. Companies typically use internal dashboards combined with third-party tools to aggregate results across ChatGPT, Claude, Gemini, and Perplexity.`;

// Mock extractor providers: echo back the "brands" JSON verbatim.
function mockExtractor(brandsJson) {
  return async () => ({ text: JSON.stringify({ brands: brandsJson }), raw: {} });
}

// Pipeline assembly — mirrors cmdRun's per-cell loop.
async function runPerCell({ text, citations = [], brand = 'TestBrand', domain = 'testbrand.com', primary, secondary }) {
  const mention = detectMention(text, citations, brand, domain);
  const position = mention === 'yes' ? findPosition(text, brand, domain) : null;
  const extraction = await extractWithTwoModels({ text, brand, domain, primary, secondary });
  const competitors = extraction.verified;
  const competitorsUnverified = extraction.unverified;
  const canonicalCitations = [...new Set(citations)];
  const responseQuality = classifyResponseQuality({
    text, citations,
    competitors: [...competitors, ...competitorsUnverified],
  });
  return {
    mention, position, competitors, competitorsUnverified,
    canonicalCitations, responseQuality,
  };
}

const P = (brands, name = 'openai', model = 'gpt-5.4-mini') => ({
  name, model, apiKey: 'k', providerCall: mockExtractor(brands),
});

// ─── Tests ───

console.log('\nPer-cell pipeline (mock LLM extractors)');

await test('OpenAI-style rich response — both models agree on real brands', async () => {
  const cell = await runPerCell({
    text: SYNTH_OPENAI,
    citations: ['https://example.com/aeo-report'],
    primary:   P(['NoGood', 'Omniscient Digital', 'Minuttia'], 'openai', 'gpt-5.4-mini'),
    secondary: P(['NoGood', 'Omniscient Digital', 'Minuttia'], 'gemini', 'gemini-2.5-flash'),
  });
  assert.equal(cell.mention, 'no');
  assert.deepEqual(cell.competitors.sort(), ['Minuttia', 'NoGood', 'Omniscient Digital']);
  assert.deepEqual(cell.competitorsUnverified, []);
  assert.equal(cell.responseQuality, 'rich');
});

await test('Model disagreement → extras land in unverified tier', async () => {
  const cell = await runPerCell({
    text: SYNTH_OPENAI,
    citations: ['https://example.com/aeo-report'],
    primary:   P(['NoGood', 'Minuttia']),
    secondary: P(['NoGood', 'Omniscient Digital']),
  });
  assert.deepEqual(cell.competitors, ['NoGood']);
  assert.deepEqual(cell.competitorsUnverified.sort(), ['Minuttia', 'Omniscient Digital']);
  // Combined signal (verified + unverified) ⇒ rich (not narrative)
  assert.equal(cell.responseQuality, 'rich');
});

await test('Gemini refusal → empty extraction + responseQuality empty', async () => {
  const cell = await runPerCell({
    text: SYNTH_GEMINI_EMPTY,
    citations: [],
    primary:   P([]),
    secondary: P([]),
  });
  assert.equal(cell.responseQuality, 'empty');
  assert.deepEqual(cell.competitors, []);
  assert.deepEqual(cell.competitorsUnverified, []);
});

await test('Long narrative, no brands → responseQuality narrative', async () => {
  const cell = await runPerCell({
    text: SYNTH_CLAUDE_NARRATIVE,
    citations: [],
    primary:   P([]),
    secondary: P([]),
  });
  assert.equal(cell.responseQuality, 'narrative');
});

await test('One extractor model fails → survivors flow into unverified', async () => {
  const cell = await runPerCell({
    text: SYNTH_OPENAI,
    citations: ['https://example.com/aeo-report'],
    primary:   { name: 'openai', model: 'gpt', apiKey: 'k', providerCall: async () => { throw new Error('rate limit'); } },
    secondary: P(['NoGood', 'Minuttia']),
  });
  assert.deepEqual(cell.competitors, []);
  assert.deepEqual(cell.competitorsUnverified.sort(), ['Minuttia', 'NoGood']);
});

console.log('\nPer-cell cell-shape consumed by HTML/_summary.json');

await test('cell exposes all fields downstream rendering expects', async () => {
  const cell = await runPerCell({
    text: SYNTH_OPENAI,
    citations: ['https://example.com/aeo-report'],
    primary:   P(['NoGood']),
    secondary: P(['NoGood']),
  });
  for (const field of ['mention', 'position', 'competitors', 'competitorsUnverified', 'canonicalCitations', 'responseQuality']) {
    assert.ok(field in cell, `missing field: ${field}`);
  }
  assert.ok(['empty', 'narrative', 'rich'].includes(cell.responseQuality));
});

await test('extractUrls still works (independent helper)', () => {
  const urls = extractUrls('See https://a.com/x and https://b.com, then (https://c.com).');
  assert.ok(urls.includes('https://a.com/x'));
  assert.ok(urls.includes('https://b.com'));
  assert.ok(urls.includes('https://c.com'));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
