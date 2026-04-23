/**
 * Phase 4 — cross-model category validation.
 *
 * Takes candidates that survived filter+score, sends them to a DIFFERENT
 * provider than the one that brainstormed them, and asks whether each query
 * would primarily return results from the user's category or a different
 * industry that shares terminology.
 *
 * Per D1 + P3: cross-model is mandatory when more than one provider is
 * available. Single-model validation has consistency bias (the model that
 * brainstormed wrong queries will also validate them as correct).
 */

/**
 * Build a validation prompt for a batch of candidates.
 *
 * @param {Object} opts
 * @param {string} opts.brand
 * @param {string} opts.category  user-provided or auto-inferred CATEGORY_DESCRIPTION
 * @param {Array<{ text: string, intent: string }>} opts.candidates
 */
/**
 * Guard 5 — strip audience qualifier from CATEGORY before passing to validator.
 * "Answer Engine Optimization services for SaaS — NOT customs" → "Answer Engine Optimization services — NOT customs"
 * Reason: vertical-bucket candidates legitimately expand audience ("for healthcare", "for fintech"),
 * and we don't want the validator to reject them just because category narrowed to one audience.
 */
export function stripAudienceQualifier(category) {
  if (!category) return category;
  // Remove ONLY the "for <audience>" phrase (plus optional modifier noun like "companies"),
  // keeping any subsequent disambiguating hints like "— NOT customs" intact.
  return category
    .replace(/\s+for\s+(saas|enterprise|startups?|agencies|small businesses|b2b|b2c|healthcare|fintech|ecommerce|e-commerce|education|hospitality|legal|manufacturing|marketers?|developers?|founders?|teams?|companies)(?:\s+(companies|firms|businesses|teams|brands))?\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildValidationPrompt({ brand, category, candidates }) {
  const numbered = candidates.map((c, i) => `  ${i}. ${c.text}`).join('\n');
  const broadenedCategory = stripAudienceQualifier(category);

  return `You are validating search-query relevance for an AEO visibility tracker.

The brand being tracked:
  BRAND: ${brand}
  CATEGORY: ${broadenedCategory}

CRITICAL — Geographic + acronym collision check:
  If a query contains an ABBREVIATION (e.g. "AEO", "CRM", "ERP") combined with a COUNTRY
  or REGION (e.g. "Poland", "Germany", "EU", "UK"), evaluate whether AI engines in that
  geography would interpret the abbreviation as the brand's category OR as something else
  entirely. Example: "AEO consultants Poland" → in Polish context "AEO" almost certainly
  means EU Authorized Economic Operator (customs certification), NOT Answer Engine
  Optimization. Such queries are OFF-CATEGORY even if the abbreviation can theoretically
  match the brand's category.

  Rule: if the DOMINANT real-world meaning of an abbreviation in the specified geography
  differs from the brand's category, mark onCategory: false.

For each candidate query below, answer TWO questions:

  1. onCategory: Would a typical user typing this query into ChatGPT / Gemini /
     Claude / Perplexity most likely receive results ABOUT the brand's category above,
     or results from a DIFFERENT industry? Apply the geographic+acronym rule above.

  2. confidence: "high" if unambiguous. "low" if genuinely could go either way.

Examples of off-category:
  - Acronym collision: "AEO agency Poland" → customs compliance, not Answer Engine Optimization
  - Industry overlap: "pipeline management" → could be oil & gas or sales CRM
  - Wrong vertical: "AEO certification EU" → regulatory compliance, not marketing

Candidates to validate:

${numbered}

Return STRICT JSON. For each candidate by index:

{
  "results": [
    { "index": 0, "onCategory": true,  "confidence": "high", "note": "" },
    { "index": 1, "onCategory": false, "confidence": "high", "note": "short reason" },
    ...
  ]
}

Every candidate must have exactly one result entry. Never skip an index.`;
}

/**
 * Tolerant parser for validation JSON.
 */
export function parseValidationResponse(text) {
  if (!text || typeof text !== 'string') throw new Error('Empty validation response');
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
  throw new Error('Could not parse JSON from validation response');
}

/**
 * Merge validation verdicts into candidates. Returns { validated, rejected }.
 * `validated` = candidates marked onCategory=true. `rejected` = onCategory=false
 * with the LLM's note preserved for the user-facing rejection log.
 */
export function applyValidation(candidates, parsed) {
  if (!parsed || !Array.isArray(parsed.results)) {
    throw new Error('Validation response missing .results array');
  }
  const byIndex = new Map(parsed.results.map(r => [r.index, r]));

  const validated = [];
  const rejected = [];

  candidates.forEach((cand, idx) => {
    const verdict = byIndex.get(idx);
    if (!verdict) {
      // Missing verdict — conservative: keep but mark low-confidence
      validated.push({ ...cand, validation: 'missing-verdict' });
      return;
    }
    if (verdict.onCategory === false) {
      rejected.push({ ...cand, reason: verdict.note || 'off-category', confidence: verdict.confidence || 'unknown' });
    } else {
      validated.push({
        ...cand,
        validation: 'ok',
        confidence: verdict.confidence || 'unknown',
        validationNote: verdict.note || '',
      });
    }
  });

  return { validated, rejected };
}

/**
 * Run the validation phase end-to-end.
 *
 * @param {Object} opts
 * @param {Array} opts.candidates       filtered+scored candidate pool
 * @param {string} opts.brand
 * @param {string} opts.category
 * @param {Function} opts.providerCall  LLM caller from a DIFFERENT provider than brainstorm
 * @param {string} opts.apiKey
 * @param {string} opts.model
 * @param {Function} [opts.onAttempt]
 */
export async function runValidation({
  candidates, brand, category,
  providerCall, apiKey, model,
  onAttempt = null,
}) {
  // Cap at 15 to control cost — top-scored first
  const batch = candidates.slice(0, 15);
  const prompt = buildValidationPrompt({ brand, category, candidates: batch });
  const estimate = {
    tokens: Math.ceil(prompt.length / 4),
    usd: (Math.ceil(prompt.length / 4) / 1_000_000) * 3,
  };

  const MAX_ATTEMPTS = 2;
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (onAttempt) onAttempt({ attempt, total: MAX_ATTEMPTS, estimate });
    try {
      const { text } = await providerCall(prompt, apiKey, model, { webSearch: false });
      const parsed = parseValidationResponse(text);
      const { validated, rejected } = applyValidation(batch, parsed);
      // Append any candidates outside the top-15 back unvalidated (tagged)
      const untested = candidates.slice(15).map(c => ({ ...c, validation: 'untested-below-top15' }));
      return { validated: [...validated, ...untested], rejected };
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_ATTEMPTS) {
        await new Promise(r => setTimeout(r, 1200));
      }
    }
  }
  throw lastErr;
}
