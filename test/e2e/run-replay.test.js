/**
 * E2E — `run --replay --replay-from=DATE` across the four exit-code contracts.
 *
 *   P0-5  — stable fixtures → exit 0, _summary.json on disk with non-zero
 *           `score` and a `results[]` array of length 3.
 *   P0-6  — same as P0-5 but specifically pins the exit-0 happy path under
 *           --json mode (silent stdout, machine-readable JSON last line).
 *   P0-7  — all-invisible fixtures → mentions === 0 → exit 2.
 *   P0-8  — stable fixtures with a pre-staged previous-day summary forced
 *           80% → today's 33% regresses by 47pp > threshold(10pp) → exit 1.
 *   P0-9  — malformed fixtures → _tryReplay returns null → live fallback →
 *           fake-key 401 → mention='error' for every cell → exit 3.
 *           Verified end-to-end in Phase 0 manual gate 2026-05-20.
 *
 * Every test passes BOTH --replay AND --replay-from (PITFALLS entry 4):
 * --replay-from alone is a no-op for the replay code path.
 *
 * The model in `.aeo-tracker.json` is hard-coded to `gpt-5` (90k TPM) by the
 * `seedReplayProject` helper, NOT `gpt-5-search-api` (6k TPM) — the latter
 * would trip the scheduler's 60s/test pacing stall (PITFALLS entry 5).
 */
import test from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  withTmpProject,
  spawnCli,
  assertExitCode,
  seedReplayProject,
  todayDateString,
} from './_helpers.js';

// Extractor needs both OPENAI + GEMINI keys for buildExtractionProviders.
// Both fakes are fine: extractWithTwoModels catches per-provider 401s
// internally and returns empty verified/unverified — the cell's `mention`
// has already been set by detectMention() before extraction runs.
const KEYS = { GEMINI_API_KEY: 'test-key-do-not-use-real' };

test('P0-5 — stable replay run exits 0 and writes _summary.json', async () => {
  await withTmpProject('aeo-e2e-replay-stable-', (dir) => {
    seedReplayProject(dir, { variant: 'stable' });
    const r = spawnCli(
      ['run', '--replay', '--replay-from=2026-05-13'],
      { cwd: dir, env: KEYS },
    );
    assertExitCode(r, 0, 'stable replay should exit 0');
    const summaryPath = join(dir, 'aeo-responses', todayDateString(), '_summary.json');
    assert.ok(existsSync(summaryPath), `expected _summary.json at ${summaryPath}`);
    const summary = JSON.parse(readFileSync(summaryPath, 'utf-8'));
    assert.ok(Array.isArray(summary.results) && summary.results.length === 3,
      `expected 3 results, got ${summary.results?.length}`);
    assert.ok(typeof summary.score === 'number' && summary.score > 0,
      `expected positive score, got ${summary.score}`);
  });
});

test('P0-6 — stable replay --json prints final JSON blob to stdout, exits 0', async () => {
  await withTmpProject('aeo-e2e-replay-json-', (dir) => {
    seedReplayProject(dir, { variant: 'stable' });
    const r = spawnCli(
      ['run', '--replay', '--replay-from=2026-05-13', '--json'],
      { cwd: dir, env: KEYS },
    );
    assertExitCode(r, 0, 'stable replay --json should exit 0');
    // Last non-blank stdout line must be a JSON object whose `exitCode` is 0.
    const lines = r.stdout.trim().split('\n').filter(Boolean);
    // Find the JSON blob — it may span multiple lines (pretty-printed).
    const firstBrace = r.stdout.indexOf('{');
    const jsonText = r.stdout.slice(firstBrace);
    let payload;
    try { payload = JSON.parse(jsonText); }
    catch (e) {
      throw new Error(`stdout did not end with parseable JSON. last lines: ${lines.slice(-5).join(' | ')}`);
    }
    assert.equal(payload.exitCode, 0, '--json blob exitCode field must match process exit');
    assert.ok(Array.isArray(payload.results) && payload.results.length === 3);
  });
});

test('P0-7 — all-invisible fixtures (zero mentions) → exit 2', async () => {
  await withTmpProject('aeo-e2e-replay-invisible-', (dir) => {
    seedReplayProject(dir, { variant: 'all-invisible' });
    const r = spawnCli(
      ['run', '--replay', '--replay-from=2026-05-13'],
      { cwd: dir, env: KEYS },
    );
    assertExitCode(r, 2, 'all-invisible should exit 2 (zero mentions)');
  });
});

test('P0-8 — score regresses by > threshold vs pre-staged previous run → exit 1', async () => {
  await withTmpProject('aeo-e2e-replay-regress-', (dir) => {
    seedReplayProject(dir, { variant: 'stable' });
    // Pre-stage a fake "previous run" with score 80. The CLI's previous-run
    // scan (bin/aeo-tracker.js:2443-2453) picks the LATEST date strictly
    // less than today — so we put the fake summary one day BEFORE the
    // dynamically computed today, NOT before the replay-from date. Using a
    // date below replay-from (e.g. 2020-01-01) would let 2026-05-13/ win
    // the latest-prev sort, and that directory has no _summary.json — the
    // try/catch then swallows the read, previousScore stays null, and the
    // regression check never fires.
    function dayBefore(yyyymmdd) {
      const d = new Date(yyyymmdd + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() - 1);
      return d.toISOString().slice(0, 10);
    }
    const prevDate = dayBefore(todayDateString());
    const fakePrevDir = join(dir, 'aeo-responses', prevDate);
    mkdirSync(fakePrevDir, { recursive: true });
    writeFileSync(
      join(fakePrevDir, '_summary.json'),
      JSON.stringify({
        date: prevDate,
        brand: 'TestBrand', domain: 'testbrand.com',
        score: 80, mentions: 8, total: 10, errors: 0,
        regressionThreshold: 10,
        results: [],
      }),
    );
    const r = spawnCli(
      ['run', '--replay', '--replay-from=2026-05-13'],
      { cwd: dir, env: KEYS },
    );
    assertExitCode(r, 1, 'stable score 33 vs prev 80 (delta -47) should exit 1 (regression)');
  });
});

test('P0-9 — malformed fixtures → all cells error → exit 3 (Phase 0 gate)', async () => {
  await withTmpProject('aeo-e2e-replay-malformed-', (dir) => {
    seedReplayProject(dir, { variant: 'malformed' });
    const r = spawnCli(
      ['run', '--replay', '--replay-from=2026-05-13'],
      { cwd: dir, env: KEYS },
    );
    assertExitCode(r, 3, 'malformed fixtures + fake key → all-errored contract → exit 3');
    // The actionable panel should name the failing engine and the env var
    // it reads its key from. Stable substring check; do not over-pin copy.
    assert.match(
      r.stderr, /OPENAI_API_KEY/,
      'all-engines-failed panel should reference $OPENAI_API_KEY for recovery',
    );
  });
});
