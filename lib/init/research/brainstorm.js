/**
 * Phase 2 of the v0.5 keyword research pipeline — brainstorm.
 *
 * Generates ~20 candidate queries across 4 intent buckets using a single LLM call.
 * Informational bucket removed — "what is X" queries have no buying intent and add noise.
 * Pain-framed "problem" bucket replaces it and generates higher-value candidates.
 *
 * Hard requirements enforced in the prompt:
 *   - Guard 1: ALWAYS expand industry acronyms at generation time.
 *             Do not inherit abbreviation from CATEGORY_DESCRIPTION.
 *   - Guard 2: "vertical" bucket must span ≥3 different industries.
 *   - Guard 3: comparison bucket must never compare AI engine channels.
 *   - Unbranded: never include brand name or domain core.
 *   - Language: match the site's detected language.
 */

const INTENT_BUCKETS = ['commercial', 'problem', 'vertical', 'comparison'];
const TARGET_PER_BUCKET = 5;

/**
 * Build the brainstorm prompt.
 */
export function buildBrainstormPrompt({ brand, domain, site, categoryDescription, audienceTags = [], geoTags = [] }) {
  const audienceLine = audienceTags.length > 0
    ? `Audience markers detected on the site: ${audienceTags.join(', ')}.`
    : '';
  const geoLine = geoTags.length > 0
    ? `Geographic signals: ${geoTags.join(', ')}. Consider region-specific terminology where relevant.`
    : '';

  return `You are a keyword research specialist configuring an AEO (Answer Engine Optimization) visibility tracker.

BRAND: ${brand}
DOMAIN: ${domain}
LANGUAGE: ${site.lang || 'en'}
CATEGORY_DESCRIPTION (user-provided, authoritative): "${categoryDescription}"
${audienceLine}
${geoLine}

SITE CONTEXT:
  Title: ${site.title || '(none)'}
  Meta: ${site.metaDesc || '(none)'}
  H1: ${(site.h1 || []).join(' | ') || '(none)'}
  H2: ${(site.h2 || []).join(' | ') || '(none)'}
  Body excerpt: ${String(site.text || '').slice(0, 1200)}

TASK — generate UNBRANDED search queries, exactly ${TARGET_PER_BUCKET} per intent bucket:

  1. commercial — buying intent: "best X 2026", "top Y agencies", "Y service for <segment>"
     Buyer is ready to evaluate and shortlist vendors.

  2. problem    — pain-first: buyer describes a symptom or failure they want to fix.
     Pattern: "why isn't my [entity] showing up in AI results", "how to make AI recommend my brand",
     "brand not appearing in [AI engine] answers", "how to fix AI search visibility for [segment]".
     ✗ WRONG: "what is [category]" — definitional, zero buying intent. Skip it entirely.

  3. vertical   — industry or audience specific: "Y for <industry>", "Y for <audience type>"
     Must span ≥3 different industries (Guard 2).

  4. comparison — buyer is comparing VENDORS OR STRATEGIES in this category.
     ✓ "[vendor A] vs [vendor B]", "alternatives to [named competitor]", "[strategy A] vs [strategy B] for [segment]"
     ✗ NEVER compare AI engine channels (ChatGPT vs Gemini, Perplexity vs Google, etc.) — those are
       distribution channels, not the product being tracked. Any query where both subjects are AI engines
       is a research query, not a buying query.

NON-NEGOTIABLE RULES (violations are rejected):

  A. **Acronym expansion (Guard 1).** EVERY query must spell out industry acronyms in full.
     Never output "AEO" alone — write "Answer Engine Optimization".
     Never output "CRM" alone — write "Customer Relationship Management".
     Never "ERP", "SEO-as-AEO", "GEO", "CRO", "CDP", "ROI", "KPI", "ML" without expansion.
     This applies EVEN IF the CATEGORY_DESCRIPTION above uses the abbreviation.
     The abbreviated form is almost always ambiguous across geographies and industries.

  B. **Vertical diversity (Guard 2).** The 5 "vertical" candidates MUST span at least
     3 different industries (e.g., healthcare, finance, e-commerce, SaaS, education,
     hospitality, legal, manufacturing). Do NOT concentrate all 5 on a single industry
     even if one is prominent in the site content — the goal is tracking across the
     brand's possible markets, not confirming the most visible one.

  C. **Unbranded.** Never include "${brand}" or the core of "${domain}".

  D. **Language.** Write in ${site.lang || 'en'}. If the site hints at a specific
     region, adapt to regional terminology (e.g., Polish users might search
     "Answer Engine Optimization usługi" not "AEO services").

  E. **Length.** 3–10 words per query.

Return STRICT JSON. No markdown fences. No prose. Format:
{
  "commercial":    ["...", "...", "...", "...", "..."],
  "informational": ["...", "...", "...", "...", "..."],
  "vertical":      ["...", "...", "...", "...", "..."],
  "problem":       ["...", "...", "...", "...", "..."],
  "comparison":    ["...", "...", "...", "...", "..."]
}`;
}

/**
 * Tolerant JSON parser — strips code fences, extracts first {...}, retries.
 */
export function parseBrainstormResponse(text) {
  if (!text || typeof text !== 'string') throw new Error('Empty brainstorm response');
  let cleaned = text.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '');
  try {
    return JSON.parse(cleaned);
  } catch {}
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) {
    try { return JSON.parse(m[0]); } catch {}
  }
  throw new Error('Could not parse JSON from brainstorm response');
}

/**
 * Validate the shape of a parsed brainstorm output.
 * Returns { buckets: { commercial: [...], ... }, flat: [{ text, intent }, ...] }
 * Throws if critical structure missing.
 */
export function validateBrainstormShape(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Brainstorm output is not a JSON object');
  }

  const buckets = {};
  const flat = [];
  let totalAcross = 0;

  for (const intent of INTENT_BUCKETS) {
    const arr = Array.isArray(parsed[intent]) ? parsed[intent] : [];
    const cleaned = arr
      .filter(q => typeof q === 'string' && q.trim().length >= 3)
      .map(q => q.trim());
    buckets[intent] = cleaned;
    totalAcross += cleaned.length;
    for (const text of cleaned) flat.push({ text, intent });
  }

  if (totalAcross < 10) {
    throw new Error(`Brainstorm produced only ${totalAcross} queries across ${INTENT_BUCKETS.length} buckets — too few to filter/rank`);
  }

  return { buckets, flat, totalAcross };
}

/**
 * Run the brainstorm phase end-to-end with one retry on bad output.
 *
 * @param {Object} opts
 * @param {Function} opts.providerCall  LLM caller (prompt, apiKey, model, options) => { text, ... }
 * @param {string} opts.apiKey
 * @param {string} opts.model
 * @param {Function} [opts.onAttempt]   reporter: ({ attempt, total, estimate }) => void
 */
export async function runBrainstorm({
  brand, domain, site, categoryDescription, audienceTags, geoTags,
  providerCall, apiKey, model, onAttempt = null,
}) {
  const prompt = buildBrainstormPrompt({ brand, domain, site, categoryDescription, audienceTags, geoTags });
  const estimate = {
    tokens: Math.ceil(prompt.length / 4),
    // Rough cost — will be refined per-model downstream; this is the prompt cost only.
    usd: (Math.ceil(prompt.length / 4) / 1_000_000) * 3,
  };

  const MAX_ATTEMPTS = 2;
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (onAttempt) onAttempt({ attempt, total: MAX_ATTEMPTS, estimate });
    try {
      const { text } = await providerCall(prompt, apiKey, model, { webSearch: false });
      const parsed = parseBrainstormResponse(text);
      return validateBrainstormShape(parsed);
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_ATTEMPTS) {
        await new Promise(r => setTimeout(r, 1200));
      }
    }
  }
  throw lastErr;
}

export { INTENT_BUCKETS, TARGET_PER_BUCKET };
