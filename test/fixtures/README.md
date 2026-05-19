# Test fixtures

This directory holds two kinds of fixtures:

1. **Top-level files** (`q2-gemini-unverified-retailers.json`, `gemini-q2-voice-checkout-excerpt.txt`) — historical real-response pins for specific parser/extractor regressions. Documented inline where they're consumed.
2. **Sub-directories** — synthetic snapshots and inputs used by the E2E CLI suite under `test/e2e/`.

## Sub-directory inventory (E2E)

| Path | Purpose |
|---|---|
| `aeo-responses/stable/` | Healthy replay snapshot — 9 raw provider responses (3 queries × 3 providers) + `_summary.json`. `TestBrand` is mentioned in some cells, not in others — produces a non-trivial score. |
| `aeo-responses/regression/` | Same raw files as `stable/`, but `_summary.json.score` bumped to 80 to simulate a baseline that a fresh run (producing 50) regresses against. |
| `aeo-responses/all-invisible/` | 9 raw responses with the brand name scrubbed — competitors only. Drives the "score 0, all-no" path. |
| `aeo-responses/all-errored/` | 9 raw files containing malformed JSON to drive the exit-code-3 "all providers failed" path. Validates `_tryReplay` hardening (try/catch around `JSON.parse`) and the upstream `mention='error'` cascade. |
| `manual-paste/` | `q1.txt` / `q2.txt` / `q3.txt` — plausible AI-engine outputs in the format a user would paste from a browser-only engine (Perplexity Pro, Claude.ai, etc). |
| `diff-pair/` | `yesterday-summary.json` / `today-summary.json` — minimal `_summary` pair (score 40 → 50) for the `diff` command. |
| `access-logs/sample.log` | ≥50 lines of Combined Log Format mixing AI bot UAs (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, Bytespider, Applebot) with human UAs (Mozilla / Safari / Chrome / Firefox / mobile). Drives `lib/report/log-parser.js`. |

## Provenance

- **Initial seed (2026-05-19):** synthetic. The real `aeo-responses/2026-05-13/` snapshot was ~250 KB total — 10× over the ≤50 KB budget for the E2E tree. Synthetic fixtures match the shape contracts in `bin/aeo-tracker.js::_extractFromRaw` (openai: `choices[0].message.content` + `annotations[].url_citation.url`; anthropic: `content[].text` + `content[].type === 'web_search_tool_result'`; gemini: `candidates[0].content.parts[].text` + `groundingMetadata.groundingChunks[].web.uri`).
- **Brand:** `TestBrand` / `testbrand.com` everywhere. Never a real brand — keeps these fixtures portable across owner audits.
- **Competitors:** `CompetitorA` / `CompetitorB`. Deliberately generic.

## Size budget

E2E fixture tree must stay ≤50 KB total (plan acceptance A). Run:

```bash
du -ch test/fixtures/aeo-responses test/fixtures/manual-paste test/fixtures/diff-pair test/fixtures/access-logs | tail -1
```

If over budget, trim raw responses — never trim `_summary.json` (downstream consumers read several keys).

## Regen instructions

These are static — they should not drift with real engine output changes (they're not pinning real engine behavior). Edit by hand. Keep `_extractFromRaw` shape requirements in mind when editing raw response files.

## What NOT to ship

The `test/` directory is excluded from the npm tarball by `package.json::files` (whitelist `bin/`, `lib/`, `examples/`, `README.md`, `CHANGELOG.md`, `LICENSE`). Verified by `npm run test:pack-files`.

---

## Historical top-level fixtures

The next section preserved verbatim from the prior README for the two top-level real-response files.

### When to rotate (historical pins)

Re-capture fixtures when any of these is true:

1. **Calendar drift** — fixtures older than ~6 weeks. Engine output style changes with model updates; stale fixtures test yesterday's behavior.
2. **New provider added** — capture a sample response from the new engine.
3. **Model upgrade** — provider bumped to a new model version.

### What NOT to do

- Don't hand-edit historical-pin fixture files to make tests pass — if an engine changed output, the fixture should reflect it. (This rule does NOT apply to the synthetic E2E sub-directories above.)
- Don't commit fixtures with PII or API keys — verify before copying.
