// Tests for the static rule-based domain → category classifier.

import assert from 'node:assert/strict';
import {
  categorizeDomain,
  aggregateByCategory,
  CATEGORIES,
} from '../lib/report/domain-category.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (err) { failed++; console.log(`  ✗ ${name}\n    ${err.message}`); }
}

console.log('\ncategorizeDomain — direct table lookup');

test('g2.com → review', () => assert.equal(categorizeDomain('g2.com').slug, 'review'));
test('reddit.com → forum', () => assert.equal(categorizeDomain('reddit.com').slug, 'forum'));
test('quora.com → qna', () => assert.equal(categorizeDomain('quora.com').slug, 'qna'));
test('techcrunch.com → news', () => assert.equal(categorizeDomain('techcrunch.com').slug, 'news'));
test('wikipedia.org → reference', () => assert.equal(categorizeDomain('wikipedia.org').slug, 'reference'));
test('linkedin.com → social', () => assert.equal(categorizeDomain('linkedin.com').slug, 'social'));
test('firstpagesage.com → agency', () => assert.equal(categorizeDomain('firstpagesage.com').slug, 'agency'));
test('medium.com → blog', () => assert.equal(categorizeDomain('medium.com').slug, 'blog'));

console.log('\ncategorizeDomain — heuristics');

test('strips www. prefix', () => assert.equal(categorizeDomain('www.g2.com').slug, 'review'));
test('parent domain match for subdomain', () => assert.equal(categorizeDomain('en.wikipedia.org').slug, 'reference'));
test('blog.* → blog', () => assert.equal(categorizeDomain('blog.acme.com').slug, 'blog'));
test('docs.* → docs', () => assert.equal(categorizeDomain('docs.acme.com').slug, 'docs'));
test('developer.* → docs', () => assert.equal(categorizeDomain('developer.acme.com').slug, 'docs'));
test('community.* → forum', () => assert.equal(categorizeDomain('community.acme.com').slug, 'forum'));
test('.gov suffix → gov-edu', () => assert.equal(categorizeDomain('whitehouse.gov').slug, 'gov-edu'));
test('.edu suffix → gov-edu', () => assert.equal(categorizeDomain('mit.edu').slug, 'gov-edu'));
test('unknown domain → other', () => assert.equal(categorizeDomain('random-thing.example').slug, 'other'));

console.log('\ncategorizeDomain — defensive');

test('null/undefined → other', () => assert.equal(categorizeDomain(null).slug, 'other'));
test('empty string → other', () => assert.equal(categorizeDomain('').slug, 'other'));
test('non-string → other', () => assert.equal(categorizeDomain(123).slug, 'other'));

console.log('\naggregateByCategory');

test('aggregates correctly with shares summing to 1', () => {
  const out = aggregateByCategory([
    { host: 'g2.com', count: 5, share: 0.5 },
    { host: 'reddit.com', count: 3, share: 0.3 },
    { host: 'capterra.com', count: 2, share: 0.2 },
  ]);
  assert.equal(out.length, 2);
  const review = out.find(c => c.slug === 'review');
  assert.equal(review.count, 7);
  assert.equal(review.domains.length, 2);
  const sum = out.reduce((s, c) => s + c.share, 0);
  assert.ok(Math.abs(sum - 1) < 0.001);
});

test('sorted by count desc', () => {
  const out = aggregateByCategory([
    { host: 'reddit.com', count: 1 },
    { host: 'g2.com', count: 10 },
    { host: 'capterra.com', count: 5 },
  ]);
  assert.equal(out[0].slug, 'review');
  assert.equal(out[1].slug, 'forum');
});

test('empty input → empty array', () => {
  assert.deepEqual(aggregateByCategory([]), []);
  assert.deepEqual(aggregateByCategory(null), []);
});

test('all domains in same category collapse to single bucket', () => {
  const out = aggregateByCategory([
    { host: 'g2.com', count: 1 },
    { host: 'capterra.com', count: 1 },
    { host: 'trustradius.com', count: 1 },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].slug, 'review');
  assert.equal(out[0].domains.length, 3);
});

console.log('\nCATEGORIES export');
test('all categories have required fields', () => {
  for (const cat of CATEGORIES) {
    assert.ok(cat.slug);
    assert.ok(cat.label);
    assert.ok(cat.icon);
    assert.ok(cat.why);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
