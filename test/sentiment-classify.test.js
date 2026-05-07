// Tests for the two-model LLM sentiment classifier. Covers prompt shape,
// response parsing, label validation, merge semantics, and partial failure.

import assert from 'node:assert/strict';
import {
  buildSentimentPrompt,
  parseSentimentResponse,
  mergeSentiments,
  classifySentimentWithTwoModels,
  sentimentToScore,
} from '../lib/report/sentiment-classify.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch(err => { failed++; console.log(`  ✗ ${name}\n    ${err.message}`); });
}

// ─── buildSentimentPrompt ───

console.log('\nbuildSentimentPrompt');

await test('embeds brand and source text', () => {
  const p = buildSentimentPrompt({ text: 'Webappski is great.', brand: 'Webappski', domain: 'webappski.com' });
  assert.ok(p.includes('Webappski'));
  assert.ok(p.includes('webappski.com'));
  assert.ok(p.includes('Webappski is great.'));
});

await test('asks for STRICT JSON with label and rationale', () => {
  const p = buildSentimentPrompt({ text: 't', brand: 'b', domain: 'd.com' });
  assert.ok(/STRICT JSON/i.test(p));
  assert.ok(p.includes('"label"'));
  assert.ok(p.includes('"rationale"'));
});

// ─── parseSentimentResponse ───

console.log('\nparseSentimentResponse');

await test('parses well-formed positive response', () => {
  const r = parseSentimentResponse('{"label":"positive","rationale":"recommended as top choice"}');
  assert.equal(r.label, 'positive');
  assert.equal(r.rationale, 'recommended as top choice');
});

await test('strips ```json fences', () => {
  const r = parseSentimentResponse('```json\n{"label":"neutral","rationale":"just listed"}\n```');
  assert.equal(r.label, 'neutral');
});

await test('extracts JSON from prose-wrapped response', () => {
  const r = parseSentimentResponse('Here is the result:\n{"label":"negative","rationale":"dismissed"}\nThanks.');
  assert.equal(r.label, 'negative');
});

await test('rejects invalid label', () => {
  assert.throws(() => parseSentimentResponse('{"label":"bullish","rationale":"x"}'),
    /not in \{positive, neutral, negative\}/);
});

await test('rejects empty/non-string input', () => {
  assert.throws(() => parseSentimentResponse(''), /empty response/);
  assert.throws(() => parseSentimentResponse(null), /empty response/);
});

await test('rejects unparseable JSON', () => {
  assert.throws(() => parseSentimentResponse('not json at all, no braces'), /not JSON/);
});

await test('truncates rationale to 200 chars', () => {
  const long = 'x'.repeat(500);
  const r = parseSentimentResponse(`{"label":"neutral","rationale":"${long}"}`);
  assert.equal(r.rationale.length, 200);
});

// ─── mergeSentiments ───

console.log('\nmergeSentiments');

await test('both agree → high confidence, primary rationale', () => {
  const m = mergeSentiments(
    { ok: true, label: 'positive', rationale: 'praised' },
    { ok: true, label: 'positive', rationale: 'top pick' },
  );
  assert.equal(m.label, 'positive');
  assert.equal(m.confidence, 'high');
  assert.equal(m.rationale, 'praised');
});

await test('disagree → degraded to neutral, low confidence', () => {
  const m = mergeSentiments(
    { ok: true, label: 'positive', rationale: 'good' },
    { ok: true, label: 'negative', rationale: 'bad' },
  );
  assert.equal(m.label, 'neutral');
  assert.equal(m.confidence, 'low');
  assert.ok(m.rationale.includes('disagreed'));
});

await test('one model fails → other label, single-model confidence', () => {
  const m = mergeSentiments(
    { ok: true, label: 'positive', rationale: 'praised' },
    { ok: false, error: 'timeout' },
  );
  assert.equal(m.label, 'positive');
  assert.equal(m.confidence, 'single-model');
});

await test('both fail → null', () => {
  const m = mergeSentiments(
    { ok: false, error: 'a' },
    { ok: false, error: 'b' },
  );
  assert.equal(m, null);
});

// ─── classifySentimentWithTwoModels (with stub providerCall) ───

console.log('\nclassifySentimentWithTwoModels');

const stubProvider = (label, rationale) => ({
  name: 'stub',
  providerCall: async () => ({
    text: JSON.stringify({ label, rationale }),
    raw: { usage: { prompt_tokens: 10, completion_tokens: 5 } },
  }),
  apiKey: 'k',
  model: 'stub-model',
});

await test('parallel both-positive → high confidence', async () => {
  const r = await classifySentimentWithTwoModels({
    text: 'Brand is great.', brand: 'Brand', domain: 'b.com',
    primary: stubProvider('positive', 'praised'),
    secondary: stubProvider('positive', 'top'),
  });
  assert.equal(r.label, 'positive');
  assert.equal(r.confidence, 'high');
});

await test('empty text returns neutral immediately, no LLM call', async () => {
  let called = false;
  const counterProvider = {
    ...stubProvider('positive', 'x'),
    providerCall: async () => { called = true; return { text: '{}', raw: {} }; },
  };
  const r = await classifySentimentWithTwoModels({
    text: '', brand: 'b', domain: 'd.com',
    primary: counterProvider, secondary: counterProvider,
  });
  assert.equal(r.label, 'neutral');
  assert.equal(r.confidence, 'empty');
  assert.equal(called, false);
});

// ─── sentimentToScore ───

console.log('\nsentimentToScore');

await test('positive → 100, neutral → 50, negative → 0', () => {
  assert.equal(sentimentToScore('positive'), 100);
  assert.equal(sentimentToScore('neutral'), 50);
  assert.equal(sentimentToScore('negative'), 0);
});

await test('unknown label → 50 (neutral default)', () => {
  assert.equal(sentimentToScore('mixed'), 50);
  assert.equal(sentimentToScore(null), 50);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
