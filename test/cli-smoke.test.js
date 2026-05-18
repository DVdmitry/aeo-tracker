/**
 * Smoke-test the CLI dispatcher: --version and --help must exit 0 without
 * crashing. Replaces the previous `npm run test:cli` shell one-liner that
 * piped help to /dev/null — that path doesn't exist on Windows, so the
 * test always failed there and masked real CLI regressions.
 *
 * spawnSync with stdio:'pipe' captures output instead of streaming it,
 * keeping `npm test` quiet on success.
 *
 * 1.0.3 additions: three regression cases for the cmdInit precondition
 * (Fix 1) and the cmdRunManual pre-flight check (Fix 7). All use
 * AEO_TRACKER_DRY_RUN=1 to exit init right after the precondition without
 * touching network/DNS/filesystem — keeps the test deterministic and CI-safe.
 */

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const PROJ = dirname(dirname(fileURLToPath(import.meta.url)));
const BIN = join(PROJ, 'bin', 'aeo-tracker.js');

function run(arg) {
  const r = spawnSync(process.execPath, [BIN, arg], { stdio: 'pipe', encoding: 'utf-8' });
  if (r.status !== 0) {
    console.error(`CLI ${arg} exited ${r.status}`);
    if (r.stderr) console.error(r.stderr);
    process.exit(1);
  }
  if (!r.stdout || r.stdout.trim().length === 0) {
    console.error(`CLI ${arg} produced no output`);
    process.exit(1);
  }
}

run('--version');
run('--help');

// ─── Fix 1 regression: --yes --keywords without --auto/--manual must NOT fail
//     precondition. Uses AEO_TRACKER_DRY_RUN=1 to short-circuit right after
//     the gate so we don't hit network DNS for x.com.

(function testKeywordsModeAccepted() {
  const r = spawnSync(
    process.execPath,
    [BIN, 'init', '--yes', '--brand=x', '--domain=x.com', '--keywords=a,b,c'],
    { stdio: 'pipe', encoding: 'utf-8', env: { ...process.env, AEO_TRACKER_DRY_RUN: '1' } },
  );
  if (r.status !== 0) {
    console.error(`Fix 1 regression: init --yes --keywords (no auto/manual) exited ${r.status}`);
    if (r.stderr) console.error('stderr:', r.stderr);
    if (r.stdout) console.error('stdout:', r.stdout);
    process.exit(1);
  }
  if (!r.stdout.includes('precondition-ok')) {
    console.error(`Fix 1 regression: expected stdout to contain 'precondition-ok', got:\n${r.stdout}`);
    process.exit(1);
  }
  if (r.stderr.includes('requires either --auto or --manual')) {
    console.error(`Fix 1 regression: stderr still contains the old "requires either" error`);
    process.exit(1);
  }
})();

// ─── Fix 1 error-message regression: --yes with NO mode flag must error and
//     list all 3 valid modes (--auto, --manual, --keywords).

(function testNoModeFlagListsAllThree() {
  const r = spawnSync(
    process.execPath,
    [BIN, 'init', '--yes', '--brand=x', '--domain=x.com'],
    { stdio: 'pipe', encoding: 'utf-8', env: { ...process.env, AEO_TRACKER_DRY_RUN: '1' } },
  );
  if (r.status === 0) {
    console.error(`Fix 1 regression: init --yes with no mode flag should exit non-zero`);
    process.exit(1);
  }
  if (!r.stderr.includes('--auto') || !r.stderr.includes('--manual') || !r.stderr.includes('--keywords')) {
    console.error(`Fix 1 regression: error message must list all 3 modes, got:\n${r.stderr}`);
    process.exit(1);
  }
})();

// ─── Fix 7 regression: run-manual with empty --from-dir must hard-fail
//     with "Missing query response files" message, not silently skip per file.
//
// Requires a minimal .aeo-tracker.json in cwd so the config-exists gate
// (bin/aeo-tracker.js:2997) passes — we want to test the pre-flight check
// at the start of cmdRunManual, not the config-missing path.

(function testRunManualEmptyDirHardFails() {
  const tmpDir = mkdtempSync(join(tmpdir(), 'aeo-runmanual-'));
  const fromDir = mkdtempSync(join(tmpdir(), 'aeo-from-'));
  try {
    const config = {
      brand: 'test',
      domain: 'test.com',
      queries: ['q1', 'q2', 'q3'],
      providers: [{ name: 'openai', model: 'gpt-5', env: 'OPENAI_API_KEY' }],
    };
    writeFileSync(join(tmpDir, '.aeo-tracker.json'), JSON.stringify(config));

    const r = spawnSync(
      process.execPath,
      [BIN, 'run-manual', 'openai', '--from-dir', fromDir],
      { stdio: 'pipe', encoding: 'utf-8', cwd: tmpDir },
    );
    if (r.status === 0) {
      console.error(`Fix 7 regression: run-manual with empty --from-dir should exit non-zero`);
      process.exit(1);
    }
    if (!r.stderr.includes('Missing query response files')) {
      console.error(`Fix 7 regression: stderr must contain "Missing query response files", got:\n${r.stderr}`);
      process.exit(1);
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
    rmSync(fromDir, { recursive: true, force: true });
  }
})();

console.log('OK: CLI works');
