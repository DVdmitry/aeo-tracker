import { heatmap, barchart, sparkline, deltaArrow, radar } from '../svg/index.js';
import { extractQuotes } from './extract-quotes.js';

const PROVIDER_LABELS = {
  openai: 'ChatGPT',
  gemini: 'Gemini',
  anthropic: 'Claude',
  perplexity: 'Perplexity',
};

export function providerLabel(p) {
  return PROVIDER_LABELS[p] || p;
}

/**
 * Truncate URL keeping hostname visible; drop `https://` prefix because the
 * SVG label column is ~180px wide — the scheme eats budget without adding info.
 * Result like "aeodirectory.com/aeo/det…" fits and stays parseable.
 */
function shortenUrlKeepHost(u, maxLen = 30) {
  if (!u) return u;
  try {
    const url = new URL(u);
    const host = url.hostname.replace(/^www\./, '');
    const tail = url.pathname === '/' ? '' : (url.pathname + url.search);
    const combined = host + tail;
    if (combined.length <= maxLen) return combined;
    if (host.length >= maxLen - 2) return host.slice(0, maxLen - 1) + '…';
    const budget = maxLen - host.length - 1; // reserve 1 char for ellipsis
    return host + tail.slice(0, budget) + '…';
  } catch {
    return u.length > maxLen ? u.slice(0, maxLen - 1) + '…' : u;
  }
}

/** Per-provider hit ratio. Returns { hits, total, rate }. */
function providerStats(results, provider) {
  const rs = results.filter(r => r.provider === provider && r.mention !== 'error');
  const hits = rs.filter(r => r.mention === 'yes' || r.mention === 'src').length;
  return { hits, total: rs.length, rate: rs.length > 0 ? hits / rs.length : 0 };
}

// ─── Section: Header (with corner score badge — P9) ───

/**
 * Map score to traffic-light status: color + emoji + label + actionable verb.
 */
export function trafficLight(score) {
  if (typeof score !== 'number') return { emoji: '⚪', color: '#94a3b8', label: 'NO DATA', verb: 'run first audit' };
  if (score === 0)   return { emoji: '🔴', color: '#ef4444', label: 'INVISIBLE', verb: 'establish presence' };
  if (score < 25)    return { emoji: '🟠', color: '#f97316', label: 'EMERGING',  verb: 'broaden coverage' };
  if (score < 60)    return { emoji: '🟡', color: '#eab308', label: 'PRESENT',   verb: 'deepen authority' };
  return { emoji: '🟢', color: '#10b981', label: 'STRONG',    verb: 'defend position' };
}

export function sectionHeader(snapshots) {
  const latest = snapshots[snapshots.length - 1];
  const first = snapshots[0];
  const generated = new Date().toISOString().slice(0, 10);
  const period = snapshots.length > 1
    ? `${first.date} → ${latest.date} (${snapshots.length} runs)`
    : `${latest.date} (first run)`;
  const tl = trafficLight(latest.score);

  return `# ${tl.emoji} ${latest.score}% · AEO Report — ${latest.brand}

${latest.domain} · ${period} · generated ${generated}
`;
}

// ─── Section: Hero card (P1) — scanner-friendly headline ───

/**
 * The single most important block in the report. Appears above Summary and
 * all tables. Uses emoji traffic light + big score + plain-English subtext +
 * inline "what to do this week" hook.
 *
 * Designed to convey {status, trend, action} in one scannable eye-fixation.
 */
export function sectionHero(snapshots) {
  const latest = snapshots[snapshots.length - 1];
  const prev = snapshots.length > 1 ? snapshots[snapshots.length - 2] : null;
  const tl = trafficLight(latest.score);

  const scoreDelta = prev ? latest.score - prev.score : null;
  const trendMarker = scoreDelta === null
    ? '▪ BASELINE'
    : scoreDelta > 0 ? `▲ +${scoreDelta}pp vs ${prev.date}`
    : scoreDelta < 0 ? `▼ ${scoreDelta}pp vs ${prev.date}`
    : '▪ no change';

  return `## ${tl.emoji} Your AEO visibility — ${tl.label}

# ${latest.score}%

${trendMarker} · **${latest.mentions} of ${latest.total} checks returned a mention**

> Focus this week: **${tl.verb}**. See actionable steps at the bottom of this report.
`;
}

// ─── Section: Comparison baseline (P10) — answers "is 0% bad?" ───

/**
 * Context for the raw number. Tells the user where their score sits relative
 * to rough industry baselines. Shown only on first-run or low scores to avoid
 * condescension when user is actually doing fine.
 */
export function sectionBaseline(snapshots) {
  const latest = snapshots[snapshots.length - 1];
  if (latest.score >= 60) return ''; // Don't patronise strong brands

  const markerAt = (low, high) =>
    latest.score >= low && latest.score <= high ? ' ← you are here' : '';

  return `### How your score compares

\`\`\`
Pre-revenue brand, Week 1–2:           0–15%${markerAt(0, 15)}
6-month-old brand with SEO investment: 20–45%${markerAt(20, 45)}
Established category leader:            60–85%${markerAt(60, 100)}
\`\`\`

_Rough baselines from Webappski's own weekly audits and client work. 0% at Week 1 is the norm for new brands — the tool is designed to track you from invisible to strong over months, not to grade you today._
`;
}

// ─── Section: Executive Summary (plain-English abstract) ───

export function sectionExecutiveSummary(snapshots) {
  const latest = snapshots[snapshots.length - 1];
  const { mentions, total, brand } = latest;
  const providers = [...new Set(latest.results.map(r => r.provider))];
  const stats = providers.map(p => ({ p, ...providerStats(latest.results, p) }));
  const visible = stats.filter(s => s.hits > 0);
  const invisible = stats.filter(s => s.hits === 0);
  const strongest = [...visible].sort((a, b) => b.rate - a.rate)[0];

  let narrative;

  if (mentions === 0) {
    narrative =
      `**${brand}** is **not mentioned** by any of the ${providers.length} AI engine${providers.length === 1 ? '' : 's'} tested. ` +
      `All ${total} checks returned zero mentions — AI engines cite other products in your category instead (see "Tracked Competitors" below).`;
    if (snapshots.length === 1) {
      narrative += `\n\nThis is common for new brands or brands without established AEO presence. It's your **baseline**, not a failure.`;
    }
  } else if (visible.length === providers.length) {
    narrative =
      `**${brand}** is mentioned across **all ${providers.length} AI engines** tested (${mentions} of ${total} checks). ` +
      `You have broad AI visibility — the focus shifts to position improvements and competitor pressure (see sections below).`;
  } else {
    const visStr = visible.map(s => `${providerLabel(s.p)} (${s.hits}/${s.total})`).join(', ');
    const invStr = invisible.map(s => providerLabel(s.p)).join(', ');
    narrative =
      `**${brand}** is visible on **${visStr}** but **invisible on ${invStr}** (${mentions} of ${total} checks). ` +
      `Your strongest channel is **${providerLabel(strongest.p)}** (${strongest.hits}/${strongest.total}). ` +
      `The gap between engines points to engine-specific differences in training data and web-search source pools.`;
  }

  return `## Summary — ${brand}'s AI Visibility

${narrative}
`;
}

// ─── Section: Key Metrics — score cards (HTML, rendered by marked.js) ───

export function sectionKeyMetrics(snapshots) {
  const latest = snapshots[snapshots.length - 1];
  const prev = snapshots.length > 1 ? snapshots[snapshots.length - 2] : null;
  const providers = [...new Set(latest.results.map(r => r.provider))];

  const tl = trafficLight(latest.score);
  const scoreDelta = prev ? latest.score - prev.score : null;
  const overallDelta = scoreDelta !== null
    ? (scoreDelta > 0 ? `▲ +${scoreDelta}pp` : scoreDelta < 0 ? `▼ ${scoreDelta}pp` : '▪ no change')
    : '▪ baseline';

  function card(label, value, sub, delta, color) {
    return `<div class="sc" style="border-top:4px solid ${color}"><div class="sc-lbl">${label}</div><div class="sc-val" style="color:${color}">${value}</div><div class="sc-sub">${sub}</div><div class="sc-delta">${delta}</div></div>`;
  }

  const cards = [card('Overall', `${latest.score}%`, tl.label, overallDelta, tl.color)];

  for (const p of providers) {
    const { hits, total, rate } = providerStats(latest.results, p);
    if (total === 0) continue;
    const pct = Math.round(rate * 100);
    const ptl = trafficLight(pct);
    let pDelta = '▪ baseline';
    if (prev) {
      const ps = providerStats(prev.results, p);
      if (ps.total > 0) {
        const prevPct = Math.round(ps.rate * 100);
        const d = pct - prevPct;
        pDelta = d > 0 ? `▲ +${d}pp` : d < 0 ? `▼ ${d}pp` : '▪ no change';
      }
    }
    cards.push(card(providerLabel(p), `${hits}/${total}`, `${pct}% hit rate`, pDelta, ptl.color));
  }

  return `## Key Metrics

<div class="score-cards">${cards.join('')}</div>
`;
}

// ─── Section: Engine Radar (P2) ───

/**
 * Per-engine hit-rate in a single radar visualisation. Reveals shape of
 * visibility: balanced (similar across engines), skewed (one engine dominates),
 * or zero (empty polygon).
 */
export function sectionEngineRadar(snapshots) {
  const latest = snapshots[snapshots.length - 1];
  const providers = [...new Set(latest.results.map(r => r.provider))];
  if (providers.length < 3) return ''; // Radar needs 3+ axes

  const axes = providers.map(p => {
    const s = providerStats(latest.results, p);
    return { label: providerLabel(p), value: Math.round(s.rate * 100) };
  });

  return `## Engine coverage at a glance

_Each axis is one AI engine; the further out the polygon stretches, the more queries the engine mentions your brand for. A tiny polygon or red-dotted axis means "invisible to that engine" — that's your gap._

${radar({ axes })}
`;
}

// ─── Section: AI × Query Matrix (with intro) ───

export function sectionMatrix(snapshots) {
  const latest = snapshots[snapshots.length - 1];
  const queries = [...new Set(latest.results.map(r => r.query))].sort();
  const providers = [...new Set(latest.results.map(r => r.provider))];

  const rows = providers.map(providerLabel);
  const cells = providers.map(p => queries.map(q => {
    const r = latest.results.find(x => x.provider === p && x.query === q);
    return r ? r.mention : 'missing';
  }));

  return `## AI × Query Matrix — ${latest.date}

| | | |
|---|---|---|
| 🟢 **YES** | your brand appeared in the answer text | strong signal |
| 🟡 **SRC** | your brand was only in cited sources | weak signal |
| 🔴 **NO** | not mentioned anywhere | gap |
| ⬜ **—** | not tested / provider skipped | no data |

${heatmap({ rows, cols: queries, cells })}
`;
}

// ─── Section: Engine-specific actions (per-engine HTML cards) ───

const ENGINE_TIPS = {
  openai: {
    name: 'ChatGPT', color: '#10a37f', icon: '🤖',
    why: 'ChatGPT grounds answers in Bing search results. Review platforms and community Q&A are its highest-weight sources.',
    tips: [
      'Get listed on G2, Capterra, or Product Hunt — ChatGPT cites review platforms heavily',
      'Answer questions on Reddit and Quora with your tool mentioned by name',
      'Publish a comparison post (Your Tool vs Alternatives) on your blog or Medium',
    ],
  },
  gemini: {
    name: 'Gemini', color: '#4285f4', icon: '✦',
    why: 'Gemini grounds responses in Google Search results. Domain authority and structured data carry more weight here than on other engines.',
    tips: [
      'Earn citations from high-DR sites Google already indexes for your keywords',
      'Add FAQ schema markup to your landing page (Gemini follows Google\u2019s structured data signals)',
      'Get featured in a roundup post on any high-authority tech blog or newsletter',
    ],
  },
  anthropic: {
    name: 'Claude', color: '#d97757', icon: '◆',
    why: 'Claude uses training data (web crawl + curated sources) and Brave search. Developer ecosystems and product launch pages are over-represented in its training corpus.',
    tips: [
      'Publish on npm or create a GitHub repo \u2014 Claude\u2019s training data over-represents dev ecosystems',
      'Write a detailed post on dev.to or Medium: "How I built X with [Your Tool]"',
      'Launch on Product Hunt \u2014 PH pages are in Claude\u2019s training corpus',
    ],
  },
  perplexity: {
    name: 'Perplexity', color: '#5046e4', icon: '⊕',
    why: 'Perplexity runs real-time multi-source web search. Freshness and breadth of coverage matter more than authority.',
    tips: [
      'Publish fresh content weekly — Perplexity prioritises recency over domain authority',
      'Post answers on Reddit and Quora threads about your category (Perplexity indexes them in real time)',
      'Submit to niche directories and link aggregators in your vertical',
    ],
  },
};

export function sectionEngineActions(snapshots) {
  const latest = snapshots[snapshots.length - 1];
  const providers = [...new Set(latest.results.map(r => r.provider))];
  const stats = providers.map(p => ({ p, ...providerStats(latest.results, p) })).filter(s => s.total > 0);

  const cardsHtml = stats.map(s => {
    const meta = ENGINE_TIPS[s.p];
    if (!meta) return '';
    const pct = Math.round(s.rate * 100);
    const tl = trafficLight(pct);
    const badge = `<span class="ea-badge" style="background:${tl.color}20;color:${tl.color}">${tl.label} ${pct}%</span>`;
    const tipsList = meta.tips.map(t => `<li>${t}</li>`).join('');
    const urgent = s.hits === 0 ? ' ea-card--urgent' : '';
    return `<div class="ea-card${urgent}" style="border-left:4px solid ${meta.color}"><div class="ea-header"><span class="ea-icon">${meta.icon}</span><span class="ea-name">${meta.name}</span>${badge}</div><p class="ea-why">${meta.why}</p><ul class="ea-tips">${tipsList}</ul></div>`;
  }).filter(Boolean).join('');

  if (!cardsHtml) return '';

  return `## Engine-specific actions

_Each AI engine pulls from different source pools — the same content can rank on one engine and be invisible on another._

<div class="engine-actions">${cardsHtml}</div>
`;
}

// ─── Section: Visibility Breakdown (per-engine plain-English) ───

export function sectionVisibilityBreakdown(snapshots) {
  const latest = snapshots[snapshots.length - 1];
  const providers = [...new Set(latest.results.map(r => r.provider))];

  const rows = providers.map(p => {
    const { hits, total, rate } = providerStats(latest.results, p);
    let label, verdict;
    if (total === 0) {
      label = '❓'; verdict = 'not tested';
    } else if (rate >= 0.66) {
      label = '✅'; verdict = `strong (${hits}/${total})`;
    } else if (rate >= 0.34) {
      label = '⚠️'; verdict = `partial (${hits}/${total})`;
    } else if (rate > 0) {
      label = '⚠️'; verdict = `weak (${hits}/${total})`;
    } else {
      label = '❌'; verdict = `invisible (0/${total})`;
    }
    return `| ${label} | **${providerLabel(p)}** | ${verdict} |`;
  });

  return `## Where AI Engines Stand on Your Brand

| | Engine | Status |
|---|---|---|
${rows.join('\n')}

_Read this as the first "so what" of the report. **✅ Strong** = consistent citations; **⚠️ Partial/Weak** = visibility exists but inconsistent, likely fixable with targeted content; **❌ Invisible** = the engine has no reason to know about you yet — typically means you need citations on sources the engine trusts._
`;
}

// ─── Section: Verbatim Quotes ───

export function sectionVerbatimQuotes(snapshots, rawResponses) {
  const latest = snapshots[snapshots.length - 1];
  const blocks = [];

  for (const r of latest.results) {
    if (r.mention === 'no' || r.mention === 'error') continue;
    const key = `${r.query}|${r.provider}`;
    const raw = rawResponses?.[key];
    if (!raw) continue;

    const { snippets, citationOnly } = extractQuotes(raw, latest.brand, latest.domain, r.canonicalCitations || []);

    if (snippets.length > 0) {
      blocks.push(`**${providerLabel(r.provider)}, ${r.query}:**\n> "${snippets[0]}"`);
    } else if (citationOnly) {
      blocks.push(`**${providerLabel(r.provider)}, ${r.query} — citation only:**\n> Brand appears only as a source URL in the answer:\n> \`${citationOnly}\``);
    }
    if (blocks.length >= 6) break;
  }

  if (blocks.length === 0) return '';
  return `## What AI Engines Actually Said

_The exact sentences AI engines generated that mention your brand. These are your current "AI snippets" — what a user actually reads when they ask about your category. Quote-worthy snippets make strong social content._

${blocks.join('\n\n')}
`;
}

// ─── Section: Diff ───

export function sectionDiff(snapshots) {
  if (snapshots.length < 2) {
    return `## What Changed

_This is your first run — there's nothing to compare yet. Trends (gained/lost mentions, competitor movement) become visible starting with your second weekly run._
`;
  }

  const prev = snapshots[snapshots.length - 2];
  const curr = snapshots[snapshots.length - 1];

  const changes = [];
  const seenKeys = new Set();
  for (const r of curr.results) {
    const key = `${r.query}|${r.provider}`;
    seenKeys.add(key);
    const pr = prev.results.find(p => p.query === r.query && p.provider === r.provider);
    const was = pr ? pr.mention : 'missing';
    if (was !== r.mention) changes.push({ provider: r.provider, query: r.query, was, now: r.mention });
  }
  for (const r of prev.results) {
    const key = `${r.query}|${r.provider}`;
    if (!seenKeys.has(key)) {
      changes.push({ provider: r.provider, query: r.query, was: r.mention, now: 'missing' });
    }
  }

  if (changes.length === 0) {
    return `## What Changed (${prev.date} → ${curr.date})

_No cell changes between runs — stable visibility for this cycle._
`;
  }

  const rows = changes.map(ch => {
    const gained = (ch.was === 'no' || ch.was === 'missing') && (ch.now === 'yes' || ch.now === 'src');
    const lost = (ch.was === 'yes' || ch.was === 'src') && (ch.now === 'no' || ch.now === 'missing');
    const sign = gained ? 1 : lost ? -1 : 0;
    return `| ${deltaArrow({ value: sign })} | ${providerLabel(ch.provider)} | ${ch.query} | ${ch.was} | ${ch.now} |`;
  });

  return `## What Changed (${prev.date} → ${curr.date})

| Δ | Provider | Query | Was | Now |
|---|---|---|---|---|
${rows.join('\n')}
`;
}

// ─── Section: Trend per Query ───

export function sectionTrend(snapshots) {
  // P8 — first-run placeholder instead of hiding the section entirely
  if (snapshots.length < 2) {
    const latest = snapshots[snapshots.length - 1];
    const score = latest.score || 0;
    // ASCII-style preview: week 1 marker + 11 weeks ahead
    const marker = score > 0 ? '●' : '○';
    const weeks = [`W1 ${marker}`, 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8', 'W9', 'W10', 'W11', 'W12'];
    return `## Trend per query

_You're on Week 1 of tracking. Sparklines populate from Week 2 onward — come back after \`aeo-tracker run\` next week._

\`\`\`
${weeks.join('   ')}
\`\`\`

_Tracking intent: you're establishing a baseline now. Real signal appears around Week 4 when short-term noise averages out._
`;
  }

  const queries = [...new Set(snapshots.flatMap(s => s.results.map(r => r.query)))].sort();
  const latest = snapshots[snapshots.length - 1];

  const lines = queries.map(q => {
    const values = snapshots.map(s => {
      const rs = s.results.filter(r => r.query === q && r.mention !== 'error');
      if (rs.length === 0) return null;
      const hits = rs.filter(r => r.mention === 'yes' || r.mention === 'src').length;
      return Math.round((hits / rs.length) * 100);
    });
    const sp = sparkline({ values });
    const qText = latest.results.find(r => r.query === q)?.queryText || q;
    return `- ${sp} **${q}:** ${qText}`;
  });

  return `## Trend per Query

_Each sparkline shows how often AI engines mentioned your brand for that query over the tracked period. Up = gaining visibility, flat = stable, down = losing ground._

${lines.join('\n')}
`;
}

// ─── Section: Tracked Competitors ───

export function sectionCompetitors(snapshots) {
  const latest = snapshots[snapshots.length - 1];
  const tracked = latest.topCompetitors || [];
  if (tracked.length === 0) return '';

  // Build YOU row first (accent), then competitors, sorted desc
  const you = { label: `YOU (${latest.brand})`, value: latest.mentions || 0, accent: true };
  const compItems = tracked.slice(0, 8).map(c => ({ label: c.name, value: c.count }));
  const items = [you, ...compItems];

  return `## Competitors vs you

_Your brand's mention count vs each tracked competitor, counted across all checks this run. If a competitor dominates here, that's where AI-engine mindshare sits — invest your content/PR budget in closing the gap._

${barchart({ items })}
`;
}

// ─── Section: Canonical Sources ───

/**
 * Heuristic URL-type classification. Returns short tag for display.
 */
function classifyUrlType(url) {
  const u = String(url).toLowerCase();
  const h = (() => { try { return new URL(url).hostname.toLowerCase(); } catch { return u; } })();
  if (/g2\.com|capterra\.com|producthunt\.com|trustradius\.com|getapp\.com|trustpilot\.com|softwareadvice\.com/.test(h)) return 'review-platform';
  if (/reddit\.com|news\.ycombinator|quora\.com|stackoverflow\.com/.test(h)) return 'community';
  if (/wikipedia\.org/.test(h)) return 'encyclopedia';
  if (/linkedin\.com/.test(h)) return 'social';
  if (/youtube\.com|youtu\.be/.test(h)) return 'video';
  if (/github\.com/.test(h)) return 'code';
  if (/directory|catalog|listings?/.test(u)) return 'directory';
  if (/\/blog|\/posts?|\/articles?|medium\.com|substack\.com|dev\.to/.test(u)) return 'blog';
  if (/reuters\.|bloomberg\.|wired\.|techcrunch\.|forbes\./.test(h)) return 'news';
  if (/agency|consultancy|studio/.test(h)) return 'agency';
  return 'blog';
}

const TYPE_META = {
  'review-platform': { label: 'Review platform', action: 'Create or claim your listing' },
  'community':       { label: 'Community',        action: 'Engage in relevant threads' },
  'encyclopedia':    { label: 'Encyclopedia',     action: 'Add your tool to comparison pages' },
  'directory':       { label: 'Directory',        action: 'Submit your product' },
  'blog':            { label: 'Blog / agency',    action: 'Pitch a mention or guest post' },
  'agency':          { label: 'Agency',           action: 'Pitch a case study or mention' },
  'news':            { label: 'News',             action: 'Pitch a story or press release' },
  'social':          { label: 'Social',           action: 'Engage and post relevant content' },
  'video':           { label: 'Video',            action: 'Pitch a demo or interview' },
  'code':            { label: 'Code / OSS',       action: 'Contribute or open an issue' },
};

export function sectionCanonicalSources(snapshots) {
  const latest = snapshots[snapshots.length - 1];
  const sources = latest.topCanonicalSources || [];
  if (sources.length === 0) return '';

  const hasClassification = latest.citationClassification != null;
  const onCategoryHosts = hasClassification
    ? new Set((latest.citationClassification?.onCategoryDomains || []).map(d => d.hostname))
    : null;
  const industryByHost = new Map(
    (latest.citationClassification?.onCategoryDomains || []).map(d => [d.hostname, d.industry])
  );

  // Group by hostname, filter to on-category only when classification available
  const byHost = new Map();
  for (const s of sources) {
    try {
      const host = new URL(s.url).hostname.replace(/^www\./, '');
      if (hasClassification && !onCategoryHosts.has(host)) continue;
      const existing = byHost.get(host) || { host, total: 0, type: classifyUrlType(s.url) };
      existing.total += s.count;
      byHost.set(host, existing);
    } catch { /* malformed URL — skip */ }
  }

  const grouped = [...byHost.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  if (grouped.length === 0) {
    return `## Where to get mentioned

_No relevant citation targets found yet. Fix the category mismatch (see warning above) and re-run._
`;
  }

  const rows = grouped.map(g => {
    const meta = TYPE_META[g.type] || TYPE_META['blog'];
    const industry = industryByHost.get(g.host) || meta.label;
    return `| \`${g.host}\` | ${meta.label} | ${industry} | ${meta.action} |`;
  }).join('\n');

  return `## Where to get mentioned

_AI engines cite these sites when answering queries in your category. Getting mentioned here is the fastest path to AEO visibility — one mention on a high-trust site propagates across all engines that rely on it._

| Site | Type | About | Your action |
|---|---|---|---|
${rows}
`;
}

// ─── Section: Next Steps (actionable) ───

export function sectionNextSteps(snapshots) {
  const latest = snapshots[snapshots.length - 1];
  const providers = [...new Set(latest.results.map(r => r.provider))];
  const stats = providers.map(p => ({ p, ...providerStats(latest.results, p) }));
  const invisible = stats.filter(s => s.hits === 0 && s.total > 0);
  const partial = stats.filter(s => s.hits > 0 && s.hits < s.total);
  const topSrc = latest.topCanonicalSources?.[0];
  const topCompetitor = latest.topCompetitors?.[0];

  // P6 — short, scannable, checkbox-friendly. Each step = {label, why, estimate}
  const steps = [];

  if (invisible.length > 0) {
    steps.push({
      label: `Target invisible engines (${invisible.map(s => providerLabel(s.p)).join(', ')})`,
      why: 'Different engines pull from different source pools — need one citation on the relevant pool per engine',
      estimate: '~2h research',
    });
  }
  if (partial.length > 0) {
    steps.push({
      label: `Fill query gaps on ${partial.map(s => providerLabel(s.p)).join(', ')}`,
      why: 'You\'re mentioned on some queries but not others — map failing queries to content gaps',
      estimate: '~1h audit',
    });
  }
  if (topSrc) {
    const host = (() => { try { return new URL(topSrc.url).hostname.replace(/^www\./, ''); } catch { return topSrc.url; } })();
    const offHosts = new Set((latest.citationClassification?.offCategoryDomains || []).map(d => d.hostname));
    if (!offHosts.has(host)) {
      steps.push({
        label: `Pitch a guest post / mention on \`${host}\``,
        why: `AI engines cite it ${topSrc.count}× for your queries — single mention propagates to multiple engines`,
        estimate: '~30min outreach',
      });
    }
  }
  if (topCompetitor && topCompetitor.count >= 2) {
    steps.push({
      label: `Reverse-engineer ${topCompetitor.name}'s citation footprint`,
      why: `Appears in ${topCompetitor.count}/${latest.total} of your checks — where AI cites them, it could cite you`,
      estimate: '~1h research',
    });
  }
  if (snapshots.length === 1) {
    steps.push({
      label: 'Re-run `aeo-tracker run` next week',
      why: 'One snapshot is a baseline, not a trend. Week-over-week diff is where the tool becomes actionable',
      estimate: '~2min',
    });
  }

  if (steps.length === 0) return '';

  const checkboxes = steps.map(s =>
    `- [ ] **${s.label}** — ${s.estimate}\n      _${s.why}_`
  ).join('\n');

  return `## Actions this week

_Copy-paste into Todoist / Linear / your tracker of choice. Ordered by impact; pick 1–2 if you're time-constrained._

${checkboxes}
`;
}

// ─── Section: Disambiguation Warning (P4) ───

/**
 * Reads precomputed LLM citation classification from snapshot.citationClassification.
 * Shows a warning when ≥2 cited domains are off-category, regardless of score.
 *
 * Classification is computed once in cmdReport via classifyCitations() and cached
 * in _summary.json — this function is pure sync and costs $0 on subsequent runs.
 */
export function sectionDisambiguationWarning(snapshots) {
  const latest = snapshots[snapshots.length - 1];
  if (!latest) return '';

  const classification = latest.citationClassification;
  if (!classification || !Array.isArray(classification.offCategoryDomains)) return '';
  if (classification.offCategoryDomains.length < 2) return '';

  const offList = classification.offCategoryDomains
    .map(d => `- \`${d.hostname}\` — ${d.industry}`)
    .join('\n');

  const count = classification.offCategoryDomains.length;
  const total = (classification.offCategoryDomains.length + classification.onCategoryDomains.length);

  return `## ⚠ Industry mismatch detected in AI citations

**${count} of ${total} cited domains belong to a different industry** (classified by LLM, not regex):

${offList}

AI engines are interpreting your queries in the wrong vertical. This happens with ambiguous terms (e.g. "AEO" matches both Answer Engine Optimization and EU customs certification).

Fix: re-run init with an explicit disambiguating category:

\`\`\`
aeo-tracker init --refresh-keywords --category="<your category> — NOT <the wrong industry>"
\`\`\`

Example: \`"Answer Engine Optimization services — NOT customs/Authorized Economic Operator"\`
`;
}

// ─── Section: Competitor Intelligence — full query × engine matrix ───

export function sectionCompetitorIntelligence(snapshots) {
  const latest = snapshots[snapshots.length - 1];
  const queries = [...new Set(latest.results.map(r => r.query))].sort();
  const providers = [...new Set(latest.results.map(r => r.provider))];

  if (providers.length === 0 || queries.length === 0) return '';

  // Count total gaps to decide whether section is worth showing
  let totalGaps = 0;
  const matrix = queries.map(q => {
    const firstR = latest.results.find(r => r.query === q);
    const qText = firstR?.queryText || q;
    return {
      query: q,
      short: qText,
      full: qText,
      cells: providers.map(p => {
        const r = latest.results.find(x => x.query === q && x.provider === p);
        if (!r || r.mention === 'error') return { status: 'missing', competitors: [] };
        const cited = (r.competitors || []).slice(0, 4);
        if (r.mention !== 'yes' && r.mention !== 'src') totalGaps++;
        return { status: r.mention, competitors: cited };
      }),
    };
  });

  const badge = (content, bg, fg) =>
    `<span style="background:${bg};color:${fg};padding:2px 8px;border-radius:10px;font-size:.8em;font-weight:700;white-space:nowrap">${content}</span>`;

  const engineHeaders = providers.map(p =>
    `<th style="background:linear-gradient(90deg,#4f46e5,#7c3aed);color:#fff;padding:10px 14px;text-align:left;font-size:.8em;font-weight:700;letter-spacing:.04em;text-transform:uppercase;white-space:nowrap">${providerLabel(p)}</th>`
  ).join('');

  const tableRows = matrix.map(row => {
    const cells = row.cells.map(cell => {
      let content;
      if (cell.status === 'yes') {
        content = badge('✓ YOU', '#dcfce7', '#15803d');
      } else if (cell.status === 'src') {
        content = badge('SRC', '#fef9c3', '#854d0e');
      } else if (cell.status === 'missing' || cell.status === 'error') {
        content = badge('—', '#f1f5f9', '#94a3b8');
      } else if (cell.competitors.length === 0) {
        content = badge('❌', '#fee2e2', '#b91c1c');
      } else {
        const comps = cell.competitors
          .map(c => `<span style="background:#fff0f0;color:#9f1239;font-size:.75em;padding:2px 7px;border-radius:8px;font-weight:600;border:1px solid #fecdd3;white-space:nowrap">${c}</span>`)
          .join(' ');
        content = `<div>${badge('❌', '#fee2e2', '#b91c1c')}</div><div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:5px">${comps}</div>`;
      }
      const bg = (cell.status === 'yes' || cell.status === 'src') ? '#f0fdf4' : (cell.status === 'missing' || cell.status === 'error') ? '#f8fafc' : '#fff9f9';
      return `<td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;background:${bg};vertical-align:top">${content}</td>`;
    }).join('');

    return `<tr><td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:.85em;color:#334155;font-weight:500;vertical-align:top">${row.short}</td>${cells}</tr>`;
  }).join('');

  const gapNote = totalGaps > 0
    ? `_${totalGaps} gap${totalGaps !== 1 ? 's' : ''} found — red cells show who AI cited instead of you._`
    : '_Your brand appeared in all tested queries._';

  return `## Competitor Intelligence

${gapNote}

<div style="overflow-x:auto;margin:16px 0"><table style="width:100%;border-collapse:collapse;border-radius:12px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.07)"><thead><tr><th style="background:linear-gradient(90deg,#4f46e5,#7c3aed);color:#fff;padding:10px 14px;text-align:left;font-size:.8em;font-weight:700;letter-spacing:.04em;text-transform:uppercase">Query</th>${engineHeaders}</tr></thead><tbody>${tableRows}</tbody></table></div>
`;
}

// ─── Section: Footer ───

export function sectionFooter(snapshots) {
  const latest = snapshots[snapshots.length - 1];
  return `---

### Need help getting cited by AI answer engines?

**[Webappski](https://webappski.com/en/aeo-services)** is the AEO agency behind \`aeo-tracker\`. We run weekly audits like this one, implement the kinds of actions this report recommends (third-party placements, comparison pages, authority building), and publish what we learn openly at [webappski.com/blog](https://webappski.com/en/posts/aeo-visibility-challenge-week-1). If you want a second opinion on your numbers — or help turning them around — [talk to us](https://webappski.com/en/aeo-services).

---

_Generated by @webappski/aeo-tracker. Raw responses: \`aeo-responses/${latest.date}/\`. Re-run: \`aeo-tracker report\`._
`;
}
