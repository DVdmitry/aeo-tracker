/**
 * Single-file HTML report renderer — v0.5 "editorial bento" layout.
 *
 * The HTML is self-contained:
 *   - Three variable woff2 fonts (Fraunces / Geist / JetBrains Mono) embedded
 *     as base64 — no CDN dependency, works offline / via email / printed.
 *   - All CSS inline (one `<style>` block).
 *   - Vanilla JS for hero counter + scroll-spy + matrix sub-toggle (~3KB).
 *
 * Structure:
 *   1. Masthead (logo + brand title + run meta + engine pills)
 *   2. Sticky rail (scroll-spy outline of the 6 sections)
 *   3. Hero (dominant UVI number + narrative + 3 KPIs + ghost background)
 *   4. Promote (bridge-card + sponsor-card, side-by-side)
 *   5. Six bento sections (Overview / Visibility / Competitors / Citations /
 *      Actions / Diagnostics) — each is a 6-column grid of `.cell.span-N`
 *   6. Footer reprise CTA
 *   7. Colophon
 *
 * Cells without data DON'T render — bento auto-flow re-collapses around gaps.
 *
 * Tab-based v0.4 layout and v0.3 monolithic scroll are removed in 0.5.0.
 * One production layout = less surface area to maintain.
 */

import {
  TOKENS, ENGINES, esc,
  radar, sparkline,
} from '../svg/index.js';
import {
  sectionSentiment,
  sectionDomainShareOfVoice,
  sectionHistoricalTrend,
  sectionOutreachTemplates,
  sectionCompetitorRadar,
  competitorRadarHtml,
  sectionCrawlability,
  sectionDomainCategories,
  sectionFunnelBreakdown,
  sectionActionableGaps,
  sectionGeoComparison,
  sectionUnifiedVisibilityIndex,
  sectionDiscoverability,
  sectionTopicClusters,
  sectionAuthorityPresence,
  sectionAdsDetection,
  sectionUtmCitations,
} from './sections.js';
import { mdToHtml } from './markdown-to-html.js';
import { computeComponents, computeUVI, computeDiscoverability } from './visibility-index.js';
import { categorizeDomain, aggregateByCategory } from './domain-category.js';
import { clusterQueries } from './topic-cluster.js';
import { aggregateUtmCitations } from './utm-tracker.js';
import { REGIONS } from './geo-context.js';
import { bridgeCss, bridgeMarkup, bridgeJs } from './mc-bridge.js';
import { getFontFaceCss } from './fonts/index.js';

// ─── Constants ──────────────────────────────────────────────────────────────

// UVI score → Emerging/Building/Strong/Dominant bucket. Same thresholds the
// hero animation lands on; the bucket label appears next to the big number.
const BUCKETS = [
  { max: 25,  label: 'Emerging' },
  { max: 50,  label: 'Building' },
  { max: 75,  label: 'Strong' },
  { max: 101, label: 'Dominant' },
];

// Provider slug → CSS variable (--eng-gpt etc.) used as the first link in
// the engine-color fallback chain. Unknown providers fall through to --ink-3.
const ENGINE_VAR = {
  openai:     '--eng-gpt',
  gemini:     '--eng-gem',
  anthropic:  '--eng-cla',
  perplexity: '--eng-perp',
};

// Domain-category slugs that count as "listicle-style" sources (publishers
// that ship ranked-list articles AI engines love to cite).
const LISTICLE_SLUGS = new Set(['review', 'agency', 'blog', 'qna']);

// ─── Small utilities ────────────────────────────────────────────────────────

function stripParens(s) {
  return String(s).replace(/\s*\([^)]*\)\s*/g, ' ').trim();
}

function shortenUrl(u) {
  return String(u).replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function parseSrcUrl(u) {
  try {
    const url = new URL(String(u));
    return {
      domain: url.hostname.replace(/^www\./, ''),
      path: url.pathname === '/' ? '' : url.pathname.replace(/\/$/, ''),
    };
  } catch {
    return { domain: String(u).replace(/^https?:\/\//, '').split('/')[0], path: '' };
  }
}

function pickBucket(score) {
  for (const b of BUCKETS) if (score < b.max) return b.label;
  return 'Dominant';
}

/**
 * Impact tier for a citation publisher — share-of-citations based, NOT raw
 * count. The previous absolute-count threshold (≥3 = HIGH) returned "all
 * three HIGH" on small-N runs (every domain hits ≥3 because the citation
 * pool is dense). Share-based bands stay meaningful regardless of run size.
 *
 * @param {number} share  fraction of total citations from this domain (0..1)
 */
function inferImpact(share) {
  const pct = (share || 0) * 100;
  if (pct >= 15) return { label: 'HIGH', tone: 'bad' };
  if (pct >= 5)  return { label: 'MED',  tone: 'warn' };
  return { label: 'LOW', tone: 'ink-3' };
}

function isListicle(host) {
  return LISTICLE_SLUGS.has(categorizeDomain(host).slug);
}

/**
 * Compute reach of a competitor across the latest run — engines that named
 * them, distinct queries they appeared in. Replaces the "cited as authority
 * on listicles" hardcoded suffix that claimed authority status without ever
 * verifying it. Returns null when the competitor isn't found at all.
 */
function competitorReach(latest, competitorName) {
  if (!latest || !competitorName) return null;
  const lc = String(competitorName).toLowerCase();
  const results = latest.results || [];
  const allProviders = [...new Set(results.map(r => r.provider))];
  const allQueries  = [...new Set(results.map(r => r.query))];
  const enginesNaming = new Set();
  const queriesNaming = new Set();
  for (const r of results) {
    const all = [...(r.competitors || []), ...(r.competitorsUnverified || [])];
    if (all.some(c => String(c).toLowerCase() === lc)) {
      enginesNaming.add(r.provider);
      queriesNaming.add(r.query);
    }
  }
  if (enginesNaming.size === 0) return null;
  return {
    engineCount:  enginesNaming.size,
    totalEngines: allProviders.length,
    queryCount:   queriesNaming.size,
    totalQueries: allQueries.length,
  };
}

/**
 * For each engine compute (citations, mentions); pick the engine with the
 * HIGHEST citations among those with the LOWEST mentions. That's where the
 * lift is most accessible — AI cites your domain there but isn't yet naming
 * the brand. Returns null when no engine has any citations.
 */
function closestToMention(engines) {
  const candidates = (engines || []).filter(e => (e.citations || 0) > 0);
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) => {
    const m = (a.hits || 0) - (b.hits || 0);
    if (m !== 0) return m;
    return (b.citations || 0) - (a.citations || 0);
  });
  return sorted[0];
}

/**
 * 3-tier day-label assignment for action plan rows.
 *
 *   Tier 1 — Day-range labels (`Day 1–2`, `Day 3–5`, ...) when priority
 *            distribution lets us slot actions across a real week.
 *   Tier 2 — Week labels (`Week 1`, `Week 2`) when ≥4 actions get crowded
 *            into Day 1–2 — that's a skew that day-precision fakes signal
 *            we don't have. Honest fallback.
 *   Tier 3 — Hide the chip entirely (`day: null`). Triggered when even
 *            week distribution is degenerate (all priorities identical or
 *            actions array < 2). Renderers should skip the chip when
 *            day === null instead of displaying an empty `DAY` label.
 */
function assignDays(actions) {
  if (!Array.isArray(actions) || actions.length === 0) return [];
  if (actions.length === 1) return [{ ...actions[0], day: null }];
  const allSamePriority = actions.every(a => a.priority === actions[0].priority);
  if (allSamePriority) {
    // Degenerate — every action has the same priority, no signal for time-slotting.
    return actions.map(a => ({ ...a, day: null }));
  }
  const SLOTS = [
    { day: 'Day 1–2', match: a => a.priority === 'high' },
    { day: 'Day 3–5', match: a => a.priority === 'med' },
    { day: 'Day 5',   match: a => a.priority === 'med' },
    { day: 'Day 7',   match: a => a.priority === 'low' },
  ];
  const slotted = actions.map((a, idx) => {
    let label = SLOTS.find(s => s.match(a))?.day;
    if (!label) label = `Day ${Math.min(7, idx + 1)}`;
    return { ...a, day: label };
  });
  const day12 = slotted.filter(a => a.day === 'Day 1–2').length;
  if (day12 >= 4 && actions.length >= 5) {
    return actions.map((a, idx) => ({ ...a, day: `Week ${Math.min(3, Math.floor(idx / 2) + 1)}` }));
  }
  return slotted;
}

/**
 * Hero narrative text — context-aware single sentence. Logic per INTEGRATION §3a.
 */
function narrativeFor({ coverage, citations, topComp, citationsLeader }) {
  const total = coverage.total || 0;
  const named = coverage.yes || 0;
  const cited = coverage.src || 0;
  const ratio = total > 0 ? named / total : 0;
  // True invisibility — neither named nor cited. Citations counter is also 0
  // here because no engine returned URLs at all (likely robots.txt blocking
  // or all queries errored).
  if (named === 0 && cited === 0 && citations === 0) {
    return `AI engines didn't name <b>or</b> cite you in any of the <b>${total}</b> answers this run. Start with crawlability — make sure AI bots can read your site.`;
  }
  // Cited but never named — the lift target. Engines DO know your domain
  // (returning URLs in citations) but haven't promoted you to a named brand.
  // That's exactly the «closest to mention» signal for actionable outreach.
  if (named === 0 && citations > 0) {
    if (citationsLeader) {
      return `AI engines cited you <b>${citations} times</b> across the <b>${total}</b> answers, but never named you. The lift: turn citations into mentions — <b>${esc(stripParens(citationsLeader.label))}</b> cites you most often, that's the engine to pitch first.`;
    }
    return `AI engines cited you <b>${citations} times</b> across the <b>${total}</b> answers, but never named you. The lift: turn citations into mentions — your domain is in the source pool, just not yet promoted to a named brand.`;
  }
  // Named in some answers but trailing — common gap-narrowing scenario.
  if (ratio < 0.30 && topComp) {
    return `Named in <b>${named} of ${total}</b> answers; cited <b>${citations} times</b>. Closing the gap: <b>${esc(topComp.name)}</b> was named ${topComp.count}× more than you across the same queries.`;
  }
  // Healthy presence.
  return `Named in <b>${named} of ${total}</b> answers, cited <b>${citations} times</b>. You're in the consideration set — push for first-position mentions next.`;
}

function daysBetween(isoDate, today = new Date()) {
  if (!isoDate) return null;
  const d = new Date(isoDate + 'T00:00:00Z');
  if (isNaN(d.getTime())) return null;
  const ms = today.getTime() - d.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

// SVG path for a 60×18 mini-trend line in the hero delta chip.
// Normalises the last 5 score values to fit the box.
function miniDeltaPath(values) {
  const arr = (values || []).slice(-5).filter(v => typeof v === 'number');
  if (arr.length < 2) return null;
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  const range = max - min || 1;
  const w = 60, h = 18, pad = 2;
  const step = (w - pad * 2) / (arr.length - 1);
  const pts = arr.map((v, i) => {
    const x = pad + i * step;
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return [x, y];
  });
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  return { d, last: pts[pts.length - 1] };
}

// SVG path for an in-cell line chart of the score history (Section 01 cell).
// Returns the markup for axes, fill, line, dots, and an annotation on the latest point.
function buildTrendChart(values, dates) {
  const arr = (values || []).filter(v => typeof v === 'number');
  if (arr.length < 2) return '';
  const w = 460, h = 180, padX = 30, padY = 30;
  const min = 0;
  const max = Math.max(100, ...arr);
  const step = (w - padX * 2) / (arr.length - 1);
  const yOf = v => padY + (1 - (v - min) / (max - min)) * (h - padY * 2 - 20);
  const pts = arr.map((v, i) => [padX + i * step, yOf(v)]);
  const last = pts[pts.length - 1];
  const dateLabels = (dates || []).slice(-arr.length);
  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const fillPath = `${linePath} L ${last[0].toFixed(1)} ${h - padY} L ${pts[0][0].toFixed(1)} ${h - padY} Z`;
  const grids = [25, 50, 75].map(g => {
    const y = yOf(g).toFixed(1);
    return `<line class="chart-grid" x1="0" y1="${y}" x2="${w}" y2="${y}"/><text class="chart-axis" x="0" y="${(parseFloat(y) - 5).toFixed(1)}">${g}</text>`;
  }).join('');
  const dots = pts.map((p, i) =>
    `<circle class="chart-dot" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${i === pts.length - 1 ? 4 : 3}"/>`,
  ).join('');
  const xAxis = dateLabels.map((d, i) => {
    const x = pts[i][0].toFixed(1);
    const anchor = i === 0 ? 'start' : i === dateLabels.length - 1 ? 'end' : 'middle';
    const short = (d || '').slice(5); // MM-DD
    return `<text class="chart-axis" x="${x}" y="${h - 5}" text-anchor="${anchor}">${esc(short)}</text>`;
  }).join('');
  const annoY = Math.max(20, last[1] - 50).toFixed(1);
  const anno = `<line class="chart-leader" x1="${last[0].toFixed(1)}" y1="${last[1].toFixed(1)}" x2="${last[0].toFixed(1)}" y2="${annoY}"/><text class="chart-anno" x="${(last[0] - 5).toFixed(1)}" y="${(parseFloat(annoY) - 5).toFixed(1)}" text-anchor="end">${arr[arr.length - 1]} · this run</text>`;
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${grids}<path class="chart-fill" d="${fillPath}"/><path class="chart-line" d="${linePath}"/>${dots}${anno}${xAxis}</svg>`;
}

// ─── Main renderer ──────────────────────────────────────────────────────────

/**
 * Render the AEO HTML report (v0.5 editorial bento layout).
 *
 * @param {Object} summary    SummaryJSON (from buildHtmlSummary)
 * @param {Object[]} [snapshots]
 * @param {Object} [opts]
 * @param {Object} [opts.mcMetadata]      pre-built metadata payload for the bridge
 * @param {number} [opts.daysSinceRun]    age of the latest run in days
 * @param {boolean} [opts.noMcBlock]      skip the MC bridge entirely
 */
export function renderHtml(summary, snapshots = null, opts = {}) {
  const latest = snapshots && snapshots.length ? snapshots[snapshots.length - 1] : null;

  // ── Hero data ──
  let uviScore = summary.score;
  if (latest) {
    try { uviScore = computeUVI(computeComponents(latest)); }
    catch { uviScore = summary.score; }
  }
  const bucket = pickBucket(uviScore);
  const scoreDelta = summary.scorePrev == null ? null : summary.score - summary.scorePrev;
  const totalCitations = summary.totalCitations ?? (summary.engines || []).reduce((s, e) => s + (e.citations || 0), 0);
  const citationsDelta = summary.totalCitationsPrev == null ? null : totalCitations - summary.totalCitationsPrev;
  // Stable tie-break: when multiple competitors share the same mention count,
  // pick the alphabetically-first by name (deterministic, no flip between runs).
  // Earlier code took `find(!accent)` which depended on insertion order — that
  // could make «Siege Media» edge out «First Page Sage» on a tied count just
  // because compList came back in upstream order.
  const topComp = (summary.competitors || [])
    .filter(c => !c.accent)
    .slice()
    .sort((a, b) => {
      if ((b.count || 0) !== (a.count || 0)) return (b.count || 0) - (a.count || 0);
      return String(a.name || '').localeCompare(String(b.name || ''));
    })[0] || null;
  const closest = closestToMention(summary.engines || []);
  const miniDelta = miniDeltaPath(summary.trend || []);

  const narrative = narrativeFor({
    coverage: summary.coverage || {},
    citations: totalCitations,
    topComp,
    citationsLeader: closest,
  });

  // ── Markdown sections (used as embedded markdown panels in some cells) ──
  const wrapMd = (md) => (md && md.trim()) ? `<div class="md-block">${mdToHtml(md)}</div>` : '';
  const sectionsRaw = snapshots ? {
    sentiment:  sectionSentiment(snapshots),
    funnel:     sectionFunnelBreakdown(snapshots),
    geo:        sectionGeoComparison(snapshots),
    utm:        sectionUtmCitations(snapshots),
    ads:        sectionAdsDetection(snapshots),
    outreach:   sectionOutreachTemplates(snapshots),
    authority:  sectionAuthorityPresence(snapshots),
    uvi:        sectionUnifiedVisibilityIndex(snapshots),
  } : {};
  const S = Object.fromEntries(Object.entries(sectionsRaw).map(([k, md]) => [k, wrapMd(md)]));

  // ── Topic clusters (computed on the fly for the Overview cell) ──
  const clusters = latest ? clusterQueries(latest).filter(c => c.topic !== 'uncategorised').slice(0, 4) : [];

  // ── Listicle pitch KPI (Overview cell) ──
  const top4Domains = (summary.topDomains || []).slice(0, 4);
  const listicleCount = top4Domains.filter(d => isListicle(d.host)).length;

  // ── Top 3 gaps preview (Overview cell) ──
  const top3Gaps = (summary.topDomains || [])
    .filter(d => d.host !== summary.meta.domain)
    .slice(0, 3)
    .map((d, i) => ({
      rank: String(i + 1).padStart(2, '0'),
      host: d.host,
      count: d.count,
      share: d.share || 0,
      impact: inferImpact(d.share),
    }));

  // ── Domain categories (Citations cell) ──
  const categories = aggregateByCategory(summary.topDomains || []).slice(0, 6);

  // ── Action plan (Actions cell) — heuristic day labels ──
  const actionPlan = assignDays(summary.actions || []);

  // ── Site readiness (Diagnostics cell) ──
  const discover = computeDiscoverability(summary.crawlability);
  const crawlSummary = summary.crawlability?.summary;

  // ── Cost breakdown (Diagnostics cell) — exclude classify-tier rows ──
  const ENGINE_LABELS_MATCH = ['ChatGPT', 'Gemini', 'Claude', 'Perplexity'];
  const engineCosts = (summary.costBreakdown || []).filter(c => ENGINE_LABELS_MATCH.includes(c.label));

  // ── UTM citations (Diagnostics cell) ──
  const utmAgg = latest ? aggregateUtmCitations(latest.results || [], summary.meta.domain) : null;

  // ── MC bridge state-aware markup (5 states already encoded in mc-bridge.js) ──
  // Hero promote-row uses the `compact` variant — heading + lede + button + pill
  // only, height ~280px to match the sponsor card. Full variant (chips list +
  // payload preview + expanded hints) is reserved for standalone contexts.
  const mcBridgeMarkup = (!opts.noMcBlock && opts.mcMetadata)
    ? bridgeMarkup({
        brand: summary.meta?.brand || '',
        domain: summary.meta?.domain || '',
        queryCount: opts.mcMetadata.aggregates?.totalQueries || 0,
        variant: 'compact',
      })
    : '';
  const mcBridgeBootstrap = (!opts.noMcBlock && opts.mcMetadata)
    ? bridgeJs(opts.mcMetadata, {
        queryCount: opts.mcMetadata.aggregates?.totalQueries || 0,
        daysSinceRun: Number(opts.daysSinceRun) || 0,
      })
    : '';

  // ── CSS bundle ──
  const css = getFontFaceCss() + '\n' + renderCss() + (mcBridgeMarkup ? bridgeCss : '');

  // ────────────────────── HTML assembly ──────────────────────
  // Each section builds its cells conditionally — empty data = cell omitted.

  // Engine pills next to the masthead.
  const enginePills = (summary.engines || [])
    .map(e => `<span class="eng-pill" style="--c: var(${ENGINE_VAR[e.provider] || '--ink-3'}, var(--ink-3))" title="${esc(e.label)}"></span>`)
    .join('');

  // Hero KPIs.
  const heroKpiCells = [];
  // KPI 1 — mention rate
  heroKpiCells.push(`
    <div class="hero-kpi">
      <span class="hero-kpi-label">Mention rate</span>
      <div class="hero-kpi-row">
        <span class="hero-kpi-num">${summary.coverage.yes}</span>
        <span class="hero-kpi-num-sub">/ ${summary.coverage.total} cells</span>
      </div>
      <span class="hero-kpi-context">${summary.coverage.yes === 0
        ? 'No engine named you. <b>Citation pickup</b> is the unlock.'
        : `Mentioned by ${summary.coverage.yes} of ${summary.coverage.total} cells.`}</span>
    </div>`);
  // KPI 2 — citations
  const citationsContext = closest
    ? `<span class="hero-kpi-context" style="--c: var(${ENGINE_VAR[closest.provider] || '--ink-3'}, var(--ink-3))">Closest to mention: <span class="e">${esc(stripParens(closest.label))}</span> · ${closest.citations} cites</span>`
    : '<span class="hero-kpi-context">No citations yet — make sure your domain is in robots.txt allowlist.</span>';
  heroKpiCells.push(`
    <div class="hero-kpi">
      <span class="hero-kpi-label">Citations earned</span>
      <div class="hero-kpi-row">
        <span class="hero-kpi-num">${totalCitations}</span>
        ${citationsDelta != null
          ? `<span class="hero-kpi-num-sub ${citationsDelta > 0 ? 'pos' : citationsDelta < 0 ? 'neg' : ''}">${citationsDelta > 0 ? '+' : ''}${citationsDelta} vs last</span>`
          : ''}
      </div>
      ${citationsContext}
    </div>`);
  // KPI 3 — top competitor. Context line is reach-based (engines naming +
  // queries naming), computed from latest results — replaces the v0.5 «cited
  // as authority on listicles» claim that was hardcoded regardless of data.
  if (topComp) {
    const latestForReach = snapshots ? snapshots[snapshots.length - 1] : null;
    const reach = competitorReach(latestForReach, topComp.name);
    let reachLine;
    if (reach && reach.engineCount === reach.totalEngines && reach.totalEngines > 0) {
      reachLine = `Named by <b>all ${reach.totalEngines} engines</b> · ${reach.queryCount} of ${reach.totalQueries} queries`;
    } else if (reach) {
      reachLine = `Named by <b>${reach.engineCount} of ${reach.totalEngines} engine${reach.totalEngines !== 1 ? 's' : ''}</b> · ${reach.queryCount} of ${reach.totalQueries} queries`;
    } else {
      reachLine = `<b>${topComp.count} mention${topComp.count !== 1 ? 's' : ''}</b> across this run`;
    }
    heroKpiCells.push(`
      <div class="hero-kpi">
        <span class="hero-kpi-label">Top competitor</span>
        <div class="hero-kpi-row">
          <span class="hero-kpi-num" style="font-size: 22px; line-height: 1.2; font-family: var(--display)">${esc(topComp.name)}</span>
        </div>
        <span class="hero-kpi-context">${reachLine}</span>
      </div>`);
  }

  const deltaLine = (() => {
    if (scoreDelta == null) return '<span class="hero-delta">▪ Baseline</span>';
    const cls = scoreDelta > 0 ? 'pos' : scoreDelta < 0 ? 'neg' : '';
    const arr = scoreDelta > 0 ? '▲' : scoreDelta < 0 ? '▼' : '→';
    const sign = scoreDelta > 0 ? '+ ' : scoreDelta < 0 ? '' : '';
    const miniSvg = miniDelta
      ? `<svg class="hero-delta-mini" viewBox="0 0 60 18" preserveAspectRatio="none" aria-hidden="true">
           <path d="${miniDelta.d}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
           <circle cx="${miniDelta.last[0].toFixed(1)}" cy="${miniDelta.last[1].toFixed(1)}" r="2" fill="currentColor"/>
         </svg>`
      : '';
    return `<div class="hero-delta ${cls}"><span class="hero-delta-arrow">${arr}</span><span>${sign}${Math.abs(scoreDelta)} pts</span>${miniSvg}<span style="color: var(--ink-3); font-weight: 400;">vs last run</span></div>`;
  })();

  // ── Section 01 — Overview ──
  const overviewCells = [];
  // Trend chart (always render if ≥2 snapshots)
  if (summary.trend.length >= 2) {
    const trendChart = buildTrendChart(summary.trend, summary.trendDates || []);
    const lift = scoreDelta != null
      ? scoreDelta > 0 ? `Up ${scoreDelta} points across ${summary.trend.length} runs.`
        : scoreDelta < 0 ? `Down ${Math.abs(scoreDelta)} points across ${summary.trend.length} runs.`
        : 'Flat across all runs.'
      : '';
    overviewCells.push(`
      <article class="cell span-4 tall">
        <div class="cell-head"><span class="cell-label">Trend · ${summary.trend.length} runs</span></div>
        <h3 class="cell-title">${scoreDelta > 0 ? 'Score is climbing' : scoreDelta < 0 ? 'Score slipping' : 'Score is steady'}</h3>
        <p class="cell-sub">${esc(lift)}</p>
        <div class="cell-body">${trendChart}</div>
      </article>`);
  }
  // Listicle pitches KPI — subtitle now branches on whether the brand has any
  // mention/citation footprint, instead of asserting «brand isn't on any of
  // them» without verification. We can't web-scrape those listicle pages from
  // here; the honest signal is what the AI answers themselves told us.
  if (top4Domains.length > 0) {
    const named = summary.coverage?.yes || 0;
    const cited = summary.coverage?.src || 0;
    const ratio = listicleCount / top4Domains.length;
    // Title reflects the listicle density of the citation pool. The big-num
    // already shows the raw fraction; the title gives the qualitative read.
    let listicleTitle;
    if (ratio === 0)         listicleTitle = 'No listicles in pool';
    else if (ratio >= 0.75)  listicleTitle = 'Listicle-dominated pool';
    else if (ratio >= 0.5)   listicleTitle = 'Half the pool is listicles';
    else if (ratio >= 0.25)  listicleTitle = 'Some listicles cited';
    else                     listicleTitle = 'Few listicles cited';
    let listicleSub;
    if (named > 0) {
      listicleSub = `${listicleCount} of ${top4Domains.length} cited domains are listicles. You're already named in ${named} answer${named !== 1 ? 's' : ''} — push for inclusion in the listicle pool too.`;
    } else if (cited > 0) {
      listicleSub = `${listicleCount} of ${top4Domains.length} cited domains are listicles. AI cites your URL but doesn't yet rank you on them — outreach is the lift.`;
    } else {
      listicleSub = `${listicleCount} of ${top4Domains.length} cited domains are listicles. ${esc(summary.meta.brand)} isn't in AI's source pool yet — pitching for a listicle slot is the fastest path in.`;
    }
    overviewCells.push(`
      <article class="cell span-2 tall">
        <div class="cell-head"><span class="cell-label">Top gap</span></div>
        <h3 class="cell-title">${esc(listicleTitle)}</h3>
        <p class="cell-sub" style="margin-bottom: 12px;">${listicleSub}</p>
        <div class="big-num ${listicleCount >= 3 ? 'bad' : 'warn'}" style="font-size: 56px;">${listicleCount}<small>/${top4Domains.length}</small></div>
        <a class="cell-action" href="#actions" style="margin-top: auto;">Open actions</a>
      </article>`);
  }
  // Topic clusters
  if (clusters.length > 0) {
    const rows = clusters.map(cl => {
      const w = Math.max(2, cl.rate);
      return `<div class="dom-row" style="border:0; padding:4px 0;">
        <div class="dom-bar-wrap"><span class="dom-name">${esc(cl.topic)}</span><div class="dom-bar" style="--w: ${w}%"></div></div>
        <span class="dom-pct">${cl.rate}%</span>
      </div>`;
    }).join('');
    const allZero = clusters.every(c => c.rate === 0);
    // Title reflects the actual visibility shape: dominant cluster, even
    // spread, or completely absent. Static «Cluster visibility» didn't tell
    // the reader anything they couldn't see in the bar chart.
    let clusterTitle;
    if (allZero) {
      clusterTitle = 'No cluster cracked yet';
    } else if (clusters.length === 1) {
      clusterTitle = `${clusters[0].topic} — sole cluster`;
    } else {
      const sorted = [...clusters].sort((a, b) => (b.rate || 0) - (a.rate || 0));
      const top = sorted[0];
      const second = sorted[1];
      const gap = (top.rate || 0) - (second?.rate || 0);
      if (gap >= 25) clusterTitle = `${esc(top.topic)} dominates`;
      else if (gap >= 10) clusterTitle = `${esc(top.topic)} leads`;
      else clusterTitle = 'Even spread across clusters';
    }
    overviewCells.push(`
      <article class="cell span-3">
        <div class="cell-head"><span class="cell-label">Topic clusters</span></div>
        <h3 class="cell-title">${clusterTitle}</h3>
        <p class="cell-sub">${clusters.length} query cluster${clusters.length !== 1 ? 's' : ''} grouped by shared keywords.</p>
        <div class="cell-body" style="margin-top: 8px;">
          <div style="width: 100%; display: flex; flex-direction: column; gap: 8px;">${rows}</div>
        </div>
      </article>`);
  }
  // Top 3 gaps preview
  if (top3Gaps.length > 0) {
    const items = top3Gaps.map(g => `<li style="border-bottom-color: var(--line-soft); border-bottom-style: dashed;">
      <span class="comp-rank">${g.rank}</span>
      <span><span class="comp-name">${esc(g.host)}</span><br><span style="font-family: var(--mono); font-size: 10px; color: var(--ink-3);">cited ${g.count}× · ${Math.round((g.share || 0) * 100)}% of citations</span></span>
      <span class="comp-count" style="color: var(--${g.impact.tone}); opacity: 1; font-weight: 600;">·${g.impact.label}</span>
    </li>`).join('');
    // Title surfaces the leader — gives the reader the answer at a glance,
    // not a generic question. Falls back to the question if no top gap.
    const topGap = top3Gaps[0];
    const gapTitle = topGap
      ? (topGap.impact.label === 'HIGH'
          ? `Pitch ${esc(topGap.host)} first`
          : `Start with ${esc(topGap.host)}`)
      : 'Who to pitch this week';
    overviewCells.push(`
      <article class="cell span-3">
        <div class="cell-head"><span class="cell-label">Top 3 gaps preview <span class="merge">full · 05 Actions</span></span></div>
        <h3 class="cell-title">${gapTitle}</h3>
        <ul class="comp-list" style="color: var(--ink);">${items}</ul>
      </article>`);
  }

  // ── Section 02 — Visibility ──
  const visibilityCells = [];
  // Per-engine cards
  if ((summary.engines || []).length > 0) {
    const cards = summary.engines.map(e => {
      const colorVar = ENGINE_VAR[e.provider] || '--ink-3';
      return `<div class="eng-card" style="--c: var(${colorVar}, var(--ink-3)); --w: ${e.pct}%">
        <div class="eng-card-head">
          <span class="eng-name">${esc(stripParens(e.label))}</span>
          <span class="eng-model">${esc(e.model)}</span>
        </div>
        <div class="eng-pct">${e.pct}<sup>%</sup></div>
        <div class="eng-bar"></div>
        <div class="eng-meta"><span>Hits ${e.hits} / ${e.total}</span><span>${e.citations} citations</span></div>
      </div>`;
    }).join('');
    visibilityCells.push(`
      <article class="cell span-6">
        <div class="cell-head"><span class="cell-label">Per-engine visibility <span class="merge">absorbs Coverage shape</span></span></div>
        <h3 class="cell-title">${summary.coverage.yes === 0 ? 'Cited but never named' : `Named in ${summary.coverage.yes}/${summary.coverage.total} cells`}</h3>
        <p class="cell-sub">${summary.coverage.yes === 0
          ? 'Engines see your domain in citations; none surface your brand by name in answers yet.'
          : 'Per-engine breakdown — bar shows mention rate, footnote shows citation count.'}</p>
        <div class="cell-body" style="display: block;"><div class="eng-row">${cards}</div></div>
      </article>`);
  }
  // Query × engine matrix
  if (summary.positionMatrix && summary.positionMatrix.length > 0) {
    const headerCells = (summary.engines || []).map(e =>
      `<div class="mx-h eng" style="--c: var(${ENGINE_VAR[e.provider] || '--ink-3'}, var(--ink-3))">${esc(stripParens(e.label))}</div>`,
    ).join('');
    const rows = summary.positionMatrix.map(row => {
      const queryWords = (row.query || '').split(/\s+/);
      const qpre = queryWords[0] || '';
      const qrest = queryWords.slice(1).join(' ');
      // Each cell carries three view-spans (.mx-v-mention / -position / -sentiment).
      // CSS shows whichever the parent .matrix-grid[data-view] selects so the
      // Mention/Position/Sentiment toggle actually swaps content, not just chrome.
      const sentTone = (s) => s === 'positive' ? 'pos' : s === 'negative' ? 'neg' : 'flat';
      const cells = row.columns.map(col => {
        const status = col.mention;
        const posTxt = (typeof col.position === 'number' && col.position > 0) ? `#${col.position}` : '—';
        const sLabel = col.sentiment?.label || null;
        const sTone  = sLabel ? sentTone(sLabel) : 'flat';
        const sBlock = sLabel
          ? `<span class="mx-v mx-v-sentiment" data-tone="${sTone}" aria-label="${esc(sLabel)}">●</span>`
          : '<span class="mx-v mx-v-sentiment" data-tone="missing" aria-label="unscored">—</span>';
        if (status === 'yes') {
          return `<div class="mx-c yes">
            <span class="mx-v mx-v-mention">named</span>
            <span class="mx-v mx-v-position">${posTxt}</span>
            ${sBlock}
          </div>`;
        }
        if (status === 'src') {
          return `<div class="mx-c cited">
            <span class="mx-v mx-v-mention">cited</span>
            <span class="mx-v mx-v-position">${posTxt}</span>
            ${sBlock}
          </div>`;
        }
        if (status === 'error') {
          const msg = col.errorMessage
            ? `Engine returned error: ${String(col.errorMessage).slice(0, 240)}`
            : 'Engine returned an error for this query.';
          return `<div class="mx-c err" title="${esc(msg)}" tabindex="0" aria-label="${esc(msg)}">
            <span class="mx-v mx-v-mention">err</span>
            <span class="mx-v mx-v-position">err</span>
            <span class="mx-v mx-v-sentiment">err</span>
          </div>`;
        }
        return `<div class="mx-c no">
          <span class="mx-v mx-v-mention">—</span>
          <span class="mx-v mx-v-position">—</span>
          <span class="mx-v mx-v-sentiment">—</span>
        </div>`;
      }).join('');
      return `<div class="mx-q"><span class="qpre">${esc(qpre)}</span>${esc(qrest)}</div>${cells}`;
    }).join('');
    visibilityCells.push(`
      <article class="cell span-6">
        <div class="cell-head">
          <span class="cell-label">Query × engine matrix <span class="merge">heatmap + position + sentiment</span></span>
          <div class="matrix-toggle" role="group" aria-label="Matrix view">
            <button type="button" aria-pressed="true">Mention</button>
            <button type="button" aria-pressed="false">Position</button>
            <button type="button" aria-pressed="false">Sentiment</button>
          </div>
        </div>
        <p class="cell-sub" style="margin: 0;">Each cell is one AI answer. Empty = brand absent.</p>
        <div class="matrix-grid" data-view="mention">
          <div class="mx-h">Query</div>${headerCells}
          ${rows}
        </div>
      </article>`);
  }
  // Geo (only if multi-region)
  if (summary.regionCount > 1 && S.geo) {
    visibilityCells.push(`
      <article class="cell span-6">
        <div class="cell-head"><span class="cell-label">By region · ${summary.regionCount} markets</span></div>
        ${S.geo}
      </article>`);
  }
  // Verbatim quotes (only if populated — currently always empty until v0.5.1 wires it up)
  if ((summary.quotes || []).length > 0) {
    const quotesHtml = summary.quotes.map(q => {
      const en = ENGINES[q.provider] || { label: q.provider, code: '??', color: TOKENS.ink };
      return `<figure class="quote">
        <div class="quote-meta">
          <span class="engine-tag" style="--eng:${en.color}">${esc(en.code)} ${esc(en.label)}</span>
          <span class="quote-query">${esc(q.query)}</span>
        </div>
        <blockquote>${esc(q.text)}</blockquote>
      </figure>`;
    }).join('');
    visibilityCells.push(`
      <article class="cell span-6">
        <div class="cell-head"><span class="cell-label">Verbatim mentions</span></div>
        <h3 class="cell-title">What AI actually said</h3>
        <div class="quotes">${quotesHtml}</div>
      </article>`);
  }

  // ── Section 03 — Competitors ──
  // Same stable tie-break as the hero KPI: count DESC, name ASC. Keeps the
  // ranked list visually consistent with whoever the hero highlights.
  const competitorsCells = [];
  const realComps = (summary.competitors || [])
    .filter(c => !c.accent)
    .slice()
    .sort((a, b) => {
      if ((b.count || 0) !== (a.count || 0)) return (b.count || 0) - (a.count || 0);
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
  if (realComps.length > 0) {
    const maxCount = realComps[0]?.count || 1;
    const items = realComps.slice(0, 8).map((c, i) => {
      const w = Math.round((c.count / maxCount) * 100);
      return `<li><span class="comp-rank">${String(i + 1).padStart(2, '0')}</span><span class="comp-name">${esc(c.name)}</span><span class="comp-bar" style="--w: ${w}%"></span></li>`;
    }).join('');
    const totalMentions = realComps.reduce((s, c) => s + c.count, 0);
    const top3Sum = realComps.slice(0, 3).reduce((s, c) => s + c.count, 0);
    competitorsCells.push(`
      <article class="cell span-3 dark">
        <div class="cell-head"><span class="cell-label">Most-named brands</span></div>
        <h3 class="cell-title" style="color: var(--paper);">${esc(realComps[0].name)} leads</h3>
        <p class="cell-sub" style="color: var(--ink-4);">${realComps.length} distinct competitors named. Top 3 collected ${top3Sum} of ${totalMentions} mentions.</p>
        <ol class="comp-list">${items}</ol>
      </article>`);
  }
  // Combined radar — single SVG with brand polygon overlaid on top-3 avg.
  // Headline branches off the gap between user and avg total: behind on
  // every axis vs leading vs mixed.
  const radarData = snapshots ? competitorRadarHtml(snapshots) : null;
  if (radarData) {
    const u = radarData.userAxes;
    const a = radarData.avgAxes;
    const axisDefs = [
      { key: 'presence',  label: 'Presence'  },
      { key: 'mentions',  label: 'Mentions'  },
      { key: 'rank',      label: 'Rank'      },
      { key: 'sentiment', label: 'Sentiment' },
    ];
    const behindCount = axisDefs.filter(({ key }) => (u[key] || 0) < (a[key] || 0)).length;
    const aheadCount  = axisDefs.filter(({ key }) => (u[key] || 0) > (a[key] || 0)).length;
    let radarTitle;
    if (behindCount === 4) radarTitle = 'Behind on every axis';
    else if (aheadCount === 4) radarTitle = 'Ahead on every axis';
    else if (behindCount > aheadCount) radarTitle = `Behind on ${behindCount} of 4 axes`;
    else if (aheadCount > behindCount) radarTitle = `Ahead on ${aheadCount} of 4 axes`;
    else radarTitle = 'Mixed vs top-3 avg';
    // Mini stats table — gives the reader explicit numbers next to the chart
    // so two near-identical polygons don't read as «зачем график вообще».
    const statRows = axisDefs.map(({ key, label }) => {
      const uv = Math.round(u[key] || 0);
      const av = Math.round(a[key] || 0);
      const d = uv - av;
      const sign = d > 0 ? '+' : '';
      const tone = d > 0 ? 'pos' : (d < 0 ? 'neg' : 'flat');
      return `<div class="radar-row">
        <span class="radar-axis">${label}</span>
        <span class="radar-num">${uv}</span>
        <span class="radar-num radar-num-avg">${av}</span>
        <span class="radar-delta ${tone}">${d === 0 ? '=' : `${sign}${d}`}</span>
      </div>`;
    }).join('');
    competitorsCells.push(`
      <article class="cell span-3 tall">
        <div class="cell-head">
          <span class="cell-label">4-axis radar</span>
        </div>
        <h3 class="cell-title">${esc(radarTitle)}</h3>
        <p class="cell-sub">Each axis 0–100. Larger polygon = stronger signal; orange outside dark = ahead, inside = behind.</p>
        <div class="cell-body" style="display:block;">
          ${radarData.svg}
          <div class="radar-stats" role="table" aria-label="Per-axis values: you vs top-3 average">
            <div class="radar-row radar-head" role="row">
              <span>Axis</span>
              <span>You</span>
              <span>Top-3</span>
              <span>Δ</span>
            </div>
            ${statRows}
          </div>
        </div>
      </article>`);
  }

  // ── Section 04 — Citations ──
  const citationsCells = [];
  if ((summary.topDomains || []).length > 0) {
    const top6 = summary.topDomains.slice(0, 6);
    const ownDomain = summary.meta.domain;
    const rows = top6.map(d => {
      const isOwn = d.host === ownDomain;
      const w = (d.share * 100).toFixed(0);
      return `<div class="dom-row${isOwn ? ' owned' : ''}">
        <div class="dom-bar-wrap"><span class="dom-name"${isOwn ? ' style="color: var(--accent);"' : ''}>${esc(d.host)}</span><div class="dom-bar" style="--w: ${w}%"></div></div>
        <span class="dom-pct"${isOwn ? ' style="color: var(--accent);"' : ''}>${(d.share * 100).toFixed(0)}%</span>
      </div>`;
    }).join('');
    const own = (summary.topDomains || []).find(d => d.host === ownDomain);
    const hasOwn = !!own;
    const ownRow = hasOwn ? '' : `<div class="dom-row owned">
      <div class="dom-bar-wrap"><span class="dom-name" style="color: var(--accent);">${esc(ownDomain)}</span><div class="dom-bar" style="--w: 0%"></div></div>
      <span class="dom-pct" style="color: var(--accent);">0%</span>
    </div>`;
    // Title reflects the actual concentration of the citation pool: own
    // domain present? top-1 dominates? Or even spread? Static «Pitch the top 3»
    // always read the same regardless of whether you're already on the list
    // or not.
    const topDomainsList = summary.topDomains;
    const top1Share = topDomainsList[0]?.share || 0;
    const top3Sum = topDomainsList.slice(0, 3).reduce((s, d) => s + (d.share || 0), 0);
    let domainTitle;
    if (hasOwn) {
      domainTitle = `${esc(ownDomain)} is in the pool — defend it`;
    } else if (top1Share >= 0.30) {
      domainTitle = `${esc(topDomainsList[0].host)} carries the pool`;
    } else if (top3Sum >= 0.60) {
      domainTitle = `Pitch the top 3 first`;
    } else {
      domainTitle = `Citations spread across ${topDomainsList.length} domains`;
    }
    citationsCells.push(`
      <article class="cell span-4">
        <div class="cell-head"><span class="cell-label">Domain share of voice</span><a href="#" class="cell-action">All ${summary.topDomains.length} domains</a></div>
        <h3 class="cell-title">${domainTitle}</h3>
        <p class="cell-sub">These publishers feed AI most of the category citations. ${hasOwn ? 'You\'re in the list — defend it.' : `${esc(ownDomain)} isn't on any of them.`}</p>
        <div class="cell-body" style="display: block;">${rows}${ownRow}</div>
      </article>`);
  }
  if (categories.length > 0) {
    const rows = categories.map(c => `<div class="dom-row" style="grid-template-columns: 1fr auto;">
      <span style="font-size: 12.5px; color: var(--ink);">${esc(c.label)}</span>
      <span class="dom-pct">${(c.share * 100).toFixed(0)}%</span>
    </div>`).join('');
    const top = categories[0];
    const topPct = Math.round((top.share || 0) * 100);
    // Title tone shifts on concentration. Static «Other dominate» also had a
    // grammar bug — singular subject took plural verb. Fixed: "leads" /
    // "dominates" / "Mixed across N categories" depending on shape.
    let categoryTitle;
    if (categories.length === 1) {
      categoryTitle = `Only ${esc(top.label)} cited`;
    } else if ((top.share || 0) >= 0.5) {
      categoryTitle = `${esc(top.label)} dominates`;
    } else if ((top.share || 0) >= 0.3) {
      categoryTitle = `${esc(top.label)} leads`;
    } else {
      categoryTitle = `Mixed across ${categories.length} categories`;
    }
    // Subtitle now reports the concentration so the reader sees the
    // actionable angle without reading rows by themselves.
    let categorySub;
    if (categories.length === 1) {
      categorySub = `Single category in the citation pool — concentrate outreach there.`;
    } else if ((top.share || 0) >= 0.5) {
      categorySub = `${esc(top.label)} carries ${topPct}% of citations — that's where the lift compounds.`;
    } else if ((top.share || 0) >= 0.3) {
      categorySub = `${esc(top.label)} leads at ${topPct}%; lower tiers each need a different outreach play.`;
    } else {
      categorySub = `Citations split across ${categories.length} categories — diversified outreach beats single-channel pushes.`;
    }
    citationsCells.push(`
      <article class="cell span-2">
        <div class="cell-head"><span class="cell-label">By category</span></div>
        <h3 class="cell-title">${categoryTitle}</h3>
        <p class="cell-sub">${categorySub}</p>
        <div class="cell-body" style="display: block;">${rows}</div>
      </article>`);
  }
  if (S.outreach) {
    citationsCells.push(`
      <article class="cell span-6">
        <div class="cell-head"><span class="cell-label">Outreach drafts <span class="merge">${(summary.outreachTemplates || []).length} top domains</span></span></div>
        ${S.outreach}
      </article>`);
  }

  // ── Section 05 — Actions ──
  const actionsCells = [];
  if (actionPlan.length > 0) {
    const actKindLabel = { gap: 'Outreach', defend: 'Defend', compete: 'Content', win: 'Listings' };
    const actPrioLabel = { high: 'High', med: 'Med', low: 'Low' };
    const actPrioClass = { high: 'high', med: '', low: '' };
    const rows = actionPlan.map((a, i) => {
      const cls = actPrioClass[a.priority] || '';
      const prioText = actPrioLabel[a.priority] || a.priority;
      const kindText = actKindLabel[a.kind] || a.kind;
      // Day chip hidden entirely when assignDays returned null (skewed
      // distribution — would be misleading to fake a number).
      const dayChip = a.day ? `<span class="day">${esc(a.day)}</span>` : '';
      return `<div class="act-row">
        <span class="act-num">${String(i + 1).padStart(2, '0')}</span>
        <div class="act-body">
          <h4 class="act-title">${esc(a.title)}</h4>
          <p class="act-detail">${esc(a.detail)}</p>
          <div class="act-meta">
            ${dayChip}
            <span>${esc(kindText)}</span>
          </div>
        </div>
        <span class="act-prio ${cls}">${esc(prioText)}</span>
      </div>`;
    }).join('');
    actionsCells.push(`
      <article class="cell span-6">
        <div class="cell-head">
          <span class="cell-label">Recommended actions <span class="merge">absorbs Actionable Gaps</span></span>
        </div>
        <h3 class="cell-title">${actionPlan.length} ordered moves</h3>
        <p class="cell-sub">Prioritised by visibility-gap impact. Day labels are heuristic — adjust to your week.</p>
        <div class="act">${rows}</div>
      </article>`);
  }

  // ── Section 06 — Diagnostics ──
  const diagnosticsCells = [];
  // Site readiness
  if (discover && crawlSummary) {
    const score = discover.score;
    const tone = score >= 70 ? 'good' : score >= 40 ? 'warn' : 'bad';
    const robotsBytes = summary.crawlability?.robots?.bytes;
    const sitemapUrls = summary.crawlability?.sitemap?.urlCount;
    const total = crawlSummary.totalBots || 0;
    const notBlocked = total - (crawlSummary.blockedCount || 0);
    diagnosticsCells.push(`
      <article class="cell span-3">
        <div class="cell-head"><span class="cell-label">Site readiness <span class="merge">crawlability + discoverability + llms.txt</span></span></div>
        <h3 class="cell-title">${score >= 70 ? 'Fully crawlable' : score >= 40 ? 'Partially crawlable' : 'Blocked'}</h3>
        <div class="big-num ${tone}" style="font-size: 64px;">${score}<small>/100</small></div>
        <div class="cell-body" style="display: block; margin-top: 16px;">
          <div class="ready-row"><span class="label"><span class="ck${crawlSummary.hasRobots ? '' : ' bad'}">${crawlSummary.hasRobots ? '✓' : '✕'}</span>robots.txt</span><span class="meta">${robotsBytes ? `${robotsBytes} bytes` : 'missing'}</span></div>
          <div class="ready-row"><span class="label"><span class="ck${crawlSummary.hasLlmsTxt ? '' : ' warn'}">${crawlSummary.hasLlmsTxt ? '✓' : '!'}</span>llms.txt</span><span class="meta">${crawlSummary.hasLlmsTxt ? 'present' : 'missing'}</span></div>
          <div class="ready-row"><span class="label"><span class="ck${crawlSummary.hasSitemap ? '' : ' bad'}">${crawlSummary.hasSitemap ? '✓' : '✕'}</span>sitemap.xml</span><span class="meta">${sitemapUrls ? `${sitemapUrls} URLs` : 'missing'}</span></div>
          <div class="ready-row"><span class="label"><span class="ck${notBlocked === total ? '' : ' warn'}">${notBlocked === total ? '✓' : '!'}</span>${notBlocked} / ${total} AI crawlers</span><span class="meta">${notBlocked === total ? 'all allowed' : `${total - notBlocked} blocked`}</span></div>
        </div>
      </article>`);
  }
  // Authority presence
  if (S.authority) {
    diagnosticsCells.push(`
      <article class="cell span-3">
        <div class="cell-head"><span class="cell-label">Authority presence</span></div>
        ${S.authority}
      </article>`);
  }
  // Cost
  if (engineCosts.length > 0) {
    const sessionCost = summary.sessionCostUsd || 0;
    const totalTokens = engineCosts.reduce((s, c) => s + (c.inputTokens || 0) + (c.outputTokens || 0), 0);
    const rows = engineCosts.map(c => {
      const provVar = ENGINE_VAR[c.provider] || '--ink-3';
      return `<div class="ready-row" style="grid-template-columns: 1fr auto;${c === engineCosts[engineCosts.length - 1] ? ' border:0;' : ''}">
        <span style="font-size: 12px; color: var(${provVar}, var(--ink-3)); font-weight: 600;">${esc(c.label)}</span>
        <span class="meta">$${(c.costUsd || 0).toFixed(2)}</span>
      </div>`;
    }).join('');
    diagnosticsCells.push(`
      <article class="cell span-2">
        <div class="cell-head"><span class="cell-label">Session cost</span></div>
        <h3 class="cell-title">$${sessionCost.toFixed(2)} / run</h3>
        <p class="cell-sub">${(totalTokens / 1000).toFixed(0)}k tokens · ${engineCosts.length} engine${engineCosts.length !== 1 ? 's' : ''}</p>
        <div class="cell-body" style="display: block; margin-top: 12px;">${rows}</div>
      </article>`);
  }
  // Geo indicator. Title surfaces the actual region label (or "Untargeted"
  // when no --geo was set — engines answered without geographic priming).
  // Static «US only» was a false claim: a default run isn't pinned to US,
  // it's just untargeted prompts AI engines happen to answer with their
  // own implicit defaults.
  const geoRegions = summary.regions || [];
  let geoTitle;
  let geoSub;
  if (summary.regionCount > 1) {
    geoTitle = `${summary.regionCount} regions`;
    geoSub = `Run priced ${summary.regionCount}× — multi-region context active.`;
  } else if (geoRegions.length === 1 && REGIONS[geoRegions[0]]) {
    geoTitle = REGIONS[geoRegions[0]].label;
    geoSub = `Single-region run pinned to ${REGIONS[geoRegions[0]].label}. Add more codes to <code style="font-family:var(--mono);background:var(--paper-2);padding:1px 5px;border-radius:3px;font-size:11px;">--geo</code> for comparative context.`;
  } else {
    geoTitle = 'Untargeted';
    geoSub = `No region context this run — AI engines answered with their own implicit defaults. Add <code style="font-family:var(--mono);background:var(--paper-2);padding:1px 5px;border-radius:3px;font-size:11px;">--geo=us,uk,de</code> for pinned regional context.`;
  }
  diagnosticsCells.push(`
    <article class="cell span-2">
      <div class="cell-head"><span class="cell-label">Geo</span></div>
      <h3 class="cell-title">${esc(geoTitle)}</h3>
      <p class="cell-sub">${geoSub}</p>
      <div class="big-num" style="font-size: 36px; color: var(--ink-2); margin-top: auto;">${summary.regionCount}<small> region${summary.regionCount !== 1 ? 's' : ''}</small></div>
    </article>`);
  // AI ads
  if (summary.adsDetected) {
    const ads = summary.adsDetected;
    const hasAds = (ads.totalCellsWithAdSignal || 0) > 0;
    diagnosticsCells.push(`
      <article class="cell span-2">
        <div class="cell-head"><span class="cell-label">AI ads detected</span></div>
        <h3 class="cell-title">${hasAds ? 'Sponsored slots seen' : 'Clean'}</h3>
        <p class="cell-sub">${hasAds
          ? `${ads.totalCellsWithAdSignal} cell${ads.totalCellsWithAdSignal !== 1 ? 's' : ''} contained sponsored markers.`
          : 'No sponsored slots in answers about your category this run.'}</p>
        <div class="big-num ${hasAds ? 'warn' : 'good'}" style="font-size: 36px; margin-top: auto;">${ads.totalCellsWithAdSignal || 0}<small> ad${ads.totalCellsWithAdSignal === 1 ? '' : 's'}</small></div>
      </article>`);
  }
  // UTM
  if (utmAgg) {
    const hasUtm = utmAgg.totalUtmCitations > 0;
    diagnosticsCells.push(`
      <article class="cell span-2">
        <div class="cell-head"><span class="cell-label">UTM citations</span></div>
        <h3 class="cell-title">${hasUtm ? `${utmAgg.totalUtmCitations} tagged hit${utmAgg.totalUtmCitations !== 1 ? 's' : ''}` : 'No tracker'}</h3>
        <p class="cell-sub">${hasUtm ? 'AI traffic with UTM attribution.' : 'Add UTM tags to track which AI engine drives traffic.'}</p>
        <div class="big-num" style="font-size: 36px; color: var(--ink-${hasUtm ? '2' : '3'}); margin-top: auto;">${hasUtm ? utmAgg.totalUtmCitations : '—'}</div>
      </article>`);
  }

  // ── Section header helper ──
  // Each section starts with a thin dashed strip carrying the number + title.
  const sectionHeader = (num, title) =>
    `<div class="cell span-6" style="background: var(--paper); border-style: dashed; padding: 8px 22px;"><span class="cell-label" style="margin: 0;">${num} / ${title}</span></div>`;

  // ── Render each section ──
  // Empty sections still render their numbered header + a single placeholder
  // cell. This keeps the rail nav numbering continuous (01-06 with no holes)
  // — a missing «04» between «03» and «05» reads as a broken build, not as
  // «no data». Placeholder explains why the section is empty + how to fill it.
  const sectionPlaceholder = (msg) =>
    `<article class="cell span-6 cell-empty">${esc(msg)}</article>`;
  const renderSection = (id, headerLabel, cells, emptyMsg) => {
    const num = headerLabel.split(' / ')[0];
    const title = headerLabel.split(' / ')[1];
    if (cells.length === 0) {
      if (!emptyMsg) return '';  // truly skip when no fallback message provided
      return `<section id="${id}" class="bento">${sectionHeader(num, title)}${sectionPlaceholder(emptyMsg)}</section>`;
    }
    return `<section id="${id}" class="bento">${sectionHeader(num, title)}${cells.join('')}</section>`;
  };

  const sectionsHtml = [
    renderSection('overview',    '01 / Overview',                                     overviewCells,
      'Overview lights up after run #2 — historical trend and topic clusters need ≥2 snapshots to compare.'),
    renderSection('visibility',  '02 / Visibility · per engine, by query',            visibilityCells,
      'No visibility data this run.'),
    renderSection('competitors', '03 / Competitors · who AI named instead',           competitorsCells,
      'No competitors detected — AI engines either didn\'t name brands in their answers, or all queries errored.'),
    renderSection('citations',   '04 / Citations · who AI cites about your category', citationsCells,
      'No citations earned this run. Domains aren\'t in AI engines\' source pools yet — citation pickup is the unlock. Run aeo-tracker run weekly to track this.'),
    renderSection('actions',     '05 / Actions · what to ship this week',             actionsCells,
      'Action plan generates after the LLM-recommendations pass during aeo-tracker report. Re-run report --html to populate.'),
    renderSection('diagnostics', '06 / Diagnostics · site readiness, cost, ads',      diagnosticsCells,
      'Diagnostic data populates during aeo-tracker report — re-run to fetch crawlability, authority, and cost cells.'),
  ].filter(Boolean).join('\n');

  // ── Rail nav (only sections that actually rendered) ──
  const railLinks = [
    ['overview',    '01', 'Overview',    overviewCells.length],
    ['visibility',  '02', 'Visibility',  visibilityCells.length],
    ['competitors', '03', 'Competitors', competitorsCells.length],
    ['citations',   '04', 'Citations',   citationsCells.length],
    ['actions',     '05', 'Actions',     actionsCells.length],
    ['diagnostics', '06', 'Diagnostics', diagnosticsCells.length],
  ].filter(([, , , n]) => n > 0);
  const railHtml = railLinks.map(([id, num, label], i) =>
    `<a href="#${id}"${i === 0 ? ' class="active"' : ''}><span class="rail-num">${num}</span> ${esc(label)}</a>`,
  ).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AEO Visibility · ${esc(summary.meta.brand)} · ${esc(summary.meta.date)}</title>
<style>${css}</style>
</head>
<body>
<main class="page">

  <header class="mast">
    <div>
      <div class="mast-mark"><strong>aeo-tracker</strong></div>
      <h1 class="mast-title">${esc(summary.meta.brand)}<span class="mast-domain">${esc(summary.meta.domain)}</span></h1>
    </div>
    <dl class="mast-meta">
      <div><dt>Run</dt><dd>${esc(summary.meta.date)}</dd></div>
      <div><dt>vs</dt><dd>${esc(summary.meta.prevDate || '—')}</dd></div>
      <div><dt>Queries</dt><dd>${summary.meta.queryCount}</dd></div>
    </dl>
    <div class="mast-engines" title="Engines surveyed this run">${enginePills}</div>
  </header>

  ${railHtml ? `<nav class="rail" aria-label="Section outline">
    <span class="rail-label">Sections</span>
    ${railHtml}
  </nav>` : ''}

  <section class="hero" aria-label="Headline visibility score">
    <div class="hero-ghost" aria-hidden="true">
      <svg viewBox="0 0 600 200" preserveAspectRatio="none">
        <defs>
          <linearGradient id="ghostGrad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stop-color="#B85C16" stop-opacity="0.18"/>
            <stop offset="1" stop-color="#B85C16" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <path d="M0 180 L0 160 L150 158 L300 145 L450 110 L600 60 L600 200 L0 200 Z" fill="url(#ghostGrad)"/>
        <path d="M0 160 L150 158 L300 145 L450 110 L600 60" fill="none" stroke="#B85C16" stroke-opacity="0.35" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>

    <div class="hero-main">
      <div class="hero-kicker">
        <span>Unified Visibility Index</span>
        <span>·</span>
        <span class="bucket">${esc(bucket)}</span>
      </div>
      <div class="hero-num-wrap">
        <span class="hero-num" id="heroNum">${uviScore}</span>
        <span class="hero-num-frac">/ 100</span>
      </div>
      <p class="hero-narrative">${narrative}</p>
      ${deltaLine}
    </div>

    ${heroKpiCells.length > 0
      ? `<aside class="hero-side" aria-label="Supporting metrics">${heroKpiCells.join('')}</aside>`
      : ''}
  </section>

  <div class="promote">
    ${mcBridgeMarkup}
    <article class="promote-card sponsor">
      <div class="promote-kicker">
        <span class="step">${mcBridgeMarkup ? 'Or' : 'Done-for-you'}</span>
        <span>Done-for-you</span>
      </div>
      <h2 class="promote-title">Skip the work — we ship it for you.</h2>
      <p class="promote-lede">
        <strong>Webappski</strong> is the AEO agency behind <code>aeo-tracker</code>. Our <strong>team of AEO professionals</strong> takes this report and executes every action on your behalf — pitches sent, comparison pages written, schemas wired, directories claimed. You review weekly, we deliver. First call free.
      </p>
      <div class="promote-action">
        <a class="btn btn-ghost" href="https://webappski.com/en/aeo-services" target="_blank" rel="noopener">
          Talk to Webappski
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7"/><path d="M8 7h9v9"/></svg>
        </a>
      </div>
    </article>
  </div>

  <div class="layout"><div class="content">
    ${sectionsHtml}
  </div></div>

  ${mcBridgeMarkup ? `<aside class="footer-reprise">
    <div>
      <h3>Done reading? Get the to-do list.</h3>
      <p>The report shows the gap; the plan tells you what to do about it — <strong>5–10 concrete tasks</strong> (write this page, ask this blog to add you, fix this on your site), <strong>~30&nbsp;min each</strong>, in the order that works. Click → you copy stats from this run to your clipboard (scores, citation counts — <strong>no emails, no private content</strong>; check the JSON before sending). Paste in <strong>Mission Control</strong>, the <strong>Webappski team</strong> emails you the checklist.<br/><br/><strong>Currently in development &amp; testing</strong> — <a href="https://webappski.com/en/aeo-mission-control" style="color: var(--accent-ink); font-weight: 600;">see the live demo</a> for a real plan example, and join the waitlist to get yours first.</p>
    </div>
    <span class="mc-btn-wrap" id="mc-btn-wrap-footer">
      <button id="mc-btn-generate-footer" class="btn btn-accent" type="button" data-mc-trigger="footer" aria-haspopup="dialog" aria-describedby="mc-btn-tooltip-footer">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="8" y="3" width="8" height="4" rx="1"/>
          <path d="M8 5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
          <path d="M9 13h7"/><path d="m13 10 3 3-3 3"/>
        </svg>
        Copy planner prompt
      </button>
      <span class="mc-disabled-tooltip" id="mc-btn-tooltip-footer" role="tooltip" aria-hidden="true"></span>
    </span>
  </aside>` : ''}

  <footer class="colophon">
    <span>Generated by <strong>@webappski/aeo-tracker</strong> · ${esc(summary.meta.date)}</span>
    <span class="dot">·</span>
    <a href="https://github.com/webappski/aeo-tracker">open source · zero deps</a>
    <span class="dot">·</span>
    <span>v${esc(opts.pkgVersion || '0.3.0')}</span>
    <span class="dot">·</span>
    <span>${esc(summary.meta.runId)}</span>
  </footer>

</main>

<script>
${RENDER_INLINE_JS}
${mcBridgeBootstrap}
</script>
</body>
</html>`;
}

// ─── Inline JS (hero counter + scroll-spy + matrix sub-toggle) ─────────────

const RENDER_INLINE_JS = `
/* Hero number counter — counts 0 → target on first paint, with reduced-motion guard */
(function () {
  var el = document.getElementById('heroNum');
  if (!el) return;
  var target = parseInt(el.textContent, 10);
  if (!Number.isFinite(target)) { el.classList.add('is-ready'); return; }
  el.classList.add('is-ready');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  el.textContent = '0';
  var start = performance.now();
  var dur = 900;
  var ease = function (t) { return 1 - Math.pow(1 - t, 3); };
  function tick(now) {
    var t = Math.min(1, (now - start) / dur);
    el.textContent = String(Math.round(target * ease(t)));
    if (t < 1) requestAnimationFrame(tick);
    else el.textContent = String(target);
  }
  requestAnimationFrame(tick);
  setTimeout(function () { el.textContent = String(target); }, dur + 200);
})();

/* Scroll-spy for outline rail — IntersectionObserver picks active section */
(function () {
  var links = Array.prototype.slice.call(document.querySelectorAll('.rail a[href^="#"]'));
  var sections = links.map(function (a) { return document.querySelector(a.getAttribute('href')); }).filter(Boolean);
  if (!sections.length || typeof IntersectionObserver === 'undefined') return;
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) {
        var id = '#' + e.target.id;
        links.forEach(function (a) { a.classList.toggle('active', a.getAttribute('href') === id); });
      }
    });
  }, { rootMargin: '-30% 0px -60% 0px' });
  sections.forEach(function (s) { io.observe(s); });
})();

/* Matrix sub-toggle (Mention/Position/Sentiment) — flips data-view on the
   grid; CSS shows whichever per-cell .mx-v-{view} span matches. */
document.querySelectorAll('.matrix-toggle').forEach(function (group) {
  group.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('button');
    if (!btn) return;
    Array.prototype.slice.call(group.querySelectorAll('button')).forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
    btn.setAttribute('aria-pressed', 'true');
    var view = (btn.textContent || '').trim().toLowerCase();
    if (view !== 'mention' && view !== 'position' && view !== 'sentiment') return;
    var section = btn.closest('article') || btn.closest('section');
    var grid = section ? section.querySelector('.matrix-grid') : null;
    if (grid) grid.setAttribute('data-view', view);
  });
});
`;

// ─── CSS ───────────────────────────────────────────────────────────────────

function renderCss() {
  return `
/* ============================================================
   AEO Tracker · Editorial Bento (v2 — canonical)
   Lifted verbatim from handoff 3/templates/styles.css.
   Project-specific extensions (md-block, .quote, .engine-tag,
   .mc-bridge integration, .cell-empty placeholder, print rules)
   live below the canonical block.
   ============================================================ */

:root {
  /* Surfaces — paper warmth, three steps */
  --paper:        #FBF9F4;
  --paper-2:      #F3EFE5;
  --paper-3:      #ECE5D5;
  --raised:       #FFFFFF;
  --line:         #E2DCCB;
  --line-strong:  #C8C0AB;
  --line-soft:    #EFEBDF;

  /* Ink — warm-black gradient, four stops */
  --ink:          #1A1610;
  --ink-2:        #3D372C;
  --ink-3:        #6F6759;
  --ink-4:        #9A9385;

  /* Accents — warm orange editorial, plus engine colors */
  --accent:       #B85C16;
  --accent-deep:  #8E4710;
  --accent-soft:  #F1D9B8;
  --accent-tint:  #FAEBD2;
  --accent-ink:   #6B380C;

  /* Engine palette — data-color tokens, not decoration */
  --eng-gpt:      #2F8F66;
  --eng-gpt-soft: #D7EAE0;
  --eng-gem:      #2C6BC9;
  --eng-gem-soft: #D6E2F4;
  --eng-cla:      #7C4FC9;
  --eng-cla-soft: #E2D7F2;
  --eng-perp:     #1A8A8E;
  --eng-perp-soft:#CFE6E6;

  /* Status — full-strength */
  --good:         #1F7A3E;
  --good-soft:    #D5E7D9;
  --bad:          #A8341E;
  --bad-soft:     #F0D5CB;
  --warn:         #A47214;
  --warn-soft:    #EDDDB6;

  /* Semantic data tokens — used by every progress-bar. "you" rows always render
     in --accent (warm orange, brand). "competitor" rows render in --competitor
     (warm brick) so the eye instantly groups «не ты». Override locally if a
     different surface (e.g. dark cell) needs lighter contrast. */
  --you:          var(--accent);
  --competitor:   #B45941;

  /* Type — variable axes */
  --display: "Fraunces", ui-serif, Georgia, "Times New Roman", serif;
  --sans:    "Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  --mono:    "JetBrains Mono", ui-monospace, "SF Mono", Consolas, monospace;

  /* Legacy token aliases — external CSS modules (mc-bridge.js) written
     against v0.4 token names continue to resolve. */
  --bg:           var(--paper);
  --bg-raised:    var(--raised);
  --bg-subtle:    var(--paper-2);
  --border:       var(--line);
  --border-strong: var(--line-strong);
  --font-mono:    var(--mono);
  --pos:          var(--good);
  --neg:          var(--bad);
}

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  background: var(--paper);
  color: var(--ink);
  font-family: var(--sans);
  font-size: 14.5px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}

::selection { background: var(--accent-tint); color: var(--ink); }

.page { max-width: 1240px; margin: 0 auto; padding: 36px 36px 80px; }

/* ─── Masthead ────────────────────────────────────────────── */
.mast {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: end;
  gap: 36px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--line);
}
.mast-mark {
  display: flex; align-items: center; gap: 10px;
  white-space: nowrap;
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: 0.06em;
  color: var(--ink-3);
  text-transform: lowercase;
}
.mast-mark::before {
  content: "";
  width: 22px; height: 22px;
  border-radius: 50%;
  background:
    radial-gradient(circle at 30% 30%, var(--accent), var(--accent-deep) 65%),
    var(--accent-deep);
  box-shadow:
    0 0 0 3px var(--accent-tint),
    0 1px 2px rgba(26,22,16,0.12);
}
.mast-mark strong { font-weight: 600; color: var(--ink); }
.mast-title {
  margin: 0;
  font-family: var(--display);
  font-weight: 300;
  font-variation-settings: "opsz" 144, "SOFT" 30;
  font-size: 64px;
  line-height: 1;
  letter-spacing: -0.025em;
  color: var(--ink);
}
.mast-domain {
  display: block;
  margin-top: 6px;
  font-family: var(--mono);
  font-size: 13px;
  color: var(--ink-3);
  letter-spacing: 0;
  font-weight: 400;
}
.mast-meta {
  display: flex; gap: 28px;
  font-size: 12px;
}
.mast-meta > div { display: flex; flex-direction: column; gap: 2px; }
.mast-meta dt {
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-4);
  margin: 0;
}
.mast-meta dd {
  margin: 0;
  font-family: var(--mono);
  font-size: 13.5px;
  color: var(--ink);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.mast-engines {
  display: flex; gap: 5px;
  align-items: center;
}
.eng-pill {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: var(--c);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--c) 25%, var(--paper));
  animation: pulse 2.4s ease-in-out infinite;
}
.eng-pill:nth-child(2) { animation-delay: 0.4s; }
.eng-pill:nth-child(3) { animation-delay: 0.8s; }
.eng-pill:nth-child(4) { animation-delay: 1.2s; }
@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 2px color-mix(in srgb, var(--c) 25%, var(--paper)); }
  50%      { box-shadow: 0 0 0 4px color-mix(in srgb, var(--c) 12%, var(--paper)); }
}

/* ─── Hero — editorial dominant number ──────────────────── */
.hero {
  position: relative;
  display: grid;
  grid-template-columns: 1.55fr 1fr;
  gap: 48px;
  margin: 28px 0 40px;
  padding: 38px 40px 36px;
  border-radius: 20px;
  background:
    radial-gradient(110% 80% at 90% 20%, var(--accent-tint) 0%, transparent 55%),
    linear-gradient(180deg, var(--raised) 0%, var(--paper-2) 100%);
  border: 1px solid var(--line);
  overflow: hidden;
}

.hero-ghost {
  position: absolute;
  inset: auto 0 0 0;
  height: 64%;
  pointer-events: none;
  opacity: 0.55;
  mask-image: linear-gradient(180deg, transparent 0%, #000 40%, #000 100%);
  -webkit-mask-image: linear-gradient(180deg, transparent 0%, #000 40%, #000 100%);
}
.hero-ghost svg { width: 100%; height: 100%; }

.hero-main { position: relative; z-index: 2; }

.hero-kicker {
  display: flex; align-items: center; gap: 10px;
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-3);
  margin: 0 0 14px;
}
.hero-kicker .bucket {
  font-weight: 600;
  color: var(--bad);
  display: inline-flex; align-items: center; gap: 6px;
}
.hero-kicker .bucket::before {
  content: "";
  width: 7px; height: 7px;
  border-radius: 50%;
  background: var(--bad);
}

.hero-num-wrap {
  display: inline-flex;
  align-items: stretch;
  gap: 8px;
  position: relative;
  font-feature-settings: "tnum", "ss01";
  font-variant-numeric: tabular-nums;
}
.hero-num {
  font-family: var(--display);
  font-weight: 200;
  font-variation-settings: "opsz" 144, "SOFT" 100;
  font-size: 180px;
  line-height: 0.86;
  letter-spacing: -0.045em;
  color: var(--ink);
  display: inline-block;
  opacity: 0;
  transform: translateY(8px);
  transition: opacity 700ms ease-out, transform 700ms cubic-bezier(0.2, 0.7, 0.2, 1);
}
.hero-num.is-ready {
  opacity: 1;
  transform: translateY(0);
}
.hero-num-frac {
  font-family: var(--display);
  font-weight: 300;
  font-variation-settings: "opsz" 144;
  font-size: 30px;
  letter-spacing: -0.02em;
  color: var(--ink-3);
  white-space: nowrap;
  align-self: flex-end;
  margin-bottom: 24px;
  line-height: 1;
}
@keyframes count-in {
  from { opacity: 0; transform: translateY(8px); letter-spacing: -0.02em; }
  to   { opacity: 1; transform: translateY(0);    letter-spacing: -0.045em; }
}

.hero-narrative {
  margin: 18px 0 0;
  max-width: 44ch;
  font-family: var(--display);
  font-weight: 350;
  font-variation-settings: "opsz" 24, "SOFT" 50;
  font-size: 19px;
  line-height: 1.45;
  color: var(--ink-2);
  letter-spacing: -0.005em;
}
.hero-narrative b {
  font-weight: 500;
  color: var(--ink);
  background: linear-gradient(180deg, transparent 60%, var(--accent-tint) 60%);
  padding: 0 2px;
}

.hero-delta {
  margin-top: 18px;
  display: inline-flex; align-items: center; gap: 10px;
  font-family: var(--mono);
  font-size: 12.5px;
  color: var(--ink-3);
}
.hero-delta-arrow {
  font-size: 14px;
  font-weight: 600;
}
.hero-delta.pos { color: var(--good); }
.hero-delta.neg { color: var(--bad); }
.hero-delta.flat { color: var(--ink-3); }
.hero-delta-mini {
  width: 60px; height: 18px;
  display: inline-block;
  vertical-align: middle;
}

/* Hero side: 3 narrative-style KPIs stacked */
.hero-side {
  position: relative; z-index: 2;
  display: flex; flex-direction: column;
  gap: 28px;
  padding-left: 32px;
  border-left: 1px solid var(--line);
  min-width: 0;
}
.hero-side .hero-kpi + .hero-kpi {
  padding-top: 28px;
  border-top: 1px solid var(--line);
}
.hero-side .hero-kpi { min-width: 0; }
.hero-kpi { display: flex; flex-direction: column; gap: 4px; }
.hero-kpi-label {
  font-family: var(--mono);
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--ink-4);
  display: flex; align-items: center; gap: 8px;
}
.hero-kpi-label::after {
  content: "";
  flex: 1;
  border-bottom: 1px dashed var(--line-strong);
  opacity: 0.5;
  margin-top: 2px;
}
.hero-kpi-row {
  display: flex; align-items: baseline; gap: 10px;
  font-feature-settings: "tnum";
}
.hero-kpi-num {
  font-family: var(--display);
  font-weight: 350;
  font-variation-settings: "opsz" 96;
  font-size: 38px;
  letter-spacing: -0.025em;
  line-height: 1;
  color: var(--ink);
}
.hero-kpi-num-sub {
  font-family: var(--mono);
  font-size: 13px;
  color: var(--ink-3);
  font-variant-numeric: tabular-nums;
}
.hero-kpi-num-sub.pos { color: var(--good); }
.hero-kpi-num-sub.neg { color: var(--bad); }
.hero-kpi-context {
  font-size: 12.5px;
  color: var(--ink-3);
  line-height: 1.4;
}
.hero-kpi-context b {
  color: var(--ink);
  font-weight: 500;
}
.hero-kpi-context .e {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--c);
  font-weight: 600;
  letter-spacing: 0.04em;
}

/* ─── Promoted bridge + sponsor (2-up under hero) ─────── */
.promote {
  display: grid;
  grid-template-columns: 1.35fr 1fr;
  /* grid-auto-rows: 1fr forces both columns to share the tallest row height
     so bridge-compact and sponsor balance visually. */
  grid-auto-rows: 1fr;
  align-items: stretch;
  gap: 16px;
  margin: 0 0 36px;
}
.promote-card {
  position: relative;
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 24px 26px;
  background: var(--raised);
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow: hidden;
}
.promote-card.bridge {
  background:
    radial-gradient(120% 100% at 0% 0%, var(--accent-tint) 0%, transparent 50%),
    var(--raised);
  border-color: color-mix(in srgb, var(--accent) 25%, var(--line));
  /* Allow .mc-disabled-tooltip (positioned -bottom: calc(100% + 10px) above
     the Copy button) to escape the card's rounded corner. Canonical default
     is overflow: hidden but here it physically clips a popover that needs
     to render above adjacent content. The gradient is a background paint,
     so it stays inside the box regardless of overflow setting. */
  overflow: visible;
}

.promote-kicker {
  display: flex; align-items: center; gap: 10px;
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: var(--accent-ink);
  font-weight: 600;
}
.promote-kicker .step {
  background: var(--accent);
  color: var(--paper);
  padding: 2.5px 8px;
  border-radius: 99px;
  font-size: 9.5px;
  letter-spacing: 0.12em;
}
.promote-card.sponsor .promote-kicker {
  color: var(--ink-3);
}
.promote-card.sponsor .promote-kicker .step {
  background: var(--ink);
  color: var(--paper);
}
.promote-title {
  margin: 0;
  font-family: var(--display);
  font-weight: 400;
  font-variation-settings: "opsz" 48, "SOFT" 30;
  font-size: 28px;
  line-height: 1.1;
  letter-spacing: -0.022em;
  color: var(--ink);
}
.promote-lede {
  margin: 0;
  font-size: 14px;
  color: var(--ink-2);
  line-height: 1.55;
  max-width: 56ch;
}
.promote-lede a {
  color: var(--accent-ink);
  font-weight: 500;
  text-decoration: underline;
  text-decoration-color: color-mix(in srgb, var(--accent) 35%, transparent);
  text-underline-offset: 2px;
}
.promote-lede strong { color: var(--ink); font-weight: 600; }
.promote-lede code {
  font-family: var(--mono);
  font-size: 12.5px;
  background: var(--paper-2);
  padding: 1px 6px;
  border-radius: 4px;
  border: 1px solid var(--line);
}
.promote-action {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  margin-top: auto;
}

.btn {
  appearance: none;
  font-family: var(--sans);
  font-size: 13.5px;
  font-weight: 500;
  padding: 10px 16px;
  border-radius: 10px;
  cursor: pointer;
  display: inline-flex; align-items: center; gap: 8px;
  border: 1px solid transparent;
  text-decoration: none;
  transition: transform 100ms ease, background 100ms ease, box-shadow 120ms ease;
  letter-spacing: -0.005em;
}
.btn:active { transform: translateY(1px); }
.btn:disabled,
.btn[disabled] {
  background: color-mix(in srgb, var(--ink-3) 85%, var(--ink-4));
  color: color-mix(in srgb, var(--paper) 85%, transparent);
  border-color: transparent;
  box-shadow: none;
  cursor: not-allowed;
  opacity: 0.7;
}
.btn:disabled:hover,
.btn[disabled]:hover { background: color-mix(in srgb, var(--ink-3) 85%, var(--ink-4)); transform: none; }
.btn-solid {
  background: var(--ink);
  color: var(--paper);
  box-shadow: 0 1px 0 var(--ink), 0 2px 6px rgba(26,22,16,0.18);
}
.btn-solid:hover { background: #000; }
.btn-accent {
  background: var(--accent);
  color: #FFFCF5;
  box-shadow: 0 1px 0 var(--accent-deep), 0 4px 10px color-mix(in srgb, var(--accent) 30%, transparent);
}
.btn-accent:hover { background: var(--accent-deep); }
.btn-ghost {
  background: var(--raised);
  color: var(--ink);
  border-color: var(--line-strong);
}
.btn-ghost:hover { background: var(--paper-2); }
.qbadge {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 9px;
  border-radius: 99px;
  font-family: var(--mono);
  font-size: 11px;
  background: var(--good-soft);
  color: var(--good);
  border: 1px solid color-mix(in srgb, var(--good) 30%, transparent);
}
.qbadge::before {
  content: "";
  width: 6px; height: 6px;
  border-radius: 50%;
  background: currentColor;
}

/* ─── Section tab bar (sticky, prominent) ──────────────── */
.layout {
  display: block;
  margin-top: 0;
}
.rail {
  position: sticky;
  top: 0;
  z-index: 50;
  display: flex;
  align-items: stretch;
  gap: 0;
  margin: 0 -36px 28px;
  padding: 0 36px;
  background: color-mix(in srgb, var(--paper) 92%, transparent);
  backdrop-filter: saturate(140%) blur(8px);
  -webkit-backdrop-filter: saturate(140%) blur(8px);
  border-bottom: 1px solid var(--line);
  font-family: var(--mono);
  font-size: 12.5px;
  overflow-x: auto;
  scrollbar-width: none;
}
.rail::-webkit-scrollbar { display: none; }
.rail-label {
  font-family: var(--mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: var(--ink-4);
  display: flex; align-items: center;
  padding: 14px 18px 14px 0;
  margin: 0;
  border: 0;
  border-right: 1px solid var(--line);
  white-space: nowrap;
}
.rail a {
  position: relative;
  display: flex; align-items: center; gap: 8px;
  padding: 16px 18px;
  color: var(--ink-3);
  text-decoration: none;
  border: 0;
  margin: 0;
  letter-spacing: -0.005em;
  white-space: nowrap;
  transition: color 140ms ease, background 140ms ease;
}
.rail a::after {
  content: "";
  position: absolute;
  left: 18px; right: 18px;
  bottom: -1px;
  height: 3px;
  background: var(--accent);
  border-radius: 2px 2px 0 0;
  transform: scaleX(0);
  transform-origin: center;
  transition: transform 200ms cubic-bezier(0.2, 0.7, 0.2, 1);
}
.rail a:hover { color: var(--ink); background: color-mix(in srgb, var(--accent-tint) 40%, transparent); }
.rail a.active {
  color: var(--ink);
  font-weight: 500;
}
.rail a.active::after { transform: scaleX(1); }
.rail-num {
  font-family: var(--mono);
  font-size: 10.5px;
  color: var(--ink-4);
  letter-spacing: 0.04em;
  font-weight: 500;
}
.rail a.active .rail-num { color: var(--accent-ink); }

.content { min-width: 0; }

/* ─── Bento grid sections ─────────────────────────────── */
.bento {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 16px;
  margin: 0 0 56px;
  scroll-margin-top: 80px;
}
.cell {
  position: relative;
  background: var(--raised);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 22px 24px;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}
.cell.span-2 { grid-column: span 2; }
.cell.span-3 { grid-column: span 3; }
.cell.span-4 { grid-column: span 4; }
.cell.span-6 { grid-column: span 6; }
.cell.tall { min-height: 280px; }
.cell.dark {
  background: var(--ink);
  color: var(--paper);
  border-color: var(--ink);
  /* Don't stretch to match a tall sibling cell's height — size to own
     content. Otherwise a short ranked list ends up in a giant black void
     next to the radar grid. */
  align-self: start;
}
.cell.dark .cell-label { color: var(--ink-4); }
.cell.dark .cell-title { color: var(--paper); }

.cell-head {
  display: flex; align-items: baseline; justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}
.cell-label {
  font-family: var(--mono);
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--ink-4);
  display: flex; align-items: center; gap: 8px;
}
.cell-label .merge {
  font-family: var(--sans);
  font-size: 9.5px;
  background: var(--accent-tint);
  color: var(--accent-ink);
  padding: 1.5px 6px;
  border-radius: 99px;
  letter-spacing: 0.06em;
  border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
  font-weight: 500;
  text-transform: none;
}
.cell-title {
  margin: 0 0 4px;
  font-family: var(--display);
  font-weight: 400;
  font-variation-settings: "opsz" 36, "SOFT" 30;
  font-size: 22px;
  letter-spacing: -0.02em;
  line-height: 1.2;
  color: var(--ink);
}
.cell-sub {
  margin: 0 0 16px;
  font-size: 12.5px;
  color: var(--ink-3);
  max-width: 60ch;
}
.cell-action {
  margin-left: auto;
  font-family: var(--mono);
  font-size: 11px;
  color: var(--ink-3);
  text-decoration: none;
  display: inline-flex; align-items: center; gap: 4px;
}
.cell-action:hover { color: var(--accent-ink); }
.cell-action::after {
  content: "→";
  transition: transform 120ms ease;
}
.cell-action:hover::after { transform: translateX(2px); }

.cell-body {
  flex: 1;
  display: flex;
  align-items: stretch;
  justify-content: center;
  min-height: 0;
}

/* Placeholder cell — keeps section header + rail nav continuous when a
   section has no data on the current run. Dashed border + italic copy
   distinguishes it from a real cell without leaving a gap. */
.cell-empty {
  background: var(--paper-2);
  border-style: dashed;
  border-color: var(--line-strong);
  color: var(--ink-3);
  font-size: 13px;
  font-style: italic;
  text-align: center;
  display: flex; align-items: center; justify-content: center;
  min-height: 100px;
  padding: 28px 24px;
  line-height: 1.55;
}

/* ─── Big number block ─────────────────────────────────── */
.big-num {
  font-family: var(--display);
  font-weight: 250;
  font-variation-settings: "opsz" 96;
  font-size: 76px;
  letter-spacing: -0.04em;
  line-height: 0.92;
  font-variant-numeric: tabular-nums;
}
.big-num.bad { color: var(--bad); }
.big-num.good { color: var(--good); }
.big-num.warn { color: var(--warn); }
.big-num small {
  font-size: 24px; color: var(--ink-3); margin-left: 2px; font-weight: 300;
}

/* ─── Engine cards (lifted, refined) ───────────────────── */
.eng-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.eng-card {
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 14px 16px;
  background: var(--paper);
  display: flex; flex-direction: column;
  gap: 10px;
  position: relative;
  overflow: hidden;
}
.eng-card::before {
  content: "";
  position: absolute;
  inset: 0 0 auto 0;
  height: 3px;
  background: var(--c);
}
.eng-card-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px;
}
.eng-name {
  font-family: var(--display);
  font-weight: 500;
  font-variation-settings: "opsz" 24;
  font-size: 17px;
  letter-spacing: -0.015em;
  color: var(--ink);
}
.eng-model {
  font-family: var(--mono);
  font-size: 10px;
  color: var(--ink-4);
  letter-spacing: 0;
}
.eng-pct {
  font-family: var(--display);
  font-weight: 250;
  font-variation-settings: "opsz" 96;
  font-size: 42px;
  line-height: 1;
  letter-spacing: -0.03em;
  color: var(--c);
  font-variant-numeric: tabular-nums;
}
.eng-pct sup {
  font-size: 16px;
  margin-left: 1px;
  vertical-align: super;
  font-weight: 350;
}
.eng-bar {
  height: 4px;
  background: color-mix(in srgb, var(--c) 12%, var(--paper-2));
  border-radius: 99px;
  position: relative;
  overflow: hidden;
}
.eng-bar::after {
  content: "";
  position: absolute; inset: 0;
  width: var(--w, 0%);
  background: var(--c);
  border-radius: 99px;
}
.eng-meta {
  display: flex; justify-content: space-between;
  font-family: var(--mono);
  font-size: 11px;
  color: var(--ink-3);
}

/* ─── Matrix (heatmap + position + sentiment toggle) ─── */
.matrix-toggle {
  display: inline-flex;
  background: var(--paper-2);
  border: 1px solid var(--line);
  border-radius: 99px;
  padding: 3px;
  gap: 0;
}
.matrix-toggle button {
  appearance: none;
  background: none; border: 0;
  padding: 5px 12px;
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.04em;
  color: var(--ink-3);
  cursor: pointer;
  border-radius: 99px;
  transition: all 100ms ease;
  text-transform: uppercase;
}
.matrix-toggle button[aria-pressed="true"] {
  background: var(--ink);
  color: var(--paper);
  font-weight: 500;
}
.matrix-grid {
  display: grid;
  grid-template-columns: 1.6fr repeat(var(--cols, 3), 1fr);
  gap: 1px;
  background: var(--line);
  border: 1px solid var(--line);
  border-radius: 10px;
  overflow: hidden;
  margin-top: 16px;
}
.mx-h {
  background: var(--paper);
  padding: 10px 12px;
  font-family: var(--mono);
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--ink-4);
}
.mx-h.eng {
  text-align: center;
  color: var(--c);
  font-weight: 600;
}
.mx-q {
  background: var(--raised);
  padding: 12px;
  font-size: 12.5px;
  color: var(--ink);
  display: flex; flex-direction: column; gap: 2px;
}
.mx-q .qpre {
  font-family: var(--mono);
  font-size: 10px;
  color: var(--ink-4);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.mx-c {
  background: var(--raised);
  padding: 10px;
  display: flex; align-items: center; justify-content: center;
  font-family: var(--mono);
  font-size: 11px;
  color: var(--ink-3);
  text-align: center;
  position: relative;
  cursor: pointer;
  transition: background 100ms ease;
}
.mx-c:hover { background: var(--paper); }
.mx-c.no { color: var(--ink-4); }

/* View-toggle visibility: only the span matching .matrix-grid[data-view=…]
   renders. Replaces the v0.3 visual-only toggle (which never actually changed
   what the cell showed). */
.mx-c .mx-v { display: none; }
.matrix-grid[data-view="mention"]   .mx-v-mention,
.matrix-grid[data-view="position"]  .mx-v-position,
.matrix-grid[data-view="sentiment"] .mx-v-sentiment { display: inline; }

/* Sentiment dot tones — coloured marker against the cell's mention-coded
   background. Missing sentiment (cell mentioned but extractor skipped or
   unavailable) renders as muted ink-4. */
.mx-v-sentiment {
  font-size: 14px;
  line-height: 1;
  color: var(--ink-4);
}
.mx-v-sentiment[data-tone="pos"]  { color: var(--good); }
.mx-v-sentiment[data-tone="neg"]  { color: var(--bad); }
.mx-v-sentiment[data-tone="flat"] { color: var(--ink-3); }
.mx-v-sentiment[data-tone="missing"] { color: var(--ink-4); }
.mx-c.named {
  background: color-mix(in srgb, var(--good) 12%, var(--raised));
  color: var(--good);
  font-weight: 600;
}
.mx-c.cited {
  background: color-mix(in srgb, var(--accent) 14%, var(--raised));
  color: var(--accent-ink);
  font-weight: 500;
}
.mx-c.yes {
  background: color-mix(in srgb, var(--good) 12%, var(--raised));
  color: var(--good);
  font-weight: 600;
}
.mx-c.err {
  background: var(--bad-soft);
  color: var(--bad);
  font-weight: 600;
}

/* ─── Stippled chart (sparkline / domains bar) ────────── */
.chart {
  width: 100%;
  display: block;
}
.chart-grid {
  stroke: var(--line);
  stroke-dasharray: 1 4;
  stroke-width: 1;
}
.chart-axis {
  font-family: var(--mono);
  font-size: 10px;
  fill: var(--ink-4);
  letter-spacing: 0.04em;
}
.chart-line {
  stroke: var(--accent);
  stroke-width: 1.75;
  fill: none;
}
.chart-fill {
  fill: var(--accent);
  fill-opacity: 0.10;
}
.chart-dot {
  fill: var(--accent);
}
.chart-anno {
  font-family: var(--mono);
  font-size: 10.5px;
  fill: var(--ink-2);
  font-weight: 500;
}
.chart-leader {
  stroke: var(--ink-4);
  stroke-width: 0.5;
  stroke-dasharray: 2 2;
}

/* Domains bar — label-above-bar layout. The previous in-bar overlay (with
   mix-blend-mode) cut letters across the fill/track boundary; the new pattern
   stacks the hostname on its own row above a plain 8px bar. Reads cleanly on
   any fill colour and matches how shadcn / Linear / Vercel ship progress
   metrics. Apply this same shape anywhere a labelled progress-bar appears. */
.dom-row {
  display: grid;
  grid-template-columns: 1fr 36px;
  gap: 12px;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px dashed var(--line-soft);
  font-size: 13px;
}
.dom-row:last-child { border-bottom: 0; }
.dom-bar-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.dom-name {
  font-family: var(--mono);
  font-size: 12px;
  font-weight: 500;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dom-bar {
  position: relative;
  height: 8px;
  background: var(--paper-2);
  border-radius: 99px;
  overflow: hidden;
}
.dom-bar::after {
  content: "";
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: var(--w, 0%);
  /* Competitor by default («не ты»); .owned overrides to brand orange. */
  background: var(--competitor);
  border-radius: 99px;
}
.dom-row.owned .dom-bar::after { background: var(--you); }

/* ─── Radar stats table (per-axis you/avg/Δ) ─── */
.radar-stats {
  margin-top: 14px;
  display: flex; flex-direction: column;
  font-family: var(--mono);
  font-size: 11.5px;
  border-top: 1px solid var(--line);
}
.radar-row {
  display: grid;
  grid-template-columns: 1fr 44px 44px 44px;
  align-items: center;
  padding: 6px 0;
  border-bottom: 1px dashed var(--line-soft);
  color: var(--ink-2);
}
.radar-row:last-child { border-bottom: 0; }
.radar-row.radar-head {
  color: var(--ink-4);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  border-bottom: 1px solid var(--line);
}
.radar-axis { font-family: var(--sans); font-size: 12px; color: var(--ink); font-weight: 500; }
.radar-row.radar-head .radar-axis,
.radar-row.radar-head > span { font-family: var(--mono); }
.radar-num { text-align: right; font-variant-numeric: tabular-nums; color: var(--ink); }
.radar-num-avg { color: var(--ink-3); }
.radar-delta {
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
.radar-delta.pos  { color: var(--good); }
.radar-delta.neg  { color: var(--bad); }
.radar-delta.flat { color: var(--ink-4); }
.dom-pct {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--ink-2);
  text-align: right;
  font-variant-numeric: tabular-nums;
}

/* ─── Competitor list (dark cell content) ─────────────── */
.comp-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 1px; }
.comp-list li {
  display: grid;
  grid-template-columns: 18px 1fr auto;
  gap: 10px;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px dashed color-mix(in srgb, var(--paper) 18%, transparent);
}
.comp-list li:last-child { border-bottom: 0; }
.comp-rank {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--ink-4);
}
.comp-name {
  font-family: var(--display);
  font-weight: 400;
  font-size: 16px;
  letter-spacing: -0.01em;
}
.comp-bar {
  width: 80px;
  height: 6px;
  background: color-mix(in srgb, var(--paper) 12%, transparent);
  border-radius: 99px;
  position: relative;
}
/* Most-named brands list lives in a dark cell, so lighten --competitor toward
   --paper for legibility — same semantic «не ты» colour as .dom-bar fills, just
   surfaced for the dark backdrop. */
.comp-bar::after {
  content: "";
  position: absolute; inset: 0;
  width: var(--w, 0%);
  background: color-mix(in srgb, var(--competitor) 60%, var(--paper));
  border-radius: 99px;
  opacity: 0.95;
}
.comp-count {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--paper);
  margin-left: 8px;
  opacity: 0.7;
}

/* ─── Action stack ─────────────────────────────────────── */
.act { display: flex; flex-direction: column; gap: 12px; }
.act-row {
  display: grid;
  grid-template-columns: 28px 1fr auto;
  gap: 14px;
  align-items: start;
  padding: 14px 16px;
  background: var(--paper);
  border: 1px solid var(--line-soft);
  border-radius: 12px;
}
.act-num {
  font-family: var(--display);
  font-weight: 300;
  font-size: 22px;
  color: var(--accent);
  line-height: 1;
}
.act-body { display: flex; flex-direction: column; gap: 4px; }
.act-title {
  font-family: var(--display);
  font-weight: 500;
  font-size: 15.5px;
  letter-spacing: -0.01em;
  color: var(--ink);
  margin: 0;
}
.act-meta {
  display: flex; gap: 10px; flex-wrap: wrap;
  font-family: var(--mono);
  font-size: 10.5px;
  color: var(--ink-3);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
/* Day chip — warm accent tint instead of solid ink. The canonical's black pill
   (var(--ink)) read as «alarm» weight — visually outweighed even the action
   title. Tint pill stays informational, matches .qbadge / .merge / .promote-
   kicker treatment, and pairs with the orange .act-num. */
.act-meta .day {
  background: var(--accent-tint);
  color: var(--accent-ink);
  padding: 2px 8px;
  border-radius: 4px;
  letter-spacing: 0.06em;
  font-weight: 600;
  border: 1px solid color-mix(in srgb, var(--accent) 22%, transparent);
}
.act-detail {
  font-size: 13px;
  color: var(--ink-2);
  line-height: 1.5;
  margin: 4px 0 0;
}
.act-prio {
  font-family: var(--mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--ink-4);
  white-space: nowrap;
}
.act-prio.high { color: var(--bad); }

/* ─── Site readiness mini ─────────────────────────────── */
.ready-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px dashed var(--line-soft);
  font-size: 13px;
}
.ready-row:last-child { border-bottom: 0; }
.ready-row .ck {
  width: 14px; height: 14px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 50%;
  background: var(--good-soft);
  color: var(--good);
  font-size: 9px;
  font-weight: 700;
  margin-right: 8px;
  vertical-align: middle;
}
.ready-row .ck.bad { background: var(--bad-soft); color: var(--bad); }
.ready-row .ck.warn { background: var(--warn-soft); color: var(--warn); }
.ready-row .label { color: var(--ink); font-size: 13px; }
.ready-row .meta { font-family: var(--mono); font-size: 11px; color: var(--ink-3); }

/* ─── Quote figures (Visibility verbatim cell) ─── */
.quote { margin: 12px 0 0; padding: 0; }
.quote blockquote {
  margin: 6px 0; padding: 12px 14px;
  background: var(--paper-2); border-left: 3px solid var(--accent);
  border-radius: 6px; color: var(--ink); font-size: 13.5px; line-height: 1.55;
  font-family: var(--display); font-weight: 400;
}
.quote-meta {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  font-size: 11.5px; color: var(--ink-3);
}
.engine-tag {
  font-family: var(--mono); font-size: 10.5px; padding: 2px 7px; border-radius: 3px;
  background: color-mix(in srgb, var(--eng, var(--ink-3)) 12%, var(--paper));
  color: var(--eng, var(--ink));
  border: 1px solid color-mix(in srgb, var(--eng, var(--ink-3)) 25%, transparent);
}
.quote-query { font-family: var(--mono); font-size: 11px; color: var(--ink-3); }

/* ─── Embedded markdown panels (md-block) ─── */
.md-block { font-size: 13px; line-height: 1.6; color: var(--ink-2); }
.md-block h2 { display: none; }
.md-block h3 {
  font-family: var(--sans); font-size: 13px; font-weight: 600;
  color: var(--ink); margin: 14px 0 6px;
}
.md-block table {
  width: 100%; border-collapse: collapse; margin: 8px 0;
  font-family: var(--mono); font-size: 11px;
}
.md-block th {
  text-align: left; padding: 6px 8px;
  background: var(--paper-2); color: var(--ink-2);
  font-family: var(--sans); font-size: 11px; font-weight: 600;
  letter-spacing: 0.04em; text-transform: uppercase;
  border-bottom: 1px solid var(--line);
}
.md-block td { padding: 6px 8px; border-bottom: 1px solid var(--line-soft); color: var(--ink-2); }
.md-block tr:last-child td { border-bottom: 0; }
.md-block code {
  font-family: var(--mono); background: var(--paper-2);
  padding: 1px 4px; border-radius: 3px; font-size: 11.5px;
}
.md-block details {
  margin: 8px 0; padding: 10px 12px;
  background: var(--paper-2); border: 1px solid var(--line); border-radius: 8px;
}
.md-block details summary { cursor: pointer; font-weight: 600; color: var(--ink); font-size: 12.5px; }

/* ─── Footer reprise + colophon ───────────────────────── */
.footer-reprise {
  margin: 56px 0 0;
  padding: 28px 32px;
  border-radius: 16px;
  background:
    radial-gradient(80% 100% at 100% 50%, var(--accent-tint) 0%, transparent 50%),
    var(--paper-2);
  border: 1px solid var(--line);
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 24px;
  align-items: center;
}
.footer-reprise h3 {
  margin: 0 0 6px;
  font-family: var(--display);
  font-weight: 400;
  font-variation-settings: "opsz" 36;
  font-size: 22px;
  letter-spacing: -0.02em;
  color: var(--ink);
}
.footer-reprise p {
  margin: 0;
  font-size: 13.5px;
  color: var(--ink-2);
  max-width: 60ch;
}

.colophon {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  margin-top: 32px; padding-top: 18px;
  border-top: 1px solid var(--line);
  font-family: var(--mono);
  font-size: 11px;
  color: var(--ink-4);
  letter-spacing: 0.02em;
}
.colophon a { color: var(--ink-3); text-decoration: none; }
.colophon a:hover { color: var(--ink); text-decoration: underline; }
.colophon .dot { color: var(--line-strong); }

/* ─── Print: bento already linear, just clean up ─────── */
@media print {
  body { background: white; }
  .rail, .footer-reprise { display: none; }
  .layout { grid-template-columns: 1fr; gap: 0; }
  .bento { grid-template-columns: 1fr 1fr; gap: 12px; }
  .cell.span-6 { grid-column: span 2; }
  .cell.span-4, .cell.span-3 { grid-column: span 2; }
  .promote, .hero { break-inside: avoid; }
  .cell { break-inside: avoid; }
  .hero-ghost { display: none; }
  a { color: var(--ink); text-decoration: underline; }
}

/* ─── Responsive ───────────────────────────────────────── */
@media (max-width: 1080px) {
  .rail { margin: 0 -20px 24px; padding: 0 20px; font-size: 12px; }
  .rail-label { padding: 12px 14px 12px 0; font-size: 9.5px; }
  .rail a { padding: 14px 14px; }
  .rail a::after { left: 14px; right: 14px; }
  .bento { grid-template-columns: repeat(4, 1fr); }
  .cell.span-6 { grid-column: span 4; }
  .cell.span-4 { grid-column: span 4; }
  .cell.span-3 { grid-column: span 2; }
  .cell.span-2 { grid-column: span 2; }
  .hero { grid-template-columns: 1fr; gap: 28px; }
  .hero-side { padding-left: 0; padding-top: 24px; border-left: 0; border-top: 1px solid var(--line); }
  .hero-num { font-size: 132px; }
  .hero-num-frac { font-size: 32px; margin-top: 14px; }
}
@media (max-width: 720px) {
  .page { padding: 20px 16px 56px; }
  .mast { grid-template-columns: 1fr; gap: 16px; }
  .mast-title { font-size: 44px; }
  .hero { padding: 24px; }
  .hero-num { font-size: 120px; }
  .promote { grid-template-columns: 1fr; }
  .bento { grid-template-columns: 1fr 1fr; }
  .cell.span-6, .cell.span-4, .cell.span-3, .cell.span-2 { grid-column: span 2; }
  .footer-reprise { grid-template-columns: 1fr; }
}
`;
}
