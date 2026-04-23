# Phase B — 0.4.0 implementation log

> Predecessor: [phase-a-implementation.md](./phase-a-implementation.md) (v0.3.0 + v0.3.1).
> Architecture plan: [v0.5-report-generator-plan.md](./v0.5-report-generator-plan.md) — markdown sections, SVG primitives, verbatim-quote extraction.
> Revised Phase B scope vs. original plan: **dual-model dropped** — opt-in features tend to collect zero adoption while doubling complexity. Will revisit only if a concrete user need appears.

---

## Commit 8 — SVG primitives (DONE)

Zero-deps inline SVG renderers. Each is a pure function `(data, options) => string`.

- `lib/svg/heatmap.js` — AI × Query grid with coloured cells (`yes`/`src`/`no`/`error`/`missing`). ~60 lines.
- `lib/svg/barchart.js` — horizontal bars for competitors and canonical sources. ~30 lines.
- `lib/svg/sparkline.js` — 80×20 trend mini-chart with endpoint marker. Colour = overall direction (up/down/flat). ~45 lines.
- `lib/svg/deltaArrow.js` — tiny 12×12 triangle/dash indicator. Path-based (not unicode) so rendering is font-independent. ~30 lines.
- `lib/svg/index.js` — barrel export.

Neutral palette hard-coded per D1: `#10b981` / `#ef4444` / `#94a3b8`. Never brand colours.

**Smoke test:** `test/svg-smoke.js` renders all four primitives into `test/svg-smoke-output.html`. Manual visual check in browser confirms correct rendering.

---

## Commit 9 — extract-quotes + section builders (DONE)

- `lib/report/extract-quotes.js` — finds brand/domain mentions in AI response text, extracts ±200 chars around each, breaks on sentence boundaries, strips markdown noise, dedups identical snippets. Falls back to "citation-only" indicator per D5 when brand appears in URLs but not in text.
- `lib/report/sections.js` — nine deterministic section builders:
  - `sectionHeader` — brand, period, domain, generated date
  - `sectionTopNumbers` — up to 5 scannable metrics, no narrative
  - `sectionMatrix` — AI × Query heatmap SVG
  - `sectionDiff` — week-over-week cell changes table, graceful degrade on single run
  - `sectionTrend` — per-query sparklines for >= 2 snapshots
  - `sectionVerbatimQuotes` — **the killer feature** — "What AI Engines Actually Said" with dословные snippets
  - `sectionCompetitors` — barchart of tracked competitors
  - `sectionCanonicalSources` — barchart of canonical URLs (SEO intelligence)
  - `sectionFooter` — metadata, re-run hint

Functional test on synthetic data confirmed snippet extraction, dedup, and section ordering behave correctly.

---

## Commit 10 — markdown renderer + CLI integration (DONE)

- `lib/report/markdown.js` — aggregates sections into the final document. Exports `renderMarkdown(snapshots, rawResponses)` and `parseRawResponse(provider, raw)` for extracting plain text from saved provider-specific JSON.
- Deleted 223 lines: old HTML `generateReport` function and the deprecated `cmdReport` wrapper (Chart.js CDN dependency, brand colours, no markdown output).
- Wrote new `cmdReport` in `bin/aeo-tracker.js` (~60 lines): reads all `_summary.json` chronologically, loads raw responses for the latest snapshot (API JSON or manual-paste `.txt`), calls `renderMarkdown`, writes `aeo-reports/<date>/report.md`.
- Help text, header version (0.3.1 → 0.4.0), `package.json` version bumped.

**End-to-end smoke test** on the Commit 7 manual-paste fixtures:
- 1 run loaded, 3 raw responses parsed
- Matrix heatmap with Perplexity row rendered correctly (YES YES NO)
- 2 verbatim Perplexity quotes extracted into "What AI Engines Actually Said"
- Tracked Competitors barchart: Voiceform (2), Typeform (1)
- Canonical Sources barchart: 4 URLs ranked by frequency
- Diff section gracefully degraded to "only one run available" message
- Footer with re-run instructions

**Output size:** ~5KB markdown including ~2KB of inline SVG for the four charts.

---

## File structure after Phase B

```
bin/aeo-tracker.js            735 lines (CLI dispatch + commands)
lib/
├── config.js                 13
├── mention.js                78 (+ extractUrls, detectExplicitCompetitors)
├── diff.js                   71
├── providers/                5 files, 87 lines total
│   ├── openai.js
│   ├── gemini.js
│   ├── anthropic.js
│   ├── perplexity.js
│   └── index.js
├── svg/                      5 files, ~170 lines total   ← NEW
│   ├── heatmap.js
│   ├── barchart.js
│   ├── sparkline.js
│   ├── deltaArrow.js
│   └── index.js
└── report/                   3 files, ~260 lines total   ← NEW
    ├── extract-quotes.js
    ├── sections.js
    └── markdown.js
```

**Still zero runtime dependencies.** Only node stdlib (`fs`, `path`, `util`).

---

## Deferred (not in 0.4.0)

- **Opt-in `previousModel`** — deferred indefinitely per user judgement. If a customer asks for model-drift detection, ship it in a patch release.
- **HTML wrapper** — 0.5.0.
- **Multi-brand profiles** — 0.6.0 or later, only when WebAppSki has 3+ clients actively using the tool.

---

_Updated: 2026-04-18. Phase B complete at v0.4.0. Next: field-test with real webappski weekly cycle, then 0.5.0 HTML wrapper._
