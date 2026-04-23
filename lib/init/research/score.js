/**
 * Phase 3 part 2 — candidate scoring.
 *
 * Produces a 0–100 score for each candidate based on linguistic features.
 * Used by selection (C7) to pick top candidate per intent bucket.
 *
 * Philosophy: we can't measure "AI visibility volume" so we score on
 * proxies for query quality that SEO professionals would use.
 */

import { AMBIGUOUS_ACRONYMS } from './filter.js';

const SPECIFICITY_RE = /\b(saas|enterprise|startups?|agencies|healthcare|fintech|ecommerce|e-commerce|b2b|b2c|founders?|teams?|companies|firms?|consultancies|marketers?|developers?)\b/i;

/**
 * Score one candidate. Non-destructive — returns a new object with score + reasons.
 *
 * @param {{ text: string, intent: string }} cand
 * @param {Object} opts
 * @param {string} opts.lang         site language (for language-match bonus)
 * @param {Array}  [opts.ambiguous]  override AMBIGUOUS_ACRONYMS list
 * @returns {{ text, intent, score, scoreReasons: string[] }}
 */
export function scoreCandidate(cand, { lang = 'en', ambiguous = AMBIGUOUS_ACRONYMS } = {}) {
  const text = cand.text;
  const lower = text.toLowerCase();
  const words = text.split(/\s+/).filter(Boolean);
  const wc = words.length;

  let score = 50;
  const reasons = [];

  // Word count sweet spot: 3–7 words
  if (wc >= 3 && wc <= 7) {
    score += 20;
    reasons.push(`+20 word-count sweet-spot (${wc})`);
  } else if (wc < 3) {
    score -= 10;
    reasons.push(`-10 too short (${wc} words)`);
  } else if (wc > 10) {
    score -= 15;
    reasons.push(`-15 too long (${wc} words)`);
  }

  // Safety-net check: bare ambiguous acronym (filter.js should have caught it)
  for (const { abbr, expansion } of ambiguous) {
    const abbrRegex = new RegExp(`\\b${abbr}\\b`, 'i');
    if (abbrRegex.test(text) && !lower.includes(expansion.toLowerCase())) {
      score -= 30;
      reasons.push(`-30 bare "${abbr}" without expansion (should have been filtered)`);
      break;
    }
  }

  // Recency marker
  if (/\b(2026|2027|latest|newest|current|recent|this year)\b/i.test(text)) {
    score += 5;
    reasons.push('+5 recency marker');
  }

  // Specificity (industry/audience/segment)
  const hasSpec = SPECIFICITY_RE.test(text);
  if (hasSpec) {
    score += 10;
    reasons.push('+10 specificity marker');
  }

  // Long-tail bonus: ≥5 words AND specificity
  if (wc >= 5 && hasSpec) {
    score += 10;
    reasons.push('+10 long-tail structure');
  }

  // Comparison structure (explicit "X vs Y" or "alternative to" patterns)
  if (/\b(vs|versus|alternative to|compared to|better than|cheaper than)\b/i.test(text)) {
    score += 8;
    reasons.push('+8 comparison structure');
  }

  // Language match heuristic (cheap: ASCII heavy on English sites is fine;
  // Cyrillic/CJK on en-site is a strong mismatch signal)
  const nonAsciiRatio = ([...text].filter(ch => ch.charCodeAt(0) > 127).length / text.length);
  if (lang === 'en' && nonAsciiRatio > 0.15) {
    score -= 20;
    reasons.push('-20 non-ASCII on English site');
  }

  score = Math.max(0, Math.min(100, score));
  return { text, intent: cand.intent, score, scoreReasons: reasons };
}

/**
 * Score a batch of candidates, preserving order.
 */
export function scoreAll(candidates, opts) {
  return candidates.map(c => scoreCandidate(c, opts));
}
