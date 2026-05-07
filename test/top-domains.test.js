import assert from 'node:assert/strict';
import { computeTopDomains } from '../lib/report/top-domains.js';

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (err) { failed++; console.log(`  ✗ ${name}\n    ${err.message}`); }
}

console.log('\ncomputeTopDomains');

test('aggregates citations by hostname (www stripped)', () => {
  const out = computeTopDomains([
    { canonicalCitations: ['https://www.g2.com/a', 'https://g2.com/b'] },
    { canonicalCitations: ['https://capterra.com/x'] },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].host, 'g2.com');
  assert.equal(out[0].count, 2);
  assert.equal(out[1].host, 'capterra.com');
  assert.equal(out[1].count, 1);
});

test('share = count / total citations', () => {
  const out = computeTopDomains([
    { canonicalCitations: ['https://a.com/1', 'https://a.com/2', 'https://b.com/1'] },
  ]);
  const a = out.find(d => d.host === 'a.com');
  const b = out.find(d => d.host === 'b.com');
  assert.ok(Math.abs(a.share - 2 / 3) < 1e-9);
  assert.ok(Math.abs(b.share - 1 / 3) < 1e-9);
});

test('sorted descending by count', () => {
  const out = computeTopDomains([
    { canonicalCitations: ['https://x.com/1'] },
    { canonicalCitations: ['https://y.com/1', 'https://y.com/2', 'https://y.com/3'] },
    { canonicalCitations: ['https://z.com/1', 'https://z.com/2'] },
  ]);
  assert.deepEqual(out.map(d => d.host), ['y.com', 'z.com', 'x.com']);
});

test('honours limit parameter', () => {
  const out = computeTopDomains([
    { canonicalCitations: ['https://a.com', 'https://b.com', 'https://c.com', 'https://d.com'] },
  ], 2);
  assert.equal(out.length, 2);
});

test('skips malformed URLs without throwing', () => {
  const out = computeTopDomains([
    { canonicalCitations: ['not a url', 'https://valid.com/x', '://broken'] },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].host, 'valid.com');
  assert.equal(out[0].count, 1);
});

test('empty / missing canonicalCitations → []', () => {
  assert.deepEqual(computeTopDomains([]), []);
  assert.deepEqual(computeTopDomains(null), []);
  assert.deepEqual(computeTopDomains([{}, { canonicalCitations: [] }]), []);
});

test('share = 0 when no citations parsed', () => {
  const out = computeTopDomains([{ canonicalCitations: ['not a url'] }]);
  assert.deepEqual(out, []);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
