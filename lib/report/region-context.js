/**
 * Per-response region/locale context extraction.
 *
 * Different AI engines expose different region signals in their raw responses:
 *
 *   - OpenAI:    no explicit region in response. Heuristic only:
 *                citation TLD distribution (.de, .pl, .fr → regional intent)
 *   - Gemini:    `groundingMetadata.searchEntryPoint.renderedContent` may
 *                include locale hints. `webSearchQueries` show what query
 *                Google issued (sometimes localised).
 *   - Anthropic: no region exposure (web_search disabled, training-data only)
 *   - Perplexity: `search_results` items often have region hints in URL TLDs
 *                 + occasional explicit `country` field in API.
 *
 * Output per response: `{ provider, detectedRegion, confidence, source, signals }`.
 *
 * Aggregated across all responses: `{ dominantRegion, confidence, perRegion: {...counts} }`.
 *
 * Why this matters: multi-language sites need to know which region engines
 * THINK they are in. If Gemini consistently issues English-locale searches
 * for a brand whose ICP is German, the brand will never surface for DE queries.
 *
 * v1: extracts what's available, doesn't guess. Returns `null` regions as `'unknown'`
 * with `confidence: 'none'` — plan generator handles this without grounding.
 */

// Country code → broad region mapping (used for dominant-region aggregation)
const COUNTRY_REGION = {
  us: 'NA', ca: 'NA', mx: 'NA',
  de: 'EU', fr: 'EU', es: 'EU', it: 'EU', nl: 'EU', pl: 'EU', ru: 'EU',
  uk: 'EU', gb: 'EU', se: 'EU', no: 'EU', dk: 'EU', fi: 'EU', be: 'EU',
  ch: 'EU', at: 'EU', cz: 'EU', pt: 'EU', ie: 'EU', hu: 'EU',
  cn: 'APAC', jp: 'APAC', kr: 'APAC', in: 'APAC', sg: 'APAC', au: 'APAC', nz: 'APAC',
  br: 'LATAM', ar: 'LATAM', cl: 'LATAM',
  za: 'AF', ng: 'AF', eg: 'AF',
  ae: 'ME', sa: 'ME', il: 'ME',
};

// Common TLDs that strongly signal regional intent
const COUNTRY_TLDS = new Set(Object.keys(COUNTRY_REGION));

/**
 * Extract country code from a URL's hostname (last TLD if it's a known ccTLD).
 * `example.de` → `de`. `example.com` → null. `example.co.uk` → `uk`.
 */
export function extractTldCountry(url) {
  if (!url || typeof url !== 'string') return null;
  let host;
  try { host = new URL(url).hostname.toLowerCase(); }
  catch { return null; }
  const parts = host.split('.');
  if (parts.length < 2) return null;
  // Last segment is TLD; check both .co.uk style and plain .de
  const last = parts[parts.length - 1];
  const secondLast = parts[parts.length - 2];
  if (COUNTRY_TLDS.has(last)) return last;
  if (last === 'uk' || (last === 'co' && COUNTRY_TLDS.has(secondLast))) {
    return COUNTRY_TLDS.has(secondLast) ? secondLast : null;
  }
  return null;
}

/**
 * Aggregate ccTLD distribution across an array of citation URLs.
 * Returns `{ counts: { de: N, us: N, ... }, total, topCountry, topRegion }`.
 */
export function aggregateTldDistribution(urls) {
  const counts = {};
  let total = 0;
  for (const url of (urls || [])) {
    const cc = extractTldCountry(url);
    if (!cc) continue;
    counts[cc] = (counts[cc] || 0) + 1;
    total++;
  }
  if (total === 0) {
    return { counts: {}, total: 0, topCountry: null, topRegion: null };
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const topCountry = sorted[0][0];
  const topRegion = COUNTRY_REGION[topCountry] || null;
  return { counts, total, topCountry, topRegion };
}

/**
 * Extract region signals from one cell's raw response.
 *
 * @param {Object} cell  one item from summary.results[]
 * @returns {Object} { provider, detectedRegion, confidence, source, signals }
 */
export function extractRegionSignals(cell) {
  if (!cell || typeof cell !== 'object') {
    return { provider: null, detectedRegion: null, confidence: 'none', source: null, signals: {} };
  }
  const provider = cell.provider || null;
  const result = { provider, detectedRegion: null, confidence: 'none', source: null, signals: {} };

  // Provider-specific extraction from `cell.raw` (if present) or
  // top-level metadata fields.
  const raw = cell.raw || {};

  // Gemini: groundingMetadata.searchEntryPoint + webSearchQueries
  if (provider === 'gemini') {
    const gm = raw.candidates?.[0]?.groundingMetadata || raw.groundingMetadata;
    if (gm) {
      const queries = gm.webSearchQueries || [];
      const searchEntry = gm.searchEntryPoint?.renderedContent || '';
      result.signals.webSearchQueries = queries.slice(0, 3);
      // Locale hint: if rendered content has hl=XX or gl=XX param
      const hlMatch = searchEntry.match(/[?&]hl=([a-z]{2})/i);
      const glMatch = searchEntry.match(/[?&]gl=([a-z]{2})/i);
      if (glMatch) {
        result.detectedRegion = glMatch[1].toUpperCase();
        result.source = 'gemini.searchEntryPoint.gl';
        result.confidence = 'high';
      } else if (hlMatch) {
        result.detectedRegion = hlMatch[1].toUpperCase();
        result.source = 'gemini.searchEntryPoint.hl';
        result.confidence = 'med';
      }
    }
  }

  // Perplexity: search_results items have URL → ccTLD heuristic
  if (provider === 'perplexity') {
    const searchResults = raw.search_results || raw.results || [];
    const urls = (Array.isArray(searchResults) ? searchResults : [])
      .map(r => r.url || r.link || '').filter(Boolean);
    const tld = aggregateTldDistribution(urls);
    if (tld.total > 0 && tld.topCountry) {
      result.detectedRegion = tld.topCountry.toUpperCase();
      result.source = 'perplexity.searchResults.tldDistribution';
      result.confidence = tld.counts[tld.topCountry] >= 3 ? 'high' : 'med';
      result.signals.tldDistribution = tld.counts;
    }
  }

  // OpenAI / fallback: ccTLD distribution from canonicalCitations
  if (provider === 'openai' || result.detectedRegion === null) {
    const cites = cell.canonicalCitations || [];
    if (cites.length > 0) {
      const tld = aggregateTldDistribution(cites);
      if (tld.total > 0 && tld.topCountry) {
        // Only override if not already detected with higher confidence
        if (result.confidence === 'none') {
          result.detectedRegion = tld.topCountry.toUpperCase();
          result.source = `${provider || 'openai'}.canonicalCitations.tldDistribution`;
          result.confidence = tld.counts[tld.topCountry] >= 3 ? 'med' : 'low';
          result.signals.tldDistribution = tld.counts;
        }
      }
    }
  }

  return result;
}

/**
 * Aggregate per-cell regions into a single dominant region for the run.
 * Returns:
 *   {
 *     dominantRegion, confidence, perRegion: { US: N, DE: N, ... },
 *     perProvider: { openai: 'US', gemini: 'EU', ... },
 *     mixedSignals: bool   // true if no single region > 50%
 *   }
 */
export function aggregateRegionContext(cellSignals) {
  const perRegion = {};
  const perProvider = {};
  let total = 0;
  for (const s of (cellSignals || [])) {
    if (!s || !s.detectedRegion) continue;
    perRegion[s.detectedRegion] = (perRegion[s.detectedRegion] || 0) + 1;
    if (s.provider && !perProvider[s.provider]) {
      perProvider[s.provider] = s.detectedRegion;
    }
    total++;
  }
  if (total === 0) {
    return { dominantRegion: null, confidence: 'none', perRegion: {}, perProvider: {}, mixedSignals: false };
  }
  const sorted = Object.entries(perRegion).sort((a, b) => b[1] - a[1]);
  const top = sorted[0];
  const topShare = top[1] / total;
  return {
    dominantRegion: top[0],
    confidence: topShare >= 0.7 ? 'high' : (topShare >= 0.5 ? 'med' : 'low'),
    perRegion,
    perProvider,
    mixedSignals: topShare < 0.5,
  };
}

/**
 * Top-level: extract region signals from all cells in `summary.results`,
 * aggregate, return `{ aggregate, perCell }` for caching in
 * `_summary.json::regionContext`.
 */
export function checkRegionContext(summary) {
  const cells = (summary && Array.isArray(summary.results)) ? summary.results : [];
  const perCell = cells.map(extractRegionSignals);
  const aggregate = aggregateRegionContext(perCell);
  return {
    ranAt: new Date().toISOString(),
    aggregate,
    perCell: perCell.filter(s => s.detectedRegion !== null), // only meaningful entries
  };
}
