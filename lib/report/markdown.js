import {
  sectionHeader,
  sectionHero,
  sectionBaseline,
  sectionExecutiveSummary,
  sectionKeyMetrics,
  sectionEngineRadar,
  sectionMatrix,
  sectionEngineActions,
  sectionVerbatimQuotes,
  sectionDiff,
  sectionTrend,
  sectionCompetitors,
  sectionCompetitorIntelligence,
  sectionCanonicalSources,
  sectionDisambiguationWarning,
  sectionNextSteps,
  sectionFooter,
} from './sections.js';

/**
 * Compose the full report markdown from ordered snapshots and raw responses.
 *
 * snapshots[last].citationClassification (if present) is used by
 * sectionDisambiguationWarning — set by cmdReport after classifyCitations().
 *
 * @param {Object[]} snapshots   array of _summary.json objects, chronological
 * @param {Object} rawResponses  map { "<query>|<provider>": "full response text" }
 * @returns {string} markdown document
 */
export function renderMarkdown(snapshots, rawResponses = {}) {
  const sections = [
    sectionHeader(snapshots),
    sectionHero(snapshots),                   // P1 — traffic light + big number
    sectionBaseline(snapshots),               // P10 — "is 0% bad?" context
    sectionNextSteps(snapshots),              // P6 — actions checklist (top for scanners)
    sectionExecutiveSummary(snapshots),       // plain-English
    sectionKeyMetrics(snapshots),             // score cards (HTML)
    sectionEngineRadar(snapshots),            // P2 — radar chart
    sectionMatrix(snapshots),                 // P7 — heatmap with icon legend
    sectionEngineActions(snapshots),          // per-engine action cards (HTML)
    sectionVerbatimQuotes(snapshots, rawResponses),
    sectionDisambiguationWarning(snapshots),
    sectionDiff(snapshots),
    sectionTrend(snapshots),                  // P8 — sparklines / first-run placeholder
    sectionCompetitors(snapshots),            // P3 — barchart with YOU row accent
    sectionCompetitorIntelligence(snapshots), // gap table: who wins your missing queries
    sectionCanonicalSources(snapshots),       // P5 — where to get mentioned
    sectionFooter(snapshots),
  ];
  return sections.filter(s => s && s.trim()).join('\n');
}

/**
 * Extract plain text from a saved raw API response based on provider shape.
 * Used by the report command when loading historical raw JSON files.
 */
export function parseRawResponse(provider, raw) {
  if (!raw) return '';
  if (provider === 'openai' || provider === 'perplexity') {
    return raw.choices?.[0]?.message?.content || '';
  }
  if (provider === 'gemini') {
    return (raw.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('\n');
  }
  if (provider === 'anthropic') {
    return (raw.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
  }
  return '';
}
