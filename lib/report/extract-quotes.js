const CONTEXT_CHARS = 200;
const MAX_SNIPPETS_PER_CHECK = 2;

/**
 * Pull verbatim mentions of `brand` or `domain` out of an AI response.
 *
 * Returns:
 * - `snippets`: array of strings, each ~one sentence around a brand mention,
 *   cleaned of markdown noise, broken on sentence boundaries.
 * - `citationOnly`: the first URL that references the brand when the brand
 *   does not appear in the response text itself (weaker signal, rendered
 *   separately per resolved decision D5).
 */
export function extractQuotes(rawText, brand, domain, citations = []) {
  if (!rawText) return { snippets: [], citationOnly: null };

  const snippets = [];
  const lowerText = rawText.toLowerCase();
  const lowerBrand = (brand || '').toLowerCase();
  const lowerDomain = (domain || '').toLowerCase();
  const terms = [lowerBrand, lowerDomain].filter(Boolean);
  if (terms.length === 0) return { snippets: [], citationOnly: null };

  const seenSnippets = new Set();
  for (const term of terms) {
    let idx = 0;
    while ((idx = lowerText.indexOf(term, idx)) !== -1) {
      const start = Math.max(0, idx - CONTEXT_CHARS);
      const end = Math.min(rawText.length, idx + term.length + CONTEXT_CHARS);
      const raw = rawText.slice(start, end);
      const snippet = stripMarkdownNoise(breakOnSentence(raw));
      if (snippet.length > 20 && !seenSnippets.has(snippet)) {
        seenSnippets.add(snippet);
        snippets.push(snippet);
        if (snippets.length >= MAX_SNIPPETS_PER_CHECK) {
          return { snippets, citationOnly: null };
        }
      }
      idx += term.length;
    }
  }

  let citationOnly = null;
  if (snippets.length === 0 && citations.length > 0) {
    const match = citations.find(u => {
      const lu = u.toLowerCase();
      return lu.includes(lowerDomain) || (lowerBrand && lu.includes(lowerBrand));
    });
    if (match) citationOnly = match;
  }

  return { snippets, citationOnly };
}

function breakOnSentence(text) {
  // Start: skip the partial sentence at the beginning if a break appears in the first 80 chars
  const head = text.slice(0, 80);
  const startMatch = head.match(/[.!?]\s+/);
  const begin = startMatch ? startMatch.index + startMatch[0].length : 0;

  // End: cut at the last sentence break so we don't end mid-sentence
  const tail = text.slice(begin);
  const endMatches = [...tail.matchAll(/[.!?](?=\s|$)/g)];
  if (endMatches.length > 0) {
    const last = endMatches[endMatches.length - 1];
    return tail.slice(0, last.index + 1).trim();
  }
  return tail.trim();
}

function stripMarkdownNoise(text) {
  return text
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
