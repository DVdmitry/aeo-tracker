import assert from 'node:assert/strict';
import { clusterQueries } from '../lib/report/topic-cluster.js';

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (err) { failed++; console.log(`  ✗ ${name}\n    ${err.message}`); }
}

console.log('\nclusterQueries');

test('groups CRM queries together', () => {
  const out = clusterQueries({
    results: [
      { query: 'Q1', queryText: 'best CRM tools 2026', mention: 'yes' },
      { query: 'Q2', queryText: 'CRM software comparison', mention: 'no' },
      { query: 'Q3', queryText: 'top SEO tools', mention: 'yes' },
    ],
  });
  const crm = out.find(c => c.topic === 'crm');
  assert.ok(crm, 'crm cluster missing');
  assert.equal(crm.queries.length, 2);
});

test('singletons fall to uncategorised', () => {
  const out = clusterQueries({
    results: [
      { query: 'Q1', queryText: 'apple farming techniques', mention: 'yes' },
      { query: 'Q2', queryText: 'banana cultivation guide', mention: 'no' },
    ],
  });
  const uncat = out.find(c => c.topic === 'uncategorised');
  assert.ok(uncat);
  assert.equal(uncat.queries.length, 2);
});

test('drops stopwords from cluster keys', () => {
  const out = clusterQueries({
    results: [
      { query: 'Q1', queryText: 'best the new awesome thing', mention: 'yes' },
      { query: 'Q2', queryText: 'top the great thing today', mention: 'no' },
    ],
  });
  // 'thing' is the only meaningful shared word
  const thing = out.find(c => c.topic === 'thing');
  assert.ok(thing, 'thing cluster missing');
});

test('hits and rate computed correctly per cluster', () => {
  const out = clusterQueries({
    results: [
      { query: 'Q1', queryText: 'CRM software best', mention: 'yes' },
      { query: 'Q1', queryText: 'CRM software best', mention: 'no', provider: 'gemini' },
      { query: 'Q2', queryText: 'CRM tools cheap', mention: 'yes' },
      { query: 'Q2', queryText: 'CRM tools cheap', mention: 'yes', provider: 'gemini' },
    ],
  });
  const crm = out.find(c => c.topic === 'crm');
  assert.equal(crm.total, 4);
  assert.equal(crm.hits, 3);
  assert.equal(crm.rate, 75);
});

test('error cells excluded from rate calculation', () => {
  const out = clusterQueries({
    results: [
      { query: 'Q1', queryText: 'CRM tools best', mention: 'yes' },
      { query: 'Q2', queryText: 'CRM software new', mention: 'error' },
    ],
  });
  const crm = out.find(c => c.topic === 'crm');
  assert.equal(crm.total, 1);
  assert.equal(crm.hits, 1);
});

test('empty input → empty result', () => {
  assert.deepEqual(clusterQueries({ results: [] }), []);
  assert.deepEqual(clusterQueries({}), []);
  assert.deepEqual(clusterQueries(null), []);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
