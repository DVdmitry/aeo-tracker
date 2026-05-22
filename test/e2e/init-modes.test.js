/**
 * E2E — `init` non-interactive precondition gates.
 *
 * Scope:
 *   P0-2  — `init --yes --auto --brand=X --domain=x.com` passes the precondition
 *           block (exit 0, prints "precondition-ok" under AEO_TRACKER_DRY_RUN=1).
 *   P0-3  — `init --yes --manual --brand=X --domain=x.com` passes too — `--manual`
 *           is one of the three allowed mode flags (auto / manual / keywords).
 *   P0-4  — `init --yes --brand=X --domain=x.com` (NO mode flag) fails fast with
 *           exit 1 and a stderr message naming the three valid flags.
 *
 * Why DRY_RUN: the precondition block exits early at `bin/aeo-tracker.js:976-979`
 * when `AEO_TRACKER_DRY_RUN=1`, BEFORE any LLM brainstorm / live HTTP fetch.
 * This lets us exercise the flag-validation contract without burning credits
 * or needing a network. Same pattern is used by `install-pack.test.js`.
 *
 * No fixtures needed — all three tests are config-write only.
 */
import test from 'node:test';
import assert from 'node:assert';
import { withTmpProject, spawnCli, assertExitCode } from './_helpers.js';

const COMMON_ARGS = ['init', '--yes', '--brand=TestBrand', '--domain=testbrand.com'];
const DRY = { AEO_TRACKER_DRY_RUN: '1' };

test('P0-2 — init --yes --auto passes precondition gate', async () => {
  await withTmpProject('aeo-e2e-init-auto-', (dir) => {
    const r = spawnCli([...COMMON_ARGS, '--auto'], { cwd: dir, env: DRY });
    assertExitCode(r, 0, 'init --auto should hit precondition-ok under DRY_RUN');
    assert.ok(
      r.stdout.includes('precondition-ok'),
      `expected "precondition-ok" in stdout, got: ${r.stdout}`,
    );
  });
});

test('P0-3 — init --yes --manual passes precondition gate', async () => {
  await withTmpProject('aeo-e2e-init-manual-', (dir) => {
    const r = spawnCli([...COMMON_ARGS, '--manual'], { cwd: dir, env: DRY });
    assertExitCode(r, 0, 'init --manual should hit precondition-ok under DRY_RUN');
    assert.ok(
      r.stdout.includes('precondition-ok'),
      `expected "precondition-ok" in stdout, got: ${r.stdout}`,
    );
  });
});

test('P0-4 — init --yes with NO mode flag exits 1 with actionable stderr', async () => {
  await withTmpProject('aeo-e2e-init-no-mode-', (dir) => {
    // Deliberately omit --auto / --manual / --keywords.
    const r = spawnCli(COMMON_ARGS, { cwd: dir, env: DRY });
    assertExitCode(r, 1, 'init without mode flag should fail fast');
    // The stderr panel must name the three valid flags so the operator
    // can self-recover without reading the source.
    assert.ok(
      /--auto/.test(r.stderr) && /--manual/.test(r.stderr) && /--keywords/.test(r.stderr),
      `stderr should list --auto / --manual / --keywords, got: ${r.stderr}`,
    );
  });
});
