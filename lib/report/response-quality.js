/**
 * Response-quality classifier.
 *
 * Distinguishes three states that otherwise all render as "not listed":
 *   - empty:     engine refused, errored, or returned a stub — <200 chars AND 0 citations
 *   - narrative: engine wrote prose but produced no extractable vendor list — no competitors AND <3 citations
 *   - rich:     normal structured response with competitors and/or citations
 *
 * Moved out of bin/aeo-tracker.js (inline at cmdRun + cmdPaste) so thresholds live
 * in named constants with documented rationale, and boundaries are covered by tests.
 */

/**
 * Minimum characters a "real" engine response should have.
 * Responses below this length, combined with zero citations, are almost always
 * refusals ("I can't help with that", short error stubs, content-policy triggers)
 * rather than honest "nothing matched" answers.
 *
 * Picked at 200 because the shortest observed legitimate response in prod
 * (Gemini on a narrow AEO query) was ~350 chars. Leaves a margin for edge cases.
 */
export const EMPTY_TEXT_MAX = 200;

/**
 * Maximum citation count for "narrative" classification.
 * If the response has 3+ citations it's clearly doing structured retrieval, so
 * the lack of competitors is a real signal ("brand not cited by AI") rather than
 * "engine answered from parametric memory with no vendor list".
 *
 * Picked at 3 because ranked lists typically produce 3+ citations, while
 * parametric-only prose produces 0–2 (often a single reference link or none).
 */
export const NARRATIVE_CITATION_MAX = 3;

/**
 * @param {Object} opts
 * @param {string} opts.text                 raw text from the engine
 * @param {string[]} [opts.citations=[]]     extracted citation URLs
 * @param {string[]} [opts.competitors=[]]   extracted competitor names (post-filter)
 * @returns {'empty'|'narrative'|'rich'}
 */
export function classifyResponseQuality({ text, citations = [], competitors = [] }) {
  const len = typeof text === 'string' ? text.length : 0;
  const citationCount = Array.isArray(citations) ? citations.length : 0;
  const competitorCount = Array.isArray(competitors) ? competitors.length : 0;

  if (len < EMPTY_TEXT_MAX && citationCount === 0) return 'empty';
  if (competitorCount === 0 && citationCount < NARRATIVE_CITATION_MAX) return 'narrative';
  return 'rich';
}
