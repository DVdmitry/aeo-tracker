/**
 * Single-file HTML report renderer.
 *
 * Produces a self-contained HTML document with:
 *   - Google Fonts (Inter + JetBrains Mono) via <link>
 *   - Inline CSS (warm-neutral palette + amber accent, system v2)
 *   - Inline SVG for every chart (no runtime JS, no external images)
 *
 * Input: SummaryJSON (same shape the CLI produces). Output: HTML string.
 */

import {
  TOKENS, ENGINES, STATUS, trafficLight, FONT_SANS, FONT_MONO, esc,
  radar, barchart, sparkline, deltaArrow,
} from '../svg/index.js';

export function renderHtml(summary) {
  const tl = trafficLight(summary.score);
  const scoreDelta = summary.scorePrev == null ? null : summary.score - summary.scorePrev;

  // --- engine cards ---
  const cardsData = summary.engines.map(e => {
    const en = ENGINES[e.provider] || { label: e.label, code: '??', color: TOKENS.ink };
    return {
      code: en.code,
      label: stripParens(e.label),
      kind: e.kind,
      color: en.color,
      pct: e.pct,
      hits: e.hits,
      total: e.total,
      delta: e.delta,
      series: e.series,
    };
  });

  // --- radar ---
  const axes = summary.engines.map(e => ({ label: stripParens(e.label), value: e.pct }));

  // --- competitors bar ---
  const compItems = summary.competitors
    .slice()
    .sort((a,b) => b.count - a.count)
    .map(c => ({ label: c.name, value: c.count, accent: c.accent }));


  // --- coverage ring (mini donut inline) ---
  const coverage = summary.coverage || { yes:0, src:0, no:0, error:0, total:0 };

  // --- quotes ---
  const quotesHtml = summary.quotes.map(q => {
    const en = ENGINES[q.provider] || { label: q.provider, code: '??', color: TOKENS.ink };
    return `
      <figure class="quote">
        <div class="quote-meta">
          <span class="engine-tag" style="--eng:${en.color}">${esc(en.code)} ${esc(en.label)}</span>
          <span class="quote-query">${esc(q.query)}</span>
        </div>
        <blockquote>${esc(q.text)}</blockquote>
      </figure>`;
  }).join('');

  const citationsHtml = (summary.citationOnly || []).map(c => {
    const en = ENGINES[c.provider] || { label: c.provider, code: '??', color: TOKENS.ink };
    return `
      <li class="citation">
        <span class="engine-tag" style="--eng:${en.color}">${esc(en.code)}</span>
        <span class="cite-query">${esc(c.query)}</span>
        <a href="${esc(c.url)}" class="cite-url">${esc(shortenUrl(c.url))}</a>
        <span class="cite-note">cited, not named</span>
      </li>`;
  }).join('');

  // --- actions ---
  const actionKindLabel = { gap: 'Fix gap', defend: 'Defend', compete: 'Compete', win: 'Lock in win' };
  const actionsHtml = summary.actions.map(a => {
    const engineChips = (a.engines || []).map(p => {
      const en = ENGINES[p] || { label: p, code: '??', color: TOKENS.ink };
      return `<span class="engine-tag" style="--eng:${en.color}">${esc(en.code)}</span>`;
    }).join('');
    return `
      <article class="action action--${esc(a.priority)} action--${esc(a.kind)}">
        <header class="action-head">
          <span class="action-kind">${esc(actionKindLabel[a.kind] || a.kind)}</span>
          <span class="action-prio">priority · ${esc(a.priority)}</span>
          <span class="action-engines">${engineChips}</span>
        </header>
        <h3 class="action-title">${esc(a.title)}</h3>
        <p class="action-detail">${esc(a.detail)}</p>
      </article>`;
  }).join('');

  // --- coverage breakdown ---
  const covBar = renderCoverageBar(coverage);

  // --- top sparkline (big hero sparkline) ---
  const heroSpark = sparkline({ values: summary.trend, width: 320, height: 52, color: TOKENS.accent });

  const css = renderCss();

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AEO visibility · ${esc(summary.meta.brand)} · ${esc(summary.meta.date)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap">
<style>${css}</style>
</head>
<body>
<main class="page">

  <header class="masthead">
    <div class="masthead-meta">
      <span class="mast-kicker">AEO Visibility Report</span>
      <h1 class="mast-brand">${esc(summary.meta.brand)}<span class="mast-domain">${esc(summary.meta.domain)}</span></h1>
    </div>
    <dl class="masthead-run">
      <div><dt>Run</dt><dd>${esc(summary.meta.date)}</dd></div>
      <div><dt>vs baseline</dt><dd>${esc(summary.meta.prevDate || '—')}</dd></div>
      <div><dt>Queries</dt><dd>${summary.meta.queryCount}</dd></div>
      <div><dt>Engines</dt><dd>${summary.meta.providerCount}</dd></div>
    </dl>
  </header>

  <section class="hero">
    <div class="hero-score" style="--tl:${tl.color}">
      <span class="hero-label">Visibility score</span>
      <div class="hero-value">
        <span class="hero-num">${summary.score}</span>
        <span class="hero-unit">/ 100</span>
      </div>
      <div class="hero-bucket">
        <span class="hero-dot"></span>
        <span class="hero-bucket-label">${tl.label}</span>
        ${scoreDelta == null ? '' : `<span class="hero-delta ${scoreDelta > 0 ? 'pos' : scoreDelta < 0 ? 'neg' : ''}">${scoreDelta > 0 ? '+' : ''}${scoreDelta} pts vs last run</span>`}
      </div>
      <p class="hero-verb">Next: <strong>${esc(tl.verb)}</strong></p>
    </div>
    <div class="hero-trend">
      <span class="hero-trend-label">Score trend · ${summary.trend.length} run${summary.trend.length !== 1 ? 's' : ''}</span>
      <div class="hero-trend-svg">${heroSpark}</div>
      <div class="hero-trend-axis">
        <span>${esc(summary.meta.prevDate || summary.meta.date)}</span>
        <span>${esc(summary.meta.date)}</span>
      </div>
    </div>
    <div class="hero-coverage">
      <span class="hero-trend-label">Cell coverage · ${coverage.total}</span>
      ${covBar}
      <ul class="cov-legend">
        <li><span class="sw" style="background:${TOKENS.pos}"></span>Named ${coverage.yes}</li>
        <li><span class="sw" style="background:${TOKENS.accent}"></span>Cited ${coverage.src}</li>
        <li><span class="sw sw-outline"></span>Absent ${coverage.no}</li>
        ${coverage.error ? `<li><span class="sw sw-err"></span>Error ${coverage.error}</li>` : ''}
      </ul>
    </div>
  </section>

  <aside class="sponsor">
    <div class="sponsor-body">
      <h3 class="sponsor-head">Need help getting cited by AI answer engines?</h3>
      <p class="sponsor-copy">
        <strong>Webappski</strong> is the AEO agency behind <code>aeo-tracker</code>. We run weekly audits like this one, implement the kinds of actions this report recommends (third-party placements, comparison pages, authority building), and publish what we learn in our open
        <a href="https://webappski.com/en/posts/aeo-visibility-challenge-week-1" class="sponsor-link">AEO Visibility Challenge</a>.
        If you want a second opinion on your numbers — or help turning them around — reach out.
      </p>
    </div>
    <a href="https://webappski.com/en/aeo-services" class="sponsor-cta" target="_blank" rel="noopener">
      Talk to Webappski
      <span class="sponsor-cta-arrow" aria-hidden="true">→</span>
    </a>
  </aside>

  <section class="block">
    <header class="block-head">
      <h2>Per-engine visibility</h2>
      <p>Where your brand surfaces, model by model.</p>
    </header>
    ${renderEngineCards(cardsData)}
  </section>

  <section class="block">
    <header class="block-head">
      <h2>Query × engine heatmap</h2>
      <p>Each cell is one answer. <span class="chip chip-yes">YES</span> named, <span class="chip chip-src">SRC</span> cited only, empty = absent.</p>
    </header>
    ${renderHeatmap(summary)}
  </section>

  ${renderPositionSection(summary)}

  <section class="block">
    <header class="block-head">
      <h2>Coverage shape</h2>
      <p>Filled area = breadth across engines. Hollow ring = engine with no mention.</p>
    </header>
    <div class="chart-wrap chart-center">${radar({ axes, size: 340 })}</div>
  </section>

  <section class="block">
    <header class="block-head">
      <h2>Who AI mentioned instead of you</h2>
      <p>Brands, products or services that AI engines named in answers to your tracked queries — and how often.</p>
    </header>
    <div class="chart-wrap">${barchart({ items: compItems })}</div>
  </section>

  ${renderSourcesSection(summary)}

  <section class="block">
    <header class="block-head">
      <h2>Verbatim mentions</h2>
      <p>Actual sentences surfaced by each engine — use these to judge sentiment and framing.</p>
    </header>
    ${quotesHtml
      ? `<div class="quotes">${quotesHtml}</div>`
      : `<div class="empty-state">
           <span class="empty-icon">○</span>
           <span>No verbatim mentions yet — your brand wasn't named in any answer this run.</span>
         </div>`}
    ${citationsHtml ? `
      <h3 class="sub-head">Cited without naming the brand</h3>
      <ul class="citations">${citationsHtml}</ul>` : ''}
  </section>

  ${renderCostSection(summary)}

  <section class="block">
    <header class="block-head">
      <h2>Recommended actions</h2>
      <p>Prioritised from biggest-visibility-gap to lock-in-win. Each is one concrete thing to ship this week.</p>
    </header>
    <div class="actions">${actionsHtml}</div>
  </section>

  <footer class="colophon">
    <span>Generated by <strong>@webappski/aeo-tracker</strong> · ${esc(summary.meta.runId)}</span>
    <span class="colophon-dot">·</span>
    <a href="https://github.com/DVdmitry/aeo-tracker">open source, zero deps</a>
  </footer>

</main>
<div id="resp-panel" class="resp-panel">
  <div class="resp-panel-head">
    <span id="resp-panel-title" class="resp-panel-title"></span>
    <button class="resp-panel-close" onclick="document.getElementById('resp-panel').style.display='none'">✕</button>
  </div>
  <div id="resp-panel-body" class="resp-panel-body"></div>
</div>
<script>
function showResp(el) {
  var panel = document.getElementById('resp-panel');
  document.getElementById('resp-panel-title').textContent = el.dataset.label || '';
  document.getElementById('resp-panel-body').textContent = el.dataset.excerpt || '';
  panel.style.display = 'block';
}
/* Delegated keyboard handler for all Position-grid cells (role=button).
   Replaces per-cell inline onkeydown attributes — one listener, less markup noise. */
document.addEventListener('keydown', function(e){
  if (e.key !== 'Enter' && e.key !== ' ') return;
  var target = e.target.closest && e.target.closest('.pm-cell-clickable');
  if (!target) return;
  e.preventDefault();
  showResp(target);
});
(function(){
  document.querySelectorAll('.hm-err-tip').forEach(function(tip){
    var box = tip.querySelector('.hm-err-tiptext');
    document.body.appendChild(box);
    tip.addEventListener('mouseenter', function(){
      var r = tip.getBoundingClientRect();
      var left = r.left + r.width / 2 - 100;
      left = Math.max(8, Math.min(left, window.innerWidth - 208));
      box.style.top = (r.bottom + 8) + 'px';
      box.style.left = left + 'px';
      box.style.display = 'block';
    });
    tip.addEventListener('mouseleave', function(){
      box.style.display = 'none';
    });
  });
})();
</script>
</body>
</html>`;
}

const SRC_PALETTE = [
  TOKENS.engChatgpt,
  TOKENS.engGemini,
  TOKENS.engClaude,
  TOKENS.engPerplexity,
  '#8E5A9A',
  '#5A7A3A',
  '#4A5A9E',
  '#9A6A3A',
  '#3A8A7A',
  '#9A3A5A',
];

function parseSrcUrl(u) {
  try {
    const url = new URL(String(u));
    const domain = url.hostname.replace(/^www\./, '');
    const path = url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '');
    return { domain, path };
  } catch {
    return { domain: String(u).replace(/^https?:\/\//, '').split('/')[0], path: '' };
  }
}

function renderSourcesSection(summary) {
  const sources = (summary.sources || []).slice().sort((a, b) => b.count - a.count);
  if (sources.length === 0) return '';

  const max = sources.reduce((m, s) => Math.max(m, s.count), 0) || 1;
  const domainColor = {};
  let ci = 0;

  const rows = sources.map(s => {
    const { domain, path } = parseSrcUrl(s.url);
    if (!domainColor[domain]) domainColor[domain] = SRC_PALETTE[ci++ % SRC_PALETTE.length];
    const color = s.accent ? TOKENS.accent : domainColor[domain];
    const pct = Math.round((s.count / max) * 100);
    const shortPath = path.length > 48 ? path.slice(0, 47) + '…' : path;
    return `
      <div class="src-row">
        <div class="src-bar-col">
          <div class="src-track">
            <div class="src-fill" style="width:${pct}%;background:${esc(color)}"></div>
          </div>
        </div>
        <a href="${esc(s.url)}" class="src-label" target="_blank" rel="noopener">
          <span class="src-domain" style="color:${esc(color)}">${esc(domain)}</span>${shortPath ? `<span class="src-path">${esc(shortPath)}</span>` : ''}
        </a>
        <span class="src-count">${s.count}</span>
      </div>`;
  }).join('');

  return `
  <section class="block">
    <header class="block-head">
      <h2>Canonical sources cited</h2>
      <p>URLs AI engines linked to when answering. Your pages in amber.</p>
    </header>
    <div class="src-list">${rows}</div>
  </section>`;
}

function renderHeatmap(summary) {
  const engines = summary.engines || [];
  const queries = summary.queries || [];
  if (engines.length === 0 || queries.length === 0) return '';

  const thCols = engines.map(e => {
    const en = ENGINES[e.provider] || { label: e.label, color: TOKENS.ink3 };
    return `<th class="hm-eng-th" style="--eng-color:${esc(en.color)}">${esc(stripParens(e.label))}</th>`;
  }).join('');

  const bodyRows = queries.map((q, qi) => {
    const tds = engines.map((e) => {
      const cellData = (e.cells || [])[qi];
      const status = typeof cellData === 'object' ? cellData.status : (cellData || 'missing');
      const errorMsg = typeof cellData === 'object' ? cellData.message : null;
      const st = STATUS[status] || STATUS.missing;
      if (errorMsg) {
        const infoSvg = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="6.25" stroke="currentColor" stroke-width="1.25"/><rect x="6.35" y="6" width="1.3" height="4.5" rx="0.65" fill="currentColor"/><circle cx="7" cy="3.8" r="0.75" fill="currentColor"/></svg>`;
        return `<td class="hm-cell-td"><div class="hm-cell-wrap"><span class="hm-cell hm-${esc(status)}">${esc(st.label)}</span><span class="hm-err-tip">${infoSvg}<span class="hm-err-tiptext">${esc(errorMsg)}</span></span></div></td>`;
      }
      return `<td class="hm-cell-td"><span class="hm-cell hm-${esc(status)}">${esc(st.label)}</span></td>`;
    }).join('');
    return `<tr><td class="hm-query">${esc(q)}</td>${tds}</tr>`;
  }).join('');

  return `
    <div class="hm-wrap">
      <table class="hm-table">
        <thead><tr><th class="hm-corner"></th>${thCols}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>`;
}

function renderEngineCards(cards) {
  if (!cards || cards.length === 0) return '';
  const items = cards.map(c => {
    const color = c.color || TOKENS.ink3;
    const pct = Math.round(c.pct ?? 0);
    const deltaStr = c.delta == null
      ? '▪ baseline'
      : c.delta > 0 ? `▲ +${c.delta}pp`
      : c.delta < 0 ? `▼ ${c.delta}pp`
      : '▪ no change';
    const deltaClass = c.delta == null ? '' : c.delta > 0 ? ' eng-delta-pos' : c.delta < 0 ? ' eng-delta-neg' : '';
    const hitRate = Math.round(((c.hits || 0) / (c.total || 1)) * 100);
    const spW = 152;
    const spH = 24;
    const sparkSvg = sparkline({ values: c.series || [], width: spW, height: spH, color });
    return `
      <div class="eng-card" style="--eng-color:${esc(color)}">
        <div class="eng-card-head">
          <span class="eng-badge">${esc(c.code || '??')}</span>
          <div class="eng-head-text">
            <span class="eng-name">${esc(c.label)}</span>
            <span class="eng-kind">${esc(c.kind || '')}</span>
          </div>
        </div>
        <div class="eng-card-value">
          <span class="eng-pct-num">${pct}<span class="eng-pct-unit">%</span></span>
          <span class="eng-delta${esc(deltaClass)}">${esc(deltaStr)}</span>
        </div>
        <div class="eng-spark">${sparkSvg}</div>
        <hr class="eng-divider">
        <div class="eng-stats">
          <span>Hits <strong>${c.hits}/${c.total}</strong></span>
          <span>${hitRate}% hit</span>
        </div>
      </div>`;
  }).join('');
  return `<div class="eng-cards">${items}</div>`;
}

function renderCostSection(summary) {
  const { sessionCostUsd, totalCostUsd, costBreakdown, costTrend } = summary;
  if (!sessionCostUsd || sessionCostUsd === 0) return '';

  const fmtUsd = (n) => n < 0.001 ? '<$0.001' : `$${n.toFixed(4)}`;
  const fmtK  = (n) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

  const rows = (costBreakdown || []).map(m => {
    const pct = sessionCostUsd > 0 ? (m.costUsd / sessionCostUsd) * 100 : 0;
    return `
      <tr>
        <td class="cost-model">${m.label && m.label !== m.model ? `${esc(m.model)} <span class="cost-label-tag">${esc(m.label)}</span>` : esc(m.model)}</td>
        <td class="cost-num">${m.requests}</td>
        <td class="cost-num">${fmtK(m.inputTokens)}</td>
        <td class="cost-num">${fmtK(m.outputTokens)}</td>
        <td class="cost-num cost-total">
          ${fmtUsd(m.costUsd)}
          <div class="cost-bar-wrap"><div class="cost-bar-fill" style="width:${pct.toFixed(1)}%"></div></div>
        </td>
      </tr>`;
  }).join('');

  const allTimeBlock = (totalCostUsd && costTrend && costTrend.length > 1) ? `
    <div class="cost-alltime">
      <div class="cost-hero">
        <span class="cost-hero-label">All time (${costTrend.length} runs)</span>
        <span class="cost-hero-val">${fmtUsd(totalCostUsd)}</span>
        <span class="cost-hero-sub">avg ${fmtUsd(totalCostUsd / costTrend.length)} / run</span>
      </div>
      <div class="cost-trend">
        ${sparkline({ values: costTrend, width: 200, height: 36, color: TOKENS.accent })}
        <span class="cost-trend-label">cost per run</span>
      </div>
    </div>` : '';

  return `
  <section class="block">
    <header class="block-head">
      <h2>Session cost</h2>
      <p>API spend for this run, broken down by model. Multiply by weekly runs to project monthly budget.</p>
    </header>
    <div class="cost-card">
      <div class="cost-hero">
        <span class="cost-hero-label">This run</span>
        <span class="cost-hero-val">${fmtUsd(sessionCostUsd)}</span>
        <span class="cost-hero-sub">${(costBreakdown || []).reduce((s, m) => s + m.inputTokens + m.outputTokens, 0).toLocaleString()} tokens total</span>
      </div>
      ${allTimeBlock}
    </div>
    <div class="pm-wrap" style="margin-top:16px">
      <table class="cost-table">
        <thead>
          <tr>
            <th>Model</th>
            <th class="cost-num">Req</th>
            <th class="cost-num">In tok</th>
            <th class="cost-num">Out tok</th>
            <th class="cost-num">Cost</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </section>`;
}

function renderPositionSection(summary) {
  const { positionMatrix, engines } = summary;
  if (!positionMatrix || positionMatrix.length === 0) return '';
  const hasData = positionMatrix.some(row =>
    row.columns.some(col => col.position != null || col.competitors.length > 0)
  );
  if (!hasData) return '';

  const thCols = engines.map(e => {
    const en = ENGINES[e.provider] || { label: e.label, color: TOKENS.ink3 };
    return `<th style="color:${en.color}">${esc(stripParens(e.label))}</th>`;
  }).join('');

  const bodyRows = positionMatrix.map(row => {
    const tds = row.columns.map(col => {
      // ── Your brand's mention state ──
      let youHtml;
      if (col.mention === 'error') {
        youHtml = `<span class="pm-err">ERR</span>`;
      } else if (col.mention === 'missing') {
        youHtml = `<span class="pm-gap" title="No data collected for this engine">—</span>`;
      } else if (col.position != null) {
        youHtml = `<span class="pm-you">#${col.position}</span>`;
      } else if (col.responseQuality === 'empty') {
        // Engine responded with essentially nothing (refusal, very short text, no citations)
        youHtml = `<span class="pm-absent" title="Engine returned a refusal or empty response">no answer</span>`;
      } else if (col.responseQuality === 'narrative' && col.competitors.length === 0) {
        // Engine wrote a long narrative but no extractable list of vendors
        youHtml = `<span class="pm-absent" title="Engine answered in prose without a vendor list — open the response">narrative response</span>`;
      } else {
        // 'no' or 'src' — AI responded but brand not in a ranked list
        youHtml = `<span class="pm-absent">not listed</span>`;
      }

      // ── Competitors ──
      // verified: solid badge. unverified: dashed + muted + "?" suffix + tooltip
      // (classifier rejected but name appeared in ≥2 engines — treat as a weaker signal,
      // don't silently hide).
      const comps = col.competitors.map(c => {
        if (c && typeof c === 'object') {
          const cls = c.unverified ? 'pm-comp pm-comp-unverified' : 'pm-comp';
          const title = c.unverified ? ` title="Only one of two extractor models found this name — treat as weaker signal"` : '';
          const mark = c.unverified ? '<span class="pm-comp-q">?</span>' : '';
          return `<span class="${cls}"${title}>${esc(c.name)}${mark}</span>`;
        }
        // Back-compat for old summary.json where competitors is string[]
        return `<span class="pm-comp">${esc(c)}</span>`;
      }).join('');
      const compsLabel = col.competitors.length > 0
        ? `<div class="pm-comps-label">mentioned instead:</div>`
        : '';

      const label = `${esc(stripParens(col.label))} — ${esc(row.query)}`;
      const hasExcerpt = !!col.responseExcerpt;
      // A11y: role=button + tabindex + aria-label + keyboard handler — cell is a
      // real interactive element, not just a styled div. Screen readers announce
      // it as "button"; keyboard users tab through and Enter/Space to open.
      const cellAttrs = hasExcerpt
        ? ` role="button" tabindex="0" aria-label="${esc('View ' + stripParens(col.label) + ' response for: ' + row.query)}" data-excerpt="${esc(col.responseExcerpt)}" data-label="${label}" onclick="showResp(this)"`
        : '';
      const viewLink = hasExcerpt
        ? `<span class="pm-view-link">View response<span class="pm-view-arrow" aria-hidden="true">→</span></span>`
        : '';
      return `<td class="pm-cell${hasExcerpt ? ' pm-cell-clickable' : ''}"${cellAttrs}>${youHtml}${comps ? `<div class="pm-comps">${compsLabel}<div class="pm-comps-row">${comps}</div></div>` : ''}${viewLink}</td>`;
    }).join('');
    return `<tr><td class="pm-query">${esc(row.query)}</td>${tds}</tr>`;
  }).join('');

  return `
  <section class="block">
    <header class="block-head">
      <h2>Position in AI answers</h2>
      <p>Where your brand ranks in numbered AI answers — and which competitors AI mentions instead. #1 = top of the ranked list. Use <span class="pm-inline-hint">View response →</span> on any cell to read the full AI answer.</p>
    </header>
    <div class="pm-wrap">
      <table class="pm-table">
        <thead><tr><th>Query</th>${thCols}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
  </section>`;
}

function stripParens(s) {
  return String(s).replace(/\s*\([^)]*\)/, '').trim();
}

function shortenUrl(u) {
  return String(u).replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function renderCoverageBar({ yes = 0, src = 0, no = 0, error = 0, total = 0 }) {
  const t = total || (yes + src + no + error) || 1;
  const pct = (n) => `${(n / t) * 100}%`;
  return `
    <div class="cov-bar">
      <span class="cov-seg" style="width:${pct(yes)};background:${TOKENS.pos}"></span>
      <span class="cov-seg" style="width:${pct(src)};background:${TOKENS.accent}"></span>
      <span class="cov-seg cov-seg-empty" style="width:${pct(no)}"></span>
      ${error ? `<span class="cov-seg" style="width:${pct(error)};background:${TOKENS.neg}"></span>` : ''}
    </div>`;
}

function renderCss() {
  return `
  :root {
    --bg: ${TOKENS.bg};
    --bg-subtle: ${TOKENS.bgSubtle};
    --bg-raised: ${TOKENS.bgRaised};
    --border: ${TOKENS.border};
    --border-strong: ${TOKENS.borderStrong};
    --ink: ${TOKENS.ink};
    --ink-2: ${TOKENS.ink2};
    --ink-3: ${TOKENS.ink3};
    --ink-4: ${TOKENS.ink4};
    --accent: ${TOKENS.accent};
    --accent-soft: ${TOKENS.accentSoft};
    --accent-ink: ${TOKENS.accentInk};
    --pos: ${TOKENS.pos};
    --neg: ${TOKENS.neg};
    --warn: ${TOKENS.warn};
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: var(--bg);
    color: var(--ink);
    font-family: ${FONT_SANS};
    font-size: 16px;
    line-height: 1.55;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }
  .page {
    max-width: 1080px;
    margin: 0 auto;
    padding: 48px 40px 96px;
  }

  /* ---------- Masthead ---------- */
  .masthead {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: end;
    gap: 24px;
    padding-bottom: 22px;
    border-bottom: 1px solid var(--border);
  }
  .mast-kicker {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: var(--ink-3);
    font-weight: 600;
  }
  .mast-brand {
    font-size: 40px;
    font-weight: 700;
    margin: 6px 0 0;
    letter-spacing: -0.02em;
    line-height: 1.05;
    display: flex;
    align-items: baseline;
    gap: 14px;
  }
  .mast-domain {
    font-family: ${FONT_MONO};
    font-size: 14px;
    font-weight: 400;
    color: var(--ink-3);
    letter-spacing: 0;
  }
  .masthead-run {
    display: flex;
    gap: 28px;
    margin: 0;
  }
  .masthead-run > div { display: flex; flex-direction: column; gap: 2px; }
  .masthead-run dt {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--ink-3);
    font-weight: 600;
  }
  .masthead-run dd {
    margin: 0;
    font-family: ${FONT_MONO};
    font-size: 14px;
    color: var(--ink);
    font-weight: 500;
  }

  /* ---------- Hero ---------- */
  .hero {
    display: grid;
    grid-template-columns: 1.2fr 1fr 1fr;
    gap: 0;
    margin: 28px 0 44px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--bg-raised);
    overflow: hidden;
  }
  .hero > * {
    padding: 26px 28px;
    border-right: 1px solid var(--border);
  }
  .hero > *:last-child { border-right: none; }
  .hero-score {
    background: linear-gradient(180deg, var(--bg-raised) 0%, var(--bg-subtle) 100%);
  }
  .hero-label, .hero-trend-label {
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: var(--ink-3);
    font-weight: 600;
    display: block;
    margin-bottom: 10px;
  }
  .hero-value {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }
  .hero-num {
    font-family: ${FONT_MONO};
    font-size: 72px;
    font-weight: 500;
    letter-spacing: -0.03em;
    color: var(--tl, var(--ink));
    line-height: 1;
  }
  .hero-unit { font-size: 20px; color: var(--ink-3); font-weight: 500; font-family: ${FONT_MONO}; }
  .hero-bucket {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 14px;
  }
  .hero-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--tl, var(--ink-3));
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--tl, var(--ink-3)) 18%, transparent);
  }
  .hero-bucket-label {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--tl, var(--ink));
  }
  .hero-delta {
    font-family: ${FONT_MONO};
    font-size: 12px;
    color: var(--ink-3);
    margin-left: 4px;
  }
  .hero-delta.pos { color: var(--pos); }
  .hero-delta.neg { color: var(--neg); }
  .hero-verb {
    margin: 14px 0 0;
    font-size: 13px;
    color: var(--ink-2);
  }
  .hero-verb strong { color: var(--ink); font-weight: 600; }

  .hero-trend-svg {
    background: var(--bg-subtle);
    border-radius: 8px;
    padding: 6px 8px;
  }
  .hero-trend-axis {
    display: flex;
    justify-content: space-between;
    font-family: ${FONT_MONO};
    font-size: 12px;
    color: var(--ink-3);
    margin-top: 4px;
  }

  .cov-bar {
    display: flex;
    height: 14px;
    border-radius: 6px;
    overflow: hidden;
    background: var(--bg-subtle);
    border: 1px solid var(--border);
  }
  .cov-seg { display: block; height: 100%; }
  .cov-seg-empty { background: repeating-linear-gradient(45deg, var(--bg-subtle), var(--bg-subtle) 4px, var(--bg-raised) 4px, var(--bg-raised) 8px); }
  .cov-legend {
    list-style: none;
    padding: 0;
    margin: 10px 0 0;
    display: flex;
    flex-wrap: wrap;
    gap: 10px 16px;
    font-size: 12px;
    color: var(--ink-2);
  }
  .cov-legend li { display: flex; align-items: center; gap: 6px; }
  .sw { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
  .sw-outline { border: 1px solid var(--ink-4); background: transparent; }
  .sw-err { background: ${TOKENS.neg}; }

  /* ---------- Block (generic section) ---------- */
  .block { margin: 40px 0; }
  .block-head h2 {
    font-size: 20px;
    font-weight: 700;
    letter-spacing: -0.015em;
    margin: 0 0 6px;
    color: var(--ink);
  }
  .block-head p {
    font-size: 13px;
    color: var(--ink-3);
    margin: 0 0 18px;
    max-width: 70ch;
  }
  .block-split { display: grid; grid-template-columns: 1fr 1fr; gap: 36px; }

  .chart-wrap {
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 20px;
    overflow-x: auto;
  }
  .chart-center { display: flex; justify-content: center; }

  /* ---------- Engine cards (HTML flex) ---------- */
  .eng-cards {
    display: flex;
    gap: 10px;
  }
  .eng-card {
    flex: 1;
    min-width: 160px;
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
    padding: 17px 14px 12px;
    display: flex;
    flex-direction: column;
    position: relative;
  }
  .eng-card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: var(--eng-color, var(--ink-3));
  }
  .eng-card-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 16px;
  }
  .eng-badge {
    width: 26px;
    height: 26px;
    border-radius: 6px;
    background: var(--eng-color, var(--ink-3));
    color: #fff;
    font-family: ${FONT_MONO};
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.04em;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .eng-head-text { min-width: 0; }
  .eng-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: block;
  }
  .eng-kind {
    font-size: 12px;
    color: var(--ink-3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: block;
  }
  .eng-card-value {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 8px;
  }
  .eng-pct-num {
    font-family: ${FONT_MONO};
    font-size: 28px;
    font-weight: 500;
    letter-spacing: -0.02em;
    color: var(--eng-color, var(--ink));
    line-height: 1;
    flex-shrink: 0;
  }
  .eng-pct-unit { font-size: 14px; color: var(--ink-3); }
  .eng-delta {
    font-size: 12px;
    font-weight: 500;
    color: var(--ink-3);
    text-align: right;
  }
  .eng-delta-pos { color: var(--pos); }
  .eng-delta-neg { color: var(--neg); }
  .eng-spark { margin-bottom: 10px; line-height: 0; }
  .eng-spark svg { width: 100%; height: auto; }
  .eng-divider {
    border: none;
    border-top: 1px solid var(--border);
    margin: 0 0 10px;
  }
  .eng-stats {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: var(--ink-3);
    font-family: ${FONT_SANS};
  }
  .eng-stats strong {
    font-family: ${FONT_MONO};
    font-weight: 500;
    color: var(--ink);
  }

  .chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: ${FONT_MONO};
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.08em;
    padding: 2px 6px;
    border-radius: 4px;
    color: #FFF;
  }
  .chip-yes { background: var(--pos); }
  .chip-src { background: var(--accent); }

  /* ---------- Heatmap (HTML table) ---------- */
  .hm-wrap { overflow-x: auto; overflow-y: visible; }
  .hm-table {
    width: 100%;
    border-collapse: collapse;
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: visible;
  }
  .hm-corner { width: 0; }
  .hm-eng-th {
    padding: 10px 16px;
    text-align: center;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.04em;
    background: var(--bg-subtle);
    border-bottom: 1px solid var(--border);
    border-left: 1px solid var(--border);
    color: var(--eng-color, var(--ink-3));
    white-space: nowrap;
  }
  .hm-table thead tr th:first-child {
    border-left: none;
    background: var(--bg-subtle);
    border-bottom: 1px solid var(--border);
  }
  .hm-query {
    padding: 12px 16px;
    font-size: 13.5px;
    color: var(--ink-2);
    line-height: 1.45;
    border-bottom: 1px solid var(--border);
    min-width: 260px;
    max-width: 400px;
    vertical-align: middle;
  }
  .hm-table tbody tr:last-child td { border-bottom: none; }
  .hm-cell-td {
    text-align: center;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
    border-left: 1px solid var(--border);
    vertical-align: middle;
  }
  .hm-cell {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: ${FONT_MONO};
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.08em;
    padding: 4px 10px;
    border-radius: 6px;
    min-width: 46px;
  }
  .hm-yes { background: ${TOKENS.pos};       color: #fff; }
  .hm-src { background: ${TOKENS.accent};    color: #fff; }
  .hm-no  { background: none; color: var(--ink-4); border: 1px solid var(--border); }
  .hm-missing { background: none; color: var(--ink-4); border: 1px dashed var(--border); }
  .hm-error { background: ${TOKENS.neg}; color: #fff; }
  .hm-cell-td { position: relative; }
  .hm-cell-wrap { display: inline-flex; align-items: center; gap: 5px; }
  .hm-err-tip {
    display: inline-flex;
    align-items: center;
    color: ${TOKENS.neg};
    opacity: 0.75;
    cursor: help;
    transition: opacity 0.15s;
    position: relative;
    top: -15px;
  }
  .hm-err-tip:hover { opacity: 1; }
  .hm-err-tiptext {
    display: none;
    position: fixed;
    width: 200px;
    white-space: normal;
    word-break: break-word;
    background: color-mix(in srgb, ${TOKENS.neg} 5%, var(--bg));
    border: 1px solid color-mix(in srgb, ${TOKENS.neg} 25%, transparent);
    border-radius: 10px;
    padding: 12px 16px;
    font-size: 12px;
    font-family: ${FONT_MONO};
    color: ${TOKENS.neg};
    z-index: 9999;
    text-align: left;
    box-shadow: 0 6px 24px rgba(0,0,0,0.12);
  }

  /* ---------- Sources list ---------- */
  .src-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .src-row {
    display: grid;
    grid-template-columns: 180px 1fr auto;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 10px;
  }
  .src-bar-col { display: flex; align-items: center; }
  .src-track {
    width: 100%;
    height: 8px;
    background: var(--bg-subtle);
    border-radius: 4px;
    overflow: hidden;
  }
  .src-fill { height: 100%; border-radius: 4px; }
  .src-label {
    display: flex;
    align-items: baseline;
    gap: 6px;
    text-decoration: none;
    min-width: 0;
    overflow: hidden;
  }
  .src-label:hover .src-domain { text-decoration: underline; }
  .src-domain {
    font-family: ${FONT_MONO};
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .src-path {
    font-size: 12px;
    color: var(--ink-3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: ${FONT_MONO};
  }
  .src-count {
    font-family: ${FONT_MONO};
    font-size: 13px;
    font-weight: 600;
    color: var(--ink-3);
    white-space: nowrap;
  }

  /* ---------- Empty state ---------- */
  .empty-state {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 20px 24px;
    background: var(--bg-raised);
    border: 1px dashed var(--border-strong);
    border-radius: 10px;
    font-size: 13.5px;
    color: var(--ink-3);
  }
  .empty-icon {
    font-size: 18px;
    color: var(--ink-4);
    flex-shrink: 0;
  }

  /* ---------- Quotes ---------- */
  .quotes { display: grid; gap: 14px; }
  .quote {
    margin: 0;
    padding: 18px 22px;
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-left: 3px solid var(--accent);
    border-radius: 10px;
  }
  .quote-meta {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 10px;
    font-size: 12px;
  }
  .quote-query {
    font-family: ${FONT_MONO};
    font-size: 13px;
    color: var(--ink-3);
  }
  .quote blockquote {
    margin: 0;
    font-size: 15px;
    line-height: 1.6;
    color: var(--ink);
    text-wrap: pretty;
  }
  .engine-tag {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: ${FONT_MONO};
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.06em;
    color: #FFF;
    background: var(--eng);
    padding: 2px 7px;
    border-radius: 4px;
  }

  .sub-head {
    margin: 24px 0 10px;
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--ink-3);
  }
  .citations {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 8px;
  }
  .citation {
    display: grid;
    grid-template-columns: auto 1fr auto auto;
    gap: 12px;
    align-items: center;
    padding: 10px 14px;
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 8px;
    font-size: 13px;
  }
  .cite-query { color: var(--ink-2); }
  .cite-url {
    font-family: ${FONT_MONO};
    font-size: 12px;
    color: var(--accent-ink);
    text-decoration: none;
    border-bottom: 1px dotted var(--accent);
  }
  .cite-note {
    font-size: 13px;
    color: var(--ink-3);
    font-style: italic;
  }

  /* ---------- Actions ---------- */
  .actions { display: grid; gap: 14px; }
  .action {
    padding: 22px 24px;
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 12px;
    border-left: 4px solid var(--ink-4);
  }
  .action--high { border-left-color: var(--neg); }
  .action--med  { border-left-color: var(--accent); }
  .action--low  { border-left-color: var(--pos); }

  .action-head {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 10px;
    font-size: 13px;
  }
  .action-kind {
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--ink);
  }
  .action-prio {
    color: var(--ink-3);
    font-family: ${FONT_MONO};
  }
  .action-engines { display: inline-flex; gap: 4px; margin-left: auto; }
  .action-title {
    font-size: 17px;
    font-weight: 600;
    margin: 0 0 6px;
    letter-spacing: -0.01em;
    text-wrap: balance;
  }
  .action-detail {
    margin: 0;
    font-size: 14px;
    line-height: 1.6;
    color: var(--ink-2);
    text-wrap: pretty;
    max-width: 72ch;
  }

  /* ---------- Sponsor (soft CTA from tool author — sits right under hero) ---------- */
  .sponsor {
    margin: 24px 0 8px;
    padding: 22px 24px;
    background: var(--bg-subtle);
    border: 1px solid var(--border);
    border-radius: 12px;
    display: flex;
    gap: 20px;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
  }
  .sponsor-body { flex: 1 1 420px; min-width: 0; }
  .sponsor-head {
    margin: 0 0 6px;
    font-size: 15px;
    font-weight: 600;
    color: var(--ink);
    letter-spacing: -0.01em;
  }
  .sponsor-copy {
    margin: 0;
    font-size: 13px;
    line-height: 1.55;
    color: var(--ink-2);
  }
  .sponsor-copy code {
    font-family: ${FONT_MONO};
    font-size: 12px;
    background: var(--bg-raised);
    padding: 1px 5px;
    border-radius: 3px;
  }
  .sponsor-link { color: ${TOKENS.accent}; text-decoration: none; font-weight: 500; }
  .sponsor-link:hover { text-decoration: underline; text-underline-offset: 2px; }
  .sponsor-cta {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 10px 16px;
    background: ${TOKENS.accent};
    color: var(--bg-raised);
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    text-decoration: none;
    white-space: nowrap;
    transition: filter 0.15s ease;
  }
  /* Hover: 8% darken via filter — enough to feel interactive, not enough to look
     broken or diverge from the base accent palette. Single var so base accent can
     change without tuning hover. */
  .sponsor-cta:hover { filter: brightness(0.92); }
  .sponsor-cta-arrow { transition: transform 0.15s ease; }
  .sponsor-cta:hover .sponsor-cta-arrow { transform: translateX(3px); }
  @media (prefers-reduced-motion: reduce) {
    .sponsor-cta, .sponsor-cta-arrow { transition: none; }
    .sponsor-cta:hover .sponsor-cta-arrow { transform: none; }
  }

  /* ---------- Colophon ---------- */
  .colophon {
    margin-top: 56px;
    padding-top: 24px;
    border-top: 1px solid var(--border);
    display: flex;
    gap: 10px;
    align-items: center;
    font-size: 12px;
    color: var(--ink-3);
    font-family: ${FONT_MONO};
  }
  .colophon a { color: var(--ink-3); text-decoration: none; border-bottom: 1px dotted var(--border-strong); }

  /* ---------- Cost section ---------- */
  .cost-card {
    display: flex;
    align-items: center;
    gap: 32px;
    padding: 22px 28px;
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 12px;
  }
  .cost-hero { display: flex; flex-direction: column; gap: 4px; }
  .cost-hero-label {
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--ink-3);
    font-weight: 600;
  }
  .cost-hero-val {
    font-family: ${FONT_MONO};
    font-size: 36px;
    font-weight: 600;
    color: var(--accent);
    letter-spacing: -0.02em;
    line-height: 1;
  }
  .cost-hero-sub { font-size: 12px; color: var(--ink-3); margin-top: 2px; }
  .cost-alltime {
    display: flex;
    align-items: center;
    gap: 32px;
    padding-left: 40px;
    margin-left: 40px;
    border-left: 1px solid var(--border);
  }
  .cost-trend { display: flex; align-items: center; gap: 10px; }
  .cost-trend-label { font-size: 13px; color: var(--ink-4); text-transform: uppercase; letter-spacing: 0.1em; }
  .cost-label-tag { font-size: 11px; color: var(--ink-4); margin-left: 6px; }
  .cost-table {
    width: 100%;
    border-collapse: collapse;
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
  }
  .cost-table th {
    padding: 9px 14px;
    text-align: left;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ink-3);
    background: var(--bg-subtle);
    border-bottom: 1px solid var(--border);
  }
  .cost-table td {
    padding: 11px 14px;
    border-bottom: 1px solid var(--border);
    font-size: 13px;
  }
  .cost-table tr:last-child td { border-bottom: none; }
  .cost-model { font-family: ${FONT_MONO}; color: var(--ink-2); font-size: 12px; }
  .cost-num { text-align: left; font-family: ${FONT_MONO}; font-size: 12px; color: var(--ink-3); }
  .cost-total {
    color: var(--ink);
    font-weight: 600;
    min-width: 120px;
    text-align: left !important;
  }
  .cost-bar-wrap { height: 4px; background: var(--bg-subtle); border-radius: 2px; overflow: hidden; margin-top: 5px; }
  .cost-bar-fill { height: 100%; background: var(--accent); border-radius: 2px; }

  /* ---------- Position matrix ---------- */
  .pm-wrap { overflow-x: auto; }
  .pm-table {
    width: 100%;
    border-collapse: collapse;
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
  }
  .pm-table th {
    padding: 10px 16px;
    text-align: left;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    background: var(--bg-subtle);
    border-bottom: 1px solid var(--border);
  }
  .pm-table td {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    vertical-align: top;
  }
  .pm-table tr:last-child td { border-bottom: none; }
  .pm-query {
    font-size: 13px;
    color: var(--ink-2);
    max-width: 240px;
    line-height: 1.4;
  }
  .pm-cell { min-width: 140px; vertical-align: top; padding: 10px 14px; }
  .pm-cell-clickable {
    cursor: pointer;
    transition: background 0.15s ease;
    outline: 0;
  }
  .pm-cell-clickable:hover { background: var(--bg-subtle); }
  .pm-cell-clickable:focus-visible {
    /* Keyboard focus ring — inset so it doesn't disrupt table grid alignment */
    box-shadow: inset 0 0 0 2px ${TOKENS.accent};
  }
  /* Inline hint inside the block-head paragraph — teaches the user what the
     per-cell affordance looks like (same visual as .pm-view-link). */
  .pm-inline-hint {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 1px 6px;
    border-radius: 4px;
    background: var(--bg-subtle);
    color: ${TOKENS.accent};
    font-weight: 500;
    font-size: 12px;
    white-space: nowrap;
  }
  /* Link-style affordance for the "View response" action. Stays discoverable
     without hovering (accent colour + weight 500) and animates the arrow on
     hover to reinforce "this will open something". */
  .pm-view-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-top: 10px;
    font-size: 12px;
    font-weight: 500;
    color: ${TOKENS.accent};
    letter-spacing: 0.01em;
    line-height: 1;
  }
  .pm-view-arrow {
    display: inline-block;
    transition: transform 0.18s ease;
    font-size: 13px;
  }
  .pm-cell-clickable:hover .pm-view-link { text-decoration: underline; text-underline-offset: 2px; }
  .pm-cell-clickable:hover .pm-view-arrow { transform: translateX(3px); }
  .pm-cell-clickable:focus-visible .pm-view-arrow { transform: translateX(3px); }
  /* Respect prefers-reduced-motion — kill the micro-animation for users who opt out */
  @media (prefers-reduced-motion: reduce) {
    .pm-view-arrow { transition: none; }
    .pm-cell-clickable:hover .pm-view-arrow,
    .pm-cell-clickable:focus-visible .pm-view-arrow { transform: none; }
  }
  .resp-panel {
    display: none;
    position: fixed;
    bottom: 0; left: 0; right: 0;
    max-height: 38vh;
    background: var(--bg-raised);
    border-top: 2px solid var(--border);
    z-index: 8888;
    box-shadow: 0 -6px 32px rgba(0,0,0,0.13);
  }
  .resp-panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 20px 8px;
    border-bottom: 1px solid var(--border);
    position: sticky;
    top: 0;
    background: var(--bg-raised);
  }
  .resp-panel-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--ink-2);
  }
  .resp-panel-close {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 16px;
    color: var(--ink-3);
    padding: 2px 6px;
    border-radius: 4px;
    line-height: 1;
  }
  .resp-panel-close:hover { background: var(--bg-subtle); color: var(--ink); }
  .resp-panel-body {
    padding: 14px 20px 20px;
    font-size: 13px;
    font-family: ${FONT_MONO};
    color: var(--ink-2);
    line-height: 1.65;
    white-space: pre-wrap;
    overflow-y: auto;
    max-height: calc(38vh - 44px);
  }
  .pm-you {
    display: inline-block;
    font-family: ${FONT_MONO};
    font-weight: 700;
    font-size: 14px;
    color: ${TOKENS.pos};
    background: ${TOKENS.posSoft};
    padding: 2px 9px;
    border-radius: 6px;
  }
  .pm-gap {
    font-family: ${FONT_MONO};
    font-size: 13px;
    color: var(--ink-4);
  }
  .pm-absent {
    font-size: 12px;
    color: var(--ink-4);
    font-style: italic;
  }
  .pm-err {
    display: inline-block;
    font-family: ${FONT_MONO};
    font-size: 11px;
    font-weight: 700;
    color: #fff;
    background: ${TOKENS.neg};
    padding: 2px 7px;
    border-radius: 4px;
    letter-spacing: 0.06em;
  }
  .pm-comps {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 6px;
  }
  .pm-comps-label {
    font-size: 11px;
    color: var(--ink-4);
    letter-spacing: 0.02em;
    margin-bottom: 2px;
  }
  .pm-comps-row { display: flex; flex-wrap: wrap; gap: 4px; }
  .pm-comp {
    font-size: 13px;
    color: ${TOKENS.neg};
    background: ${TOKENS.negSoft};
    padding: 1px 7px;
    border-radius: 4px;
    font-family: ${FONT_MONO};
    font-weight: 500;
  }
  /* Unverified tier — only one of the two extractor models found this brand.
     Dashed border + faded colour signals "weaker signal, treat with caution". */
  .pm-comp-unverified {
    background: transparent;
    color: var(--ink-4);
    border: 1px dashed var(--border);
    opacity: 0.85;
  }
  .pm-comp-q {
    font-size: 10px;
    margin-left: 3px;
    opacity: 0.7;
    vertical-align: super;
  }

  @media (max-width: 880px) {
    .masthead { grid-template-columns: 1fr; }
    .hero { grid-template-columns: 1fr; }
    .hero > * { border-right: none; border-bottom: 1px solid var(--border); }
    .hero > *:last-child { border-bottom: none; }
    .block-split { grid-template-columns: 1fr; }
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #17140F;
      --bg-subtle: #221E17;
      --bg-raised: #1D1913;
      --border: #332D23;
      --border-strong: #423A2C;
      --ink: #F3EEE3;
      --ink-2: #C9C1B0;
      --ink-3: #8C8373;
      --ink-4: #605747;
    }
  }
  `;
}
