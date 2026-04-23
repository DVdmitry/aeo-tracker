export function detectMention(text, citations, brand, domain) {
  const lowerText = text.toLowerCase();
  const lowerBrand = brand.toLowerCase();
  const lowerDomain = domain.toLowerCase();

  const inText = lowerText.includes(lowerBrand) || lowerText.includes(lowerDomain);
  const inCitations = citations.some(
    url => url.toLowerCase().includes(lowerDomain) || url.toLowerCase().includes(lowerBrand)
  );

  if (inText) return 'yes';
  if (inCitations) return 'src';
  return 'no';
}

export function findPosition(text, brand, domain) {
  const lower = text.toLowerCase();
  const terms = [brand.toLowerCase(), domain.toLowerCase()];
  let earliest = Infinity;
  for (const term of terms) {
    const idx = lower.indexOf(term);
    if (idx >= 0 && idx < earliest) earliest = idx;
  }
  if (earliest === Infinity) return null;
  const before = text.slice(0, earliest);
  const numberedItems = before.match(/^\d+[\.\)]/gm);
  return numberedItems ? numberedItems.length + 1 : 1;
}

export function extractUrls(text) {
  if (!text) return [];
  const regex = /https?:\/\/[^\s<>()"'\[\]{}|\\^`]+/g;
  const matches = text.match(regex) || [];
  // Strip trailing punctuation that commonly follows URLs in prose
  const cleaned = matches.map(u => u.replace(/[.,;:!?)\]]+$/, ''));
  return [...new Set(cleaned)];
}

// Competitor extraction moved to lib/report/extract-competitors-llm.js — two-model
// LLM cross-check replaces the regex + filter-dictionary approach. See that module
// for rationale. This file keeps only the brand-mention, citation-URL, and
// position-in-ranked-list helpers.
