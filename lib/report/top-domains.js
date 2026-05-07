/**
 * Domain-level share-of-voice aggregation.
 *
 * Groups all canonicalCitations URLs by hostname → table of domains with their
 * share of total citations. This is the OneGlanse-style "outreach map" — which
 * publishers actually drive AI visibility in your category.
 *
 * Pure function — same logic was duplicated in cmdRun and cmdRunManual before
 * v0.6.1 cleanup.
 */
export function computeTopDomains(results, limit = 10) {
  const hostMap = {};
  let totalCitations = 0;
  for (const r of results || []) {
    for (const url of (r.canonicalCitations || [])) {
      try {
        const host = new URL(url).hostname.replace(/^www\./, '');
        hostMap[host] = (hostMap[host] || 0) + 1;
        totalCitations++;
      } catch { /* malformed URL — skip */ }
    }
  }
  return Object.entries(hostMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([host, count]) => ({
      host,
      count,
      share: totalCitations > 0 ? count / totalCitations : 0,
    }));
}
