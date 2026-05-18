/**
 * Fix 5 regression: formatRecoveryPanel must dedupe `allBlockers` by query
 * string. When a single query trips both the LLM industry-fit check AND the
 * commercial-only check, it arrives in the panel twice — the rendered output
 * should show it once with the most specific classification.
 *
 * Also asserts (per architect REV 2 nit R3) that when the loser blocker has
 * a different `message` / `reason` than the winner, the loser's text is
 * discarded but the render path's preference for `search_behavior` keeps the
 * user-visible output complete.
 */

import test from 'node:test';
import assert from 'node:assert';
import { formatRecoveryPanel } from '../lib/init/validator-recovery.js';

test('dedupes the same query when it appears twice with the same behaviour', () => {
  const lines = formatRecoveryPanel({
    allBlockers: [
      { query: 'why X', search_behavior: 'parametric-only' },
      { query: 'why X', search_behavior: 'parametric-only' },
    ],
    candidatePool: [],
    currentQueries: [],
    brand: 'test',
    domain: 'test.com',
    useColor: false,
  });
  const blockedLines = lines.filter(l => l.includes('✗ "why X"'));
  assert.equal(blockedLines.length, 1, 'duplicate query should appear only once in Blocked list');

  const headlineLine = lines.find(l => l.includes('Cannot auto-recover'));
  assert.ok(headlineLine, 'headline must be present');
  assert.ok(headlineLine.includes('1 query/queries'), `headline count should be 1, got: ${headlineLine}`);
});

test('keeps the more specific classification when behaviours differ', () => {
  // retrieval-triggered (specificity 2) vs parametric-only (specificity 3):
  // parametric-only wins.
  const lines = formatRecoveryPanel({
    allBlockers: [
      { query: 'why X', search_behavior: 'retrieval-triggered' },
      { query: 'why X', search_behavior: 'parametric-only' },
    ],
    candidatePool: [],
    currentQueries: [],
    brand: 'test',
    domain: 'test.com',
    useColor: false,
  });
  const reasonLine = lines.find(l => l.includes('non-commercial (search_behavior:'));
  assert.ok(reasonLine, 'reason line must be present');
  assert.ok(
    reasonLine.includes('parametric-only'),
    `expected parametric-only to win specificity tiebreak, got: ${reasonLine}`,
  );
});

test('drops the loser\'s message but render still shows full info via search_behavior', () => {
  // Two parametric-only blockers, different message strings (industry-fit
  // stage vs commercial-only stage). Loser's message is discarded, but the
  // render path prefers search_behavior over message — so user-visible
  // output is complete.
  const lines = formatRecoveryPanel({
    allBlockers: [
      { query: 'why X', search_behavior: 'parametric-only', message: 'industry-fit stage said so' },
      { query: 'why X', search_behavior: 'parametric-only', message: 'commercial-only stage said so' },
    ],
    candidatePool: [],
    currentQueries: [],
    brand: 'test',
    domain: 'test.com',
    useColor: false,
  });
  const blockedLines = lines.filter(l => l.includes('✗ "why X"'));
  assert.equal(blockedLines.length, 1, 'dedupe must collapse to single entry');

  const reasonLine = lines.find(l => l.includes('non-commercial (search_behavior:'));
  assert.ok(reasonLine && reasonLine.includes('parametric-only'),
    'reason rendering uses search_behavior, not message — no info loss for user');
});

test('preserves blockers for distinct queries', () => {
  const lines = formatRecoveryPanel({
    allBlockers: [
      { query: 'why X', search_behavior: 'parametric-only' },
      { query: 'why Y', search_behavior: 'retrieval-triggered' },
    ],
    candidatePool: [],
    currentQueries: [],
    brand: 'test',
    domain: 'test.com',
    useColor: false,
  });
  assert.ok(lines.some(l => l.includes('✗ "why X"')), 'first query must appear');
  assert.ok(lines.some(l => l.includes('✗ "why Y"')), 'second query must appear');

  const headlineLine = lines.find(l => l.includes('Cannot auto-recover'));
  assert.ok(headlineLine.includes('2 query/queries'), `headline count should be 2, got: ${headlineLine}`);
});
