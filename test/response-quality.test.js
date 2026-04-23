// Tests for the response-quality classifier. Covers the three tiers and the
// documented boundary constants (EMPTY_TEXT_MAX, NARRATIVE_CITATION_MAX).

import assert from 'node:assert/strict';
import {
  classifyResponseQuality,
  EMPTY_TEXT_MAX,
  NARRATIVE_CITATION_MAX,
} from '../lib/report/response-quality.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}\n    ${err.message}`);
  }
}

console.log('\nclassifyResponseQuality — empty tier');

test('short text with zero citations → empty', () => {
  assert.equal(classifyResponseQuality({ text: 'I cannot help.', citations: [], competitors: [] }), 'empty');
});

test('text just below EMPTY_TEXT_MAX with zero citations → empty', () => {
  const text = 'x'.repeat(EMPTY_TEXT_MAX - 1);
  assert.equal(classifyResponseQuality({ text, citations: [], competitors: [] }), 'empty');
});

test('text exactly at EMPTY_TEXT_MAX with zero citations → NOT empty (boundary)', () => {
  // len < EMPTY_TEXT_MAX is strict — 200 itself does not qualify.
  const text = 'x'.repeat(EMPTY_TEXT_MAX);
  const result = classifyResponseQuality({ text, citations: [], competitors: [] });
  assert.notEqual(result, 'empty', 'boundary should not count as empty');
});

test('short text but has a citation → narrative, not empty', () => {
  // Citations imply retrieval happened; don't classify as "empty/refusal".
  assert.equal(
    classifyResponseQuality({ text: 'See link.', citations: ['https://x.com'], competitors: [] }),
    'narrative',
  );
});

console.log('\nclassifyResponseQuality — narrative tier');

test('long prose, no competitors, few citations → narrative', () => {
  const text = 'x'.repeat(1000);
  assert.equal(
    classifyResponseQuality({ text, citations: ['https://a.com', 'https://b.com'], competitors: [] }),
    'narrative',
  );
});

test('zero competitors with exactly NARRATIVE_CITATION_MAX citations → rich (boundary)', () => {
  // citations < NARRATIVE_CITATION_MAX is strict — hitting the threshold means "rich".
  const text = 'x'.repeat(1000);
  const citations = Array.from({ length: NARRATIVE_CITATION_MAX }, (_, i) => `https://c${i}.com`);
  assert.equal(classifyResponseQuality({ text, citations, competitors: [] }), 'rich');
});

console.log('\nclassifyResponseQuality — rich tier');

test('long text with competitors → rich regardless of citation count', () => {
  const text = 'x'.repeat(1000);
  assert.equal(
    classifyResponseQuality({ text, citations: [], competitors: ['NoGood'] }),
    'rich',
  );
});

test('long text with many citations and no competitors → rich', () => {
  const text = 'x'.repeat(1000);
  const citations = ['https://a.com', 'https://b.com', 'https://c.com', 'https://d.com'];
  assert.equal(classifyResponseQuality({ text, citations, competitors: [] }), 'rich');
});

console.log('\nclassifyResponseQuality — input tolerance');

test('handles null/undefined text safely', () => {
  assert.equal(classifyResponseQuality({ text: null, citations: [], competitors: [] }), 'empty');
  assert.equal(classifyResponseQuality({ text: undefined, citations: [], competitors: [] }), 'empty');
});

test('handles missing citations/competitors arrays', () => {
  assert.equal(classifyResponseQuality({ text: 'short' }), 'empty');
  const long = 'x'.repeat(1000);
  assert.equal(classifyResponseQuality({ text: long }), 'narrative');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
