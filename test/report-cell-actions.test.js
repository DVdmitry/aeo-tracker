/**
 * Bug 3 regression — the Domain SOV cell-action atom must not render an
 * empty `href="#"` anchor (clicking it would jump to top of page, which
 * is a UX dead-end). Atom is now a static <span class="cell-action--info">.
 *
 * Source of fix: lib/report/html.js:1060 (anchor → span).
 *
 * Scan rule: generated HTML must contain zero `href="#"` substrings. The
 * <a href="#fragment-id"> style (non-empty fragments — e.g. deep-links
 * to bento section ids) is fine; only the bare empty-anchor pattern is
 * banned.
 */

import assert from 'node:assert/strict';
import { renderHtml } from '../lib/report/html.js';

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (err) { failed++; console.log(`  ✗ ${name}\n    ${err.message}`); }
}

// Minimal stub mirroring the html-render-smoke shape, trimmed to just what
// the Domain SOV cell-action atom needs to render.
const stubSnapshot = {
  date: '2026-05-19',
  brand: 'TestBrand',
  domain: 'testbrand.com',
  score: 50, mentions: 1, total: 2, errors: 0,
  results: [],
  topCompetitors: [],
  topCanonicalSources: [],
  topDomains: [
    { host: 'g2.com', count: 3, share: 0.30 },
    { host: 'reddit.com', count: 2, share: 0.20 },
    { host: 'capterra.com', count: 2, share: 0.20 },
    { host: 'producthunt.com', count: 1, share: 0.10 },
    { host: 'hackernoon.com', count: 1, share: 0.10 },
    { host: 'dev.to', count: 1, share: 0.10 },
  ],
};

const stubSummary = {
  meta: { brand: 'TestBrand', domain: 'testbrand.com', date: '2026-05-19', prevDate: null, queryCount: 1, providerCount: 1, runId: 'test' },
  score: 50, scorePrev: null,
  trend: [50], trendDates: ['2026-05-19'],
  engines: [{ provider: 'openai', label: 'ChatGPT', model: 'gpt-test', kind: 'gpt-test', cells: ['yes'], pct: 100, hits: 1, total: 1, citations: 0, delta: null, series: [100] }],
  coverage: { yes: 1, src: 0, no: 0, error: 0, total: 1 },
  competitors: [],
  sources: [],
  quotes: [],
  citationOnly: [],
  actions: [],
  positionMatrix: [],
  totalCitations: 6, totalCitationsPrev: null,
  regionCount: 1, regions: [],
  sessionCostUsd: 0, totalCostUsd: 0,
  costBreakdown: [],
  costTrend: [0],
  topDomains: stubSnapshot.topDomains,
  topCanonicalSources: [],
  crawlability: null,
  authorityPresence: null,
  adsDetected: null,
  outreachTemplates: [],
  citationClassification: null,
  cells: [],
};

console.log('\nBug 3 — Domain SOV cell-action no longer renders empty href="#"');

test('renderHtml output contains zero href="#" empty anchors', () => {
  const html = renderHtml(stubSummary, [stubSnapshot]);
  const emptyAnchorMatches = html.match(/href="#"/g) || [];
  assert.equal(
    emptyAnchorMatches.length,
    0,
    `expected zero href="#" empty anchors, found ${emptyAnchorMatches.length}`,
  );
});

test('Domain SOV cell-action label still renders with the topDomains count', () => {
  const html = renderHtml(stubSummary, [stubSnapshot]);
  // The atom is now <span>, but the visible text must still be there so the
  // UX scan-level meaning (legend showing N domains) stays intact.
  assert.ok(/All 6 domains/.test(html), 'cell-action label text missing from rendered HTML');
});

test('Domain SOV cell-action carries the non-clickable variant class', () => {
  const html = renderHtml(stubSummary, [stubSnapshot]);
  assert.ok(/cell-action--info/.test(html), 'cell-action--info modifier class missing — CSS arrow/hover reset will not apply');
});

test('Other report-level fragment anchors (#section-ids) are unaffected', () => {
  const html = renderHtml(stubSummary, [stubSnapshot]);
  // Deep-link anchors to bento sections (e.g. href="#visibility") are a
  // legitimate UX pattern and must continue to render. We assert that at
  // least one section-id-style fragment anchor still exists in the output
  // so this test doesn't accidentally pass against a stripped-down report.
  const fragmentAnchors = html.match(/href="#[a-zA-Z][a-zA-Z0-9_-]+"/g) || [];
  assert.ok(
    fragmentAnchors.length > 0,
    'expected at least one non-empty fragment anchor (section deep-links) in rendered HTML',
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
