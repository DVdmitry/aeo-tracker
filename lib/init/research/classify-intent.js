/**
 * Phase 3 part 1 — language-aware intent classification.
 *
 * Classifies a query string into one of: commercial, informational, vertical,
 * problem, comparison, or null (unclassified).
 *
 * Primary source of intent is the brainstorm LLM's own tagging — this function
 * is a VERIFIER that either confirms or reclassifies based on linguistic
 * patterns. For unsupported languages, returns null so the caller falls back
 * to the LLM's original tag.
 */

const INTENT_PATTERNS = {
  en: {
    comparison:    /\b(vs|versus|alternative to|compared to|better than|cheaper than|instead of)\b/i,
    problem:       /\b(how to fix|solve|stop|avoid|replace|get rid of|troubleshoot)\b/i,
    commercial:    /\b(best|top|leading|most popular|review|compare|pricing|buy|purchase|choose)\b/i,
    informational: /\b(how to|how do|what is|what are|guide to|tutorial|introduction to|explained|learn)\b/i,
    vertical:      /\bfor\s+(saas|enterprise|startups?|agencies|small businesses|b2b|b2c|healthcare|fintech|ecommerce|education|hospitality|legal|manufacturing|marketers?|developers?|founders?)\b/i,
  },
  pl: {
    comparison:    /\b(vs\.?|kontra|porównanie|lepsze niż|zamiast|alternatywa dla)\b/i,
    problem:       /\b(jak rozwiązać|jak naprawić|jak uniknąć|jak zastąpić|problem z)\b/i,
    commercial:    /\b(najlepsze|najlepszy|top|ranking|polecane|cena|ceny|kup|wybierz)\b/i,
    informational: /\b(jak\s|co to jest|czym jest|poradnik|przewodnik|wprowadzenie do|instrukcja)\b/i,
    vertical:      /\b(dla\s+(saas|firm|startupów|agencji|małych firm|b2b|healthcare|fintech|ecommerce|edukacji))\b/i,
  },
  de: {
    comparison:    /\b(vs\.?|versus|vergleich|besser als|alternative zu|statt)\b/i,
    problem:       /\b(wie löst man|wie behebt|probleme mit|fehler beheben|ersetzen)\b/i,
    commercial:    /\b(beste|bester|top|empfehlenswert|preis|preise|kaufen|auswählen)\b/i,
    informational: /\b(wie\s|was ist|was sind|anleitung|einführung in|tutorial)\b/i,
    vertical:      /\b(für\s+(saas|unternehmen|startups?|agenturen|kleine unternehmen|b2b|healthcare|fintech))\b/i,
  },
};

// Language-priority order for tie-breaking — comparison before problem before commercial etc.
// Ensures "alternative to X for startups" classifies as comparison (most specific) not vertical.
const PRIORITY_ORDER = ['comparison', 'problem', 'commercial', 'informational', 'vertical'];

/**
 * Classify a query into an intent bucket.
 *
 * @param {string} text
 * @param {string} [lang='en']  ISO 639-1 code; unsupported languages return null
 * @returns {string|null}       one of the intent bucket names, or null
 */
export function classifyIntent(text, lang = 'en') {
  if (!text || typeof text !== 'string') return null;
  const patterns = INTENT_PATTERNS[lang];
  if (!patterns) return null; // caller falls back to LLM's brainstorm tag

  for (const intent of PRIORITY_ORDER) {
    const re = patterns[intent];
    if (re && re.test(text)) return intent;
  }
  return null;
}

/**
 * Annotate a candidate with both its brainstorm-assigned intent and our
 * classifier's verdict. When they disagree, prefer the classifier for supported
 * languages, keep the brainstorm tag otherwise.
 */
export function reconcileIntent(cand, lang = 'en') {
  const classified = classifyIntent(cand.text, lang);
  const brainstormIntent = cand.intent;
  const supportedLang = INTENT_PATTERNS[lang] !== undefined;

  if (!supportedLang) {
    return { ...cand, intentFinal: brainstormIntent, intentAgreement: 'lang-unsupported' };
  }
  if (classified === brainstormIntent) {
    return { ...cand, intentFinal: classified, intentAgreement: 'match' };
  }
  if (classified === null) {
    return { ...cand, intentFinal: brainstormIntent, intentAgreement: 'classifier-unsure' };
  }
  return { ...cand, intentFinal: classified, intentAgreement: 'reclassified', intentOriginal: brainstormIntent };
}

export { INTENT_PATTERNS };
