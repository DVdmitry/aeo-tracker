/**
 * UTM citation tracker.
 *
 * If the user adds UTM parameters to URLs they want AI engines to cite (e.g.
 * `?utm_source=ai&utm_medium=chatgpt&utm_campaign=aeo-q4`), this module
 * surfaces which AI engines / queries actually cited those tagged URLs.
 *
 * The complement to the share-of-voice domain table: that one shows where
 * AI gets answers FROM, this one shows whether AI is sending people TO your
 * UTM-instrumented pages.
 *
 * Pure — no I/O, no LLM. Operates on `_summary.json::results[].canonicalCitations`.
 */

const UTM_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];

/**
 * Extract UTM parameters from a single URL. Returns null if URL is malformed
 * OR has no UTM params at all.
 */
export function extractUtmParams(url) {
  if (!url || typeof url !== 'string') return null;
  let parsed;
  try { parsed = new URL(url); }
  catch { return null; }

  const out = {};
  let any = false;
  for (const key of UTM_PARAMS) {
    const v = parsed.searchParams.get(key);
    if (v) { out[key] = v; any = true; }
  }
  if (!any) return null;
  return {
    url,
    host: parsed.hostname.replace(/^www\./, ''),
    path: parsed.pathname,
    ...out,
  };
}

/**
 * Aggregate UTM citations across results. Filters to citations on the user's
 * own domain (everything else is irrelevant to attribution) and groups by
 * (utm_source, utm_medium, utm_campaign).
 *
 * Returns:
 *   {
 *     totalUtmCitations,                          // count of own-domain UTM cells
 *     bySource:    [{ source, count }],
 *     byCampaign:  [{ campaign, count }],
 *     byEngine:    [{ provider, count, campaigns: [...] }],
 *     samples:     [{ provider, query, source, medium, campaign, url }]
 *   }
 */
export function aggregateUtmCitations(results, domain) {
  const dom = (domain || '').toLowerCase();
  const samples = [];
  const sourceCounts = new Map();
  const campaignCounts = new Map();
  const byEngine = new Map();
  let total = 0;

  for (const r of (results || [])) {
    const citations = r.canonicalCitations || [];
    for (const url of citations) {
      const utm = extractUtmParams(url);
      if (!utm) continue;
      // Only count own-domain — UTMs on third-party URLs are not the user's
      if (dom && !utm.host.includes(dom) && !dom.includes(utm.host)) continue;
      total++;

      const src = utm.utm_source || '(none)';
      const camp = utm.utm_campaign || '(none)';
      sourceCounts.set(src, (sourceCounts.get(src) || 0) + 1);
      campaignCounts.set(camp, (campaignCounts.get(camp) || 0) + 1);

      if (!byEngine.has(r.provider)) {
        byEngine.set(r.provider, { provider: r.provider, count: 0, campaigns: new Set() });
      }
      const eng = byEngine.get(r.provider);
      eng.count++;
      eng.campaigns.add(camp);

      if (samples.length < 8) {
        samples.push({
          provider: r.provider,
          query: r.query,
          source: utm.utm_source || '',
          medium: utm.utm_medium || '',
          campaign: utm.utm_campaign || '',
          url: utm.url,
        });
      }
    }
  }

  return {
    totalUtmCitations: total,
    bySource: Array.from(sourceCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([source, count]) => ({ source, count })),
    byCampaign: Array.from(campaignCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([campaign, count]) => ({ campaign, count })),
    byEngine: Array.from(byEngine.values()).map(e => ({
      provider: e.provider,
      count: e.count,
      campaigns: Array.from(e.campaigns),
    })),
    samples,
  };
}
