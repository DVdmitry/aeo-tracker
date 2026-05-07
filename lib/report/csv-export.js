/**
 * Flat CSV/JSON exporter for `_summary.json` results.
 *
 * Use cases:
 *   - Looker Studio / Google Sheets / Tableau ingestion (Peec.ai parity)
 *   - Long-term archival in a flat file format
 *   - Diffing two runs in `git diff` without JSON pretty-print noise
 *
 * Output schema (one row per result cell):
 *   date, brand, domain, query, queryText, provider, model, mention,
 *   position, citationCount, region, tag, sentiment, sentimentConfidence,
 *   topCompetitor, competitorCount, citationDomain
 *
 * RFC 4180 quoting — fields with commas, quotes, or newlines get wrapped in
 * double quotes; embedded quotes are doubled.
 */

const COLUMNS = [
  'date', 'brand', 'domain',
  'query', 'queryText', 'provider', 'model',
  'mention', 'position', 'citationCount',
  'region', 'tag',
  'sentiment', 'sentimentConfidence',
  'topCompetitor', 'competitorCount',
  'topCitationDomain',
];

function escapeCsvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Flatten a single _summary.json into rows. Pure — no I/O.
 */
export function flattenSummary(summary) {
  if (!summary || !Array.isArray(summary.results)) return [];
  const date = summary.date || '';
  const brand = summary.brand || '';
  const domain = summary.domain || '';

  return summary.results.map(r => {
    const competitors = [...(r.competitors || []), ...(r.competitorsUnverified || [])];
    let topCitationDomain = '';
    for (const u of (r.canonicalCitations || [])) {
      try { topCitationDomain = new URL(u).hostname.replace(/^www\./, ''); break; }
      catch { /* skip */ }
    }
    return {
      date, brand, domain,
      query: r.query || '',
      queryText: r.queryText || '',
      provider: r.provider || '',
      model: r.model || '',
      mention: r.mention || '',
      position: r.position == null ? '' : r.position,
      citationCount: r.citationCount == null ? 0 : r.citationCount,
      region: r.region || '',
      tag: r.tag || '',
      sentiment: r.sentiment?.label || '',
      sentimentConfidence: r.sentiment?.confidence || '',
      topCompetitor: competitors[0] || '',
      competitorCount: competitors.length,
      topCitationDomain,
    };
  });
}

/**
 * Render an array of {key: value} rows to a CSV string with header row.
 */
export function rowsToCsv(rows, columns = COLUMNS) {
  const header = columns.join(',');
  const body = rows.map(row => columns.map(col => escapeCsvCell(row[col])).join(',')).join('\n');
  return body ? `${header}\n${body}\n` : `${header}\n`;
}

/**
 * Convenience — multi-snapshot export. Concatenates flattened rows from each
 * snapshot in chronological order. Useful for trend analysis in BI tools.
 */
export function snapshotsToCsv(snapshots) {
  const all = [];
  for (const s of (snapshots || [])) {
    all.push(...flattenSummary(s));
  }
  return rowsToCsv(all);
}

export function snapshotsToJson(snapshots) {
  const all = [];
  for (const s of (snapshots || [])) {
    all.push(...flattenSummary(s));
  }
  return JSON.stringify(all, null, 2);
}
