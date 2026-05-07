import assert from 'node:assert/strict';
import { flattenSummary, rowsToCsv, snapshotsToCsv, snapshotsToJson } from '../lib/report/csv-export.js';

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (err) { failed++; console.log(`  ✗ ${name}\n    ${err.message}`); }
}

console.log('\nflattenSummary');

test('produces one row per result', () => {
  const rows = flattenSummary({
    date: '2026-04-27', brand: 'A', domain: 'a.com',
    results: [
      { query: 'Q1', queryText: 'best', provider: 'openai', mention: 'yes', position: 1 },
      { query: 'Q2', queryText: 'top', provider: 'gemini', mention: 'no' },
    ],
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].provider, 'openai');
  assert.equal(rows[1].mention, 'no');
});

test('flattens sentiment, tag, region', () => {
  const rows = flattenSummary({
    date: 'd', brand: 'b', domain: 'd.com',
    results: [{
      query: 'Q1', provider: 'openai', mention: 'yes',
      sentiment: { label: 'positive', confidence: 'high' },
      tag: 'tofu', region: 'de',
    }],
  });
  assert.equal(rows[0].sentiment, 'positive');
  assert.equal(rows[0].sentimentConfidence, 'high');
  assert.equal(rows[0].tag, 'tofu');
  assert.equal(rows[0].region, 'de');
});

test('top citation domain extracted', () => {
  const rows = flattenSummary({
    date: 'd', brand: 'b', domain: 'd.com',
    results: [{
      query: 'Q1', provider: 'openai', mention: 'yes',
      canonicalCitations: ['https://www.g2.com/x', 'https://reddit.com/r/y'],
    }],
  });
  assert.equal(rows[0].topCitationDomain, 'g2.com');
});

test('empty / null input → empty', () => {
  assert.deepEqual(flattenSummary(null), []);
  assert.deepEqual(flattenSummary({}), []);
});

console.log('\nrowsToCsv');

test('header + body, RFC 4180 escape', () => {
  const csv = rowsToCsv([
    { date: '2026-04-27', brand: 'Acme, Inc', mention: 'yes', position: 1, citationCount: 0, query: '', queryText: '', provider: '', model: '', region: '', tag: '', sentiment: '', sentimentConfidence: '', topCompetitor: '', competitorCount: 0, domain: '', topCitationDomain: '' },
  ]);
  assert.ok(csv.includes('date,brand,domain'));
  assert.ok(csv.includes('"Acme, Inc"'));   // comma quoted
});

test('quotes inside cells doubled', () => {
  const csv = rowsToCsv([{ date: '', brand: 'say "hi"', domain: '', query: '', queryText: '', provider: '', model: '', mention: '', position: '', citationCount: 0, region: '', tag: '', sentiment: '', sentimentConfidence: '', topCompetitor: '', competitorCount: 0, topCitationDomain: '' }]);
  assert.ok(csv.includes('"say ""hi"""'));
});

test('newline inside cells quoted', () => {
  const csv = rowsToCsv([{ date: '', brand: 'a\nb', domain: '', query: '', queryText: '', provider: '', model: '', mention: '', position: '', citationCount: 0, region: '', tag: '', sentiment: '', sentimentConfidence: '', topCompetitor: '', competitorCount: 0, topCitationDomain: '' }]);
  assert.ok(csv.includes('"a\nb"'));
});

console.log('\nsnapshotsToCsv / snapshotsToJson');

test('multi-snapshot CSV concatenates', () => {
  const csv = snapshotsToCsv([
    { date: '2026-04-20', brand: 'A', domain: 'a.com', results: [{ query: 'Q1', provider: 'openai', mention: 'yes' }] },
    { date: '2026-04-27', brand: 'A', domain: 'a.com', results: [{ query: 'Q1', provider: 'openai', mention: 'src' }] },
  ]);
  const lines = csv.split('\n').filter(Boolean);
  assert.equal(lines.length, 3); // header + 2 rows
});

test('JSON variant returns parseable array', () => {
  const json = snapshotsToJson([
    { date: 'd', brand: 'b', domain: 'd.com', results: [{ query: 'Q1', provider: 'openai', mention: 'yes' }] },
  ]);
  const parsed = JSON.parse(json);
  assert.ok(Array.isArray(parsed));
  assert.equal(parsed[0].provider, 'openai');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
