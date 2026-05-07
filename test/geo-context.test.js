import assert from 'node:assert/strict';
import { parseGeoFlag, wrapQueryForRegion, REGIONS, listRegionCodes } from '../lib/report/geo-context.js';

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (err) { failed++; console.log(`  ✗ ${name}\n    ${err.message}`); }
}

console.log('\nparseGeoFlag');

test('parses single code', () => {
  const r = parseGeoFlag('us');
  assert.equal(r.regions.length, 1);
  assert.equal(r.regions[0].code, 'us');
  assert.deepEqual(r.invalid, []);
});

test('parses comma-separated codes', () => {
  const r = parseGeoFlag('us,uk,de');
  assert.equal(r.regions.length, 3);
  assert.deepEqual(r.regions.map(x => x.code), ['us', 'uk', 'de']);
});

test('case-insensitive codes', () => {
  const r = parseGeoFlag('US,De,UK');
  assert.equal(r.regions.length, 3);
});

test('whitespace tolerated', () => {
  const r = parseGeoFlag('us, uk , de');
  assert.equal(r.regions.length, 3);
});

test('unknown codes go to invalid bucket', () => {
  const r = parseGeoFlag('us,zz,de,xx');
  assert.equal(r.regions.length, 2);
  assert.deepEqual(r.invalid, ['zz', 'xx']);
});

test('empty / falsy input → consistent empty shape', () => {
  assert.deepEqual(parseGeoFlag(''),         { regions: [], invalid: [] });
  assert.deepEqual(parseGeoFlag(null),       { regions: [], invalid: [] });
  assert.deepEqual(parseGeoFlag(undefined),  { regions: [], invalid: [] });
});

console.log('\nwrapQueryForRegion');

test('wraps query with region preamble', () => {
  const wrapped = wrapQueryForRegion('best CRM 2026', REGIONS.de);
  assert.ok(wrapped.includes('German market'));
  assert.ok(wrapped.includes('best CRM 2026'));
  assert.ok(wrapped.startsWith('('));
});

test('null region passes query through unchanged', () => {
  assert.equal(wrapQueryForRegion('best CRM', null), 'best CRM');
  assert.equal(wrapQueryForRegion('best CRM', undefined), 'best CRM');
});

console.log('\nlistRegionCodes');

test('returns comma-separated code list', () => {
  const codes = listRegionCodes();
  assert.ok(codes.includes('us'));
  assert.ok(codes.includes('uk'));
  assert.ok(codes.includes('de'));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
