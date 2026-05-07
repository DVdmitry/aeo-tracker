import assert from 'node:assert/strict';
import { normalizeQueries } from '../lib/config/queries-normalize.js';

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (err) { failed++; console.log(`  ✗ ${name}\n    ${err.message}`); }
}

console.log('\nnormalizeQueries');

test('all-strings input — backward compatible', () => {
  const r = normalizeQueries(['best CRM', 'top SEO tools']);
  assert.deepEqual(r.texts, ['best CRM', 'top SEO tools']);
  assert.deepEqual(r.tags, [null, null]);
  assert.equal(r.hasTags, false);
  assert.deepEqual(r.uniqueTags, []);
});

test('all-objects input', () => {
  const r = normalizeQueries([
    { q: 'a', tag: 'tofu' },
    { q: 'b', tag: 'bofu' },
  ]);
  assert.deepEqual(r.texts, ['a', 'b']);
  assert.deepEqual(r.tags, ['tofu', 'bofu']);
  assert.equal(r.hasTags, true);
  assert.deepEqual(r.uniqueTags.sort(), ['bofu', 'tofu']);
});

test('mixed input — strings and objects', () => {
  const r = normalizeQueries([
    'untagged one',
    { q: 'tagged one', tag: 'comparison' },
    'untagged two',
  ]);
  assert.deepEqual(r.texts, ['untagged one', 'tagged one', 'untagged two']);
  assert.deepEqual(r.tags, [null, 'comparison', null]);
  assert.equal(r.hasTags, true);
});

test('empty tag string treated as null', () => {
  const r = normalizeQueries([{ q: 'x', tag: '' }, { q: 'y', tag: '   ' }]);
  assert.deepEqual(r.tags, [null, null]);
  assert.equal(r.hasTags, false);
});

test('object missing q field is skipped', () => {
  const r = normalizeQueries([
    { q: 'ok', tag: 't' },
    { tag: 'orphan' },
    'plain',
  ]);
  assert.equal(r.texts.length, 2);
  assert.deepEqual(r.texts, ['ok', 'plain']);
});

test('non-array input → empty result', () => {
  const r = normalizeQueries(null);
  assert.deepEqual(r.texts, []);
  assert.equal(r.hasTags, false);
});

test('whitespace in tag is trimmed', () => {
  const r = normalizeQueries([{ q: 'x', tag: '  bofu  ' }]);
  assert.equal(r.tags[0], 'bofu');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
