# Phase A — 0.3.0 implementation (commit-by-commit)

> Scope revised after pushback. Phase A leads with business-value features (Perplexity, explicit competitors, canonical sources, diff, `--json`, rich exit codes, latency). Dual-model moved to 0.4.0. Old `report` command stays live with deprecation warning until 0.4.0 replaces it.

---

## Commit 1 — Extract modules (DONE)

Pure refactor, no behaviour change. v0.2.0 users see identical runtime output.

- `lib/config.js` — `CONFIG_FILE`, `DEFAULT_CONFIG`
- `lib/mention.js` — `detectMention`, `findPosition`, `extractCompetitors`
- `lib/providers/openai.js` — `callOpenAI`
- `lib/providers/gemini.js` — `callGemini`
- `lib/providers/anthropic.js` — `callAnthropic`
- `lib/providers/index.js` — `PROVIDERS` map
- `bin/aeo-tracker.js` — thin entry: 496 lines (down from 627)
- `package.json` `files` field: `"lib/"` added
- `report` command: `[DEPRECATED]` warning printed at start

Verified: `--version` prints `0.2.0`, `--help` renders, `node --check` clean.

---

## Commit 2 — Explicit competitors + canonical sources

Idea A + E from pushback.

**Config** (additive, optional):
```json
{
  "competitors": ["Typeform", "Jotform", "NextUX"]
}
```

**`lib/mention.js` additions:**
- `detectExplicitCompetitors(text, competitors)` → case-insensitive exact matches with position
- Existing `extractCompetitors` remains as heuristic fallback when no explicit list

**`_summary.json` additions (non-breaking):**
- `results[i].canonicalCitations: string[]` — dedup'd URLs from citations for that check
- Top-level `topCanonicalSources: [{ url, count }]` — aggregated across all queries
- `results[i].explicitCompetitors: [{ name, position }]` — when config has list

**Value unlocked:**
- Competitive intelligence — "Typeform appeared 7/9 times, you 2/9"
- SEO intelligence — "Pages AI keeps citing for your vertical"

Estimated: ~150 lines.

---

## Commit 3 — Perplexity via Sonar API

Idea B from pushback — closes the biggest coverage gap.

**New file:** `lib/providers/perplexity.js`
- Endpoint: `POST https://api.perplexity.ai/chat/completions`
- Model: `"sonar"` (fastest, cheapest — ~$0.005 per query)
- Returns `{ text, citations, raw }` matching other providers' contract

**Config additions:**
- `providers.perplexity: { model: "sonar", env: "PERPLEXITY_API_KEY" }`
- `aeo-tracker init` writes this by default

**Cost impact:**
- 3 queries × 1 new provider × $0.005 = +$0.015 per run
- Total default run: ~$0.065 (up from $0.05)
- Zero if no `PERPLEXITY_API_KEY` set — skip logic same as other providers

Estimated: ~80 lines.

---

## Commit 4 — `--json` flag + rich exit codes

Ideas C + D from pushback.

**`--json` flag on `run`:**
- `aeo-tracker run --json` → stdout = structured JSON (no ANSI, no progress bars)
- Pipe-friendly: `aeo-tracker run --json | jq '.score'`
- ~20 lines

**Rich exit codes (replaces current 0/1):**
| Code | Meaning |
|---|---|
| 0 | Score stable or improved |
| 1 | Score dropped more than `regressionThreshold` (default 10pp) |
| 2 | All checks returned zero mentions |
| 3 | All providers errored |

**Config:**
- Top-level `regressionThreshold: number` — optional, default `10`

Requires reading previous run from `aeo-responses/` to compute delta. First run (no history) → exit 0 or 2 based on absolute score.

Enables: `aeo-tracker run || slack-alert` with meaningful semantics.

Estimated: ~70 lines.

---

## Commit 5 — Latency + `diff` command

Idea F + original plan item.

**Latency tracking:**
- Wrap `provider.call()` with `Date.now()` deltas
- Write `results[i].elapsedMs: number` into summary
- Free drift signal — silent model swaps often change latency

**`aeo-tracker diff` command:**
- `diff <dateA> <dateB>` — compare two specific runs
- `diff --last 2` — last two runs
- `diff --since <date>` — progression from date to latest

Output: terse terminal table (no charts, no quotes — those are Phase B). Exit code from Commit 4 logic.

`lib/diff.js` — pure function `diff(summaryA, summaryB) → { scoreDelta, cellChanges, newCompetitors, lostCompetitors, sourcesMovement }`.

Estimated: ~250 lines.

---

## Commit 6 — Docs + version bump

- `README.md`:
  - "What it does" — add competitors, canonical sources, Perplexity, `--json`, diff
  - Quick start — add `diff` example
  - Cost per run — `~$0.065` default (with Perplexity), `~$0.05` if Perplexity key absent
  - Exit codes section — document 0/1/2/3
  - Roadmap — mark 0.3.0 features DONE, update 0.4.0 preview
- `CHANGELOG.md` (new file) — 0.3.0 entry
- `package.json` — version `0.2.0` → `0.3.0`
- `bin/aeo-tracker.js` header — `v0.3.0-dev` → `v0.3.0`

Estimated: ~150 lines of docs, no production code.

---

## Out of scope for 0.3.0

| Feature | Lands in | Why deferred |
|---|---|---|
| Opt-in `previousModel` per provider | 0.4.0 | Drift-detection without value change; pairs naturally with new report engine |
| Markdown + inline SVG report | 0.4.0 | Requires extract-quotes, SVG primitives, sections — full architecture in `v0.5-report-generator-plan.md` |
| HTML wrapper for reports | 0.5.0 | Additive on top of markdown |
| Multi-brand profiles | 0.6.0+ | Workaround: one folder per brand works fine |
| Rate-limit semaphore per provider | 0.4.0 (if needed) | Current parallelism fine at 4 providers; revisit if user hits rate limits |

---

## Testing

`node --test` with fixtures in `test/`. Coverage target for 0.3.0:
- `lib/mention.js` (including new `detectExplicitCompetitors`)
- `lib/diff.js`
- Summary parsing (v2 additive fields)

Commands smoke-tested manually against the typelessform config.

---

## Effort

| Commit | Est. lines | Est. time |
|---|---|---|
| 1 Extract (done) | 0 net | 1h (done) |
| 2 Competitors + canonical | +150 | 1.5h |
| 3 Perplexity | +80 | 1h |
| 4 `--json` + exit codes | +70 | 1h |
| 5 Latency + diff | +250 | 2h |
| 6 Docs + version | +150 (docs) | 1h |

**Total: ~700 lines, ~7.5 hours remaining.**

---

## Commit 7 — Manual paste mode (0.3.1, DONE)

Added after user feedback: webappski has no Perplexity Sonar API key and runs Perplexity manually each week. The `run-manual` command closes that gap so manual Perplexity (and future Copilot, ChatGPT Pro UI, Claude.ai) results feed into the same pipeline as API runs.

**Shipped:**
- `aeo-tracker run-manual <provider> --from-dir <dir>` — reads `q{N}.txt`, extracts URLs, runs full detection pipeline.
- `extractUrls(text)` in `lib/mention.js` — regex with trailing-punctuation stripping.
- Merges into existing `_summary.json` for today (overwrites prior results for same provider).
- Per-result `source: "manual-paste"` distinguishes origins.

Smoke-test passed: fake 3-query Perplexity paste, score 67% (2/3), tracked competitors detected, canonical sources extracted, exit 0.

---

_Updated: 2026-04-18. **Phase A + Commit 7 complete.** Package at v0.3.1. Syntax clean, smoke-test passed for `run-manual`. Next: real field-run on webappski config with API-only providers and manual Perplexity paste; then Phase B (0.4.0) — opt-in dual-model + new markdown-first report engine._
