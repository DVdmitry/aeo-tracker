/**
 * Geographic / regional query localisation.
 *
 * Sets aeo-tracker apart from Wellows / OneGlanse / AthenaHQ — none of them
 * support multi-region runs. Implementation is a "soft" geo: we wrap each
 * query with a region-context preamble. We do not fake browser headers or
 * IP-spoof — the LLM sees the explicit region instruction and tailors its
 * answer to that market.
 *
 * Supports the 8 markets where AI-search adoption is meaningful in 2026.
 * Adding a region = one entry in REGIONS map.
 */

export const REGIONS = {
  us: { code: 'us', label: 'United States',   instruction: 'the United States market' },
  uk: { code: 'uk', label: 'United Kingdom',  instruction: 'the United Kingdom market' },
  de: { code: 'de', label: 'Germany',         instruction: 'the German market' },
  fr: { code: 'fr', label: 'France',          instruction: 'the French market' },
  es: { code: 'es', label: 'Spain',           instruction: 'the Spanish market' },
  it: { code: 'it', label: 'Italy',           instruction: 'the Italian market' },
  ca: { code: 'ca', label: 'Canada',          instruction: 'the Canadian market' },
  au: { code: 'au', label: 'Australia',       instruction: 'the Australian market' },
  in: { code: 'in', label: 'India',           instruction: 'the Indian market' },
  br: { code: 'br', label: 'Brazil',          instruction: 'the Brazilian market' },
  jp: { code: 'jp', label: 'Japan',           instruction: 'the Japanese market' },
  nl: { code: 'nl', label: 'Netherlands',     instruction: 'the Dutch market' },
};

/**
 * Parse a comma-separated `--geo` flag into a list of {code, label, instruction}.
 * Unknown codes are ignored with a console warning. Empty / unset → returns
 * `{ regions: [], invalid: [] }` (consistent shape for callers).
 */
export function parseGeoFlag(value) {
  if (!value || typeof value !== 'string') return { regions: [], invalid: [] };
  const codes = value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const valid = [];
  const invalid = [];
  for (const code of codes) {
    if (REGIONS[code]) valid.push(REGIONS[code]);
    else invalid.push(code);
  }
  return { regions: valid, invalid };
}

/**
 * Wrap a query with a region preamble. The preamble is short and unambiguous so
 * the LLM understands "answer for this market" without contaminating the
 * actual question.
 */
export function wrapQueryForRegion(query, region) {
  if (!region) return query;
  return `(Answer in the context of ${region.instruction}.) ${query}`;
}

/**
 * Available region codes for help text and validation.
 */
export function listRegionCodes() {
  return Object.keys(REGIONS).join(', ');
}
