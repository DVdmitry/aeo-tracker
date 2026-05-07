/**
 * AI Ads / sponsored-content detector for engine responses.
 *
 * Brandlight tracks "AI Ads Analysis" — paid placements appearing inside
 * AI answers as inventory becomes commercial. We approximate this with
 * heuristic markers that surface when AI engines surface paid placements:
 *
 *   - Inline labels: "Sponsored", "Promoted", "Ad", "Paid placement"
 *   - Disclosure phrases: "[paid]", "(advertisement)", "sponsored content"
 *   - Known ad-network domains in citations (DoubleClick, Taboola, Outbrain)
 *
 * The detector is a precision-over-recall heuristic — it will miss paid
 * placements that aren't disclosed (which is most of them), but it won't
 * false-positive on natural content. False positives undermine the signal.
 *
 * Pure function over a single response text + citation list.
 */

// Two patterns OR'd together: (1) word-bounded phrases like "sponsored content"
// and (2) bracketed/parenthesised disclosures like "[paid]" / "(advertisement)"
// — the leading \b can't anchor on `[` or `(`, hence the split.
const INLINE_MARKERS_RE = /(?:\b(?:sponsored\s+(?:by|content|post|placement)|paid\s+(?:placement|partnership|ad)|advertisement|promoted\s+(?:by|content))\b|\[\s*(?:sponsored|paid|promoted|ad|advertisement)\s*\]|\(\s*(?:sponsored|paid|advertisement)\s*\))/gi;

const AD_NETWORK_DOMAINS = new Set([
  'doubleclick.net',
  'googleadservices.com',
  'googlesyndication.com',
  'googletagmanager.com',
  'taboola.com',
  'outbrain.com',
  'criteo.com',
  'adnxs.com',
  'rubiconproject.com',
  'pubmatic.com',
  'openx.net',
  'media.net',
]);

/**
 * Scan a single response. Returns:
 *   {
 *     adMarkers: [{ kind, snippet }],     // text-level disclosures found
 *     adNetworkCitations: [{ url, host }], // citations on known ad networks
 *     hasAdSignal: boolean,
 *   }
 */
export function detectAdsInResponse(text, citations = []) {
  const adMarkers = [];
  if (typeof text === 'string' && text.length > 0) {
    const matches = text.matchAll(INLINE_MARKERS_RE);
    for (const m of matches) {
      const idx = m.index ?? 0;
      const start = Math.max(0, idx - 60);
      const end = Math.min(text.length, idx + m[0].length + 60);
      adMarkers.push({
        kind: m[0].toLowerCase().replace(/\s+/g, '-').replace(/[\[\]\(\)]/g, '').trim(),
        snippet: text.slice(start, end).replace(/\s+/g, ' ').trim(),
      });
    }
  }

  const adNetworkCitations = [];
  for (const url of (citations || [])) {
    if (!url || typeof url !== 'string') continue;
    try {
      const host = new URL(url).hostname.replace(/^www\./, '');
      const parent = host.split('.').slice(-2).join('.');
      if (AD_NETWORK_DOMAINS.has(host) || AD_NETWORK_DOMAINS.has(parent)) {
        adNetworkCitations.push({ url, host });
      }
    } catch { /* skip malformed */ }
  }

  return {
    adMarkers,
    adNetworkCitations,
    hasAdSignal: adMarkers.length > 0 || adNetworkCitations.length > 0,
  };
}

/**
 * Aggregate ad signals across a whole run's results array.
 * Returns:
 *   {
 *     totalCellsScanned, totalCellsWithAdSignal,
 *     byProvider: { providerName: count },
 *     samples: [{ provider, query, kind, snippet }]   // top-5 illustrative hits
 *   }
 *
 * The detector receives `results` after each cell has been augmented with
 * `adMarkers` / `adNetworkCitations` (or those fields missing). We accept
 * either shape so the caller can choose: detect-on-the-fly or detect-now.
 */
export function summariseAdsAcrossResults(results) {
  const total = (results || []).length;
  let withSignal = 0;
  const byProvider = {};
  const samples = [];

  for (const r of (results || [])) {
    const markers = r.adMarkers || [];
    const adCites = r.adNetworkCitations || [];
    if (markers.length === 0 && adCites.length === 0) continue;
    withSignal++;
    byProvider[r.provider] = (byProvider[r.provider] || 0) + 1;
    for (const m of markers) {
      if (samples.length < 5) {
        samples.push({ provider: r.provider, query: r.query, kind: m.kind, snippet: m.snippet });
      }
    }
    for (const c of adCites) {
      if (samples.length < 5) {
        samples.push({ provider: r.provider, query: r.query, kind: 'ad-network-citation', snippet: c.host });
      }
    }
  }

  return {
    totalCellsScanned: total,
    totalCellsWithAdSignal: withSignal,
    byProvider,
    samples,
  };
}
