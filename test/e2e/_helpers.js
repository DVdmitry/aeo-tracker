/**
 * E2E test helpers — shared utilities for `node --test test/e2e/*.test.js`.
 *
 * Replay-mode call sites in bin/aeo-tracker.js (per auditor verdict):
 *   247-255  — header comment block documenting replay mode
 *   257-293  — _extractFromRaw (provider-shape unpacker)
 *   295-310  — _tryReplay (the actual read + JSON.parse, now hardened)
 *   341-349  — _resolveReplaySource (latest-snapshot resolver)
 *  1919-1928 — argv → replaySrcDate resolution
 *  2025-2027 — per-cell replay dispatch inside the run loop
 *  3784-3787 — parseArgs flag definition
 *  3860-3863 — argv → options mapping
 *
 * When refactoring replay, sweep ALL of these sites.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const BIN = join(REPO_ROOT, 'bin', 'aeo-tracker.js');
export { REPO_ROOT };

/**
 * Create an isolated temp project directory, run `fn(tmpDir)`, and always
 * clean up the directory in `finally`. Async-aware — awaits the callback so
 * either sync or async `fn` works.
 */
export async function withTmpProject(prefix, fn) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  try { return await fn(dir); }
  finally { rmSync(dir, { recursive: true, force: true }); }
}

/**
 * Spawn the CLI as a subprocess. Strips inherited npm_* env vars (Risk 1)
 * and injects a fake OPENAI_API_KEY when one is not provided (Risk 2) so
 * accidental live-API hits fail fast with key rejection instead of burning
 * credits.
 *
 * Pass `opts.cwd` to run inside a tmp project; `opts.env` to overlay extra
 * vars; `opts.timeout` to override the 30s default.
 */
export function spawnCli(args, opts = {}) {
  const env = { ...process.env, ...(opts.env || {}) };
  for (const k of Object.keys(env)) {
    if (k.startsWith('npm_')) delete env[k];
  }
  if (!env.OPENAI_API_KEY) env.OPENAI_API_KEY = 'test-key-do-not-use-real';

  return spawnSync(process.execPath, [BIN, ...args], {
    encoding: 'utf-8',
    stdio: 'pipe',
    env,
    cwd: opts.cwd,
    timeout: opts.timeout || 30000,
  });
}

/**
 * Spawn an arbitrary subprocess (npm, npx, etc.) with the same env hygiene
 * as `spawnCli`. Used by `installFromPack` which needs to invoke `npm`.
 */
export function spawnProc(cmd, args, opts = {}) {
  const env = { ...process.env, ...(opts.env || {}) };
  for (const k of Object.keys(env)) {
    if (k.startsWith('npm_')) delete env[k];
  }
  return spawnSync(cmd, args, {
    encoding: 'utf-8',
    stdio: 'pipe',
    env,
    cwd: opts.cwd,
    timeout: opts.timeout || 120000,
  });
}

/**
 * Assert exit code with verbose diagnostics. spawnSync result mismatches are
 * notoriously hard to debug from a bare `assert.equal(r.status, 0)` — surface
 * stdout/stderr in the error message so the failure is self-explaining.
 */
export function assertExitCode(result, expected, msg = '') {
  if (result.status !== expected) {
    const where = msg ? ` (${msg})` : '';
    const err = new Error(
      `expected exit code ${expected}, got ${result.status}${where}\n` +
      `--- stdout ---\n${result.stdout || '(empty)'}\n` +
      `--- stderr ---\n${result.stderr || '(empty)'}\n`,
    );
    throw err;
  }
}

/**
 * Install a pre-packed tarball into `intoDir`. Uses --ignore-scripts to avoid
 * the prepublishOnly recursion (Risk 5: the package's prepublishOnly runs
 * `npm test`, which would re-enter the E2E suite and loop indefinitely).
 *
 * `npm install` requires a package.json in cwd — create a stub first.
 */
export function installFromPack(tarballPath, intoDir) {
  // Minimal stub package.json so `npm install` has a target.
  writeFileSync(join(intoDir, 'package.json'), JSON.stringify({
    name: 'aeo-platform-e2e-host',
    version: '0.0.0',
    private: true,
  }));
  return spawnProc('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarballPath], {
    cwd: intoDir,
    timeout: 120000,
  });
}
