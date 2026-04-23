/**
 * Design tokens for AEO Tracker reports (markdown + HTML).
 *
 * Palette: warm neutrals + amber accent, per-engine hues borrowed from the
 * webappski.com aesthetic (warm whites, no pure greys).
 *
 * Every colour here is HEX (for markdown-embedded SVG where CSS vars don't
 * apply). The HTML renderer exposes them as CSS custom properties too, so
 * we keep a single source of truth.
 */

export const TOKENS = {
  // Surfaces
  bg:          '#FBFAF7',   // page background (warm off-white)
  bgSubtle:    '#F4F2EC',   // card / zebra
  bgRaised:    '#FFFFFF',
  border:      '#E6E2D9',
  borderStrong:'#D9D3C5',

  // Ink
  ink:         '#1F1B14',
  ink2:        '#3F3A30',
  ink3:        '#78706A',
  ink4:        '#A8A097',

  // Accent — amber (used for SRC status, hero numbers, YOU highlights)
  accent:      '#C97B24',
  accentSoft:  '#F1DFC0',
  accentInk:   '#7A4A12',

  // Semantics
  pos:         '#4A7A3F',   // muted forest — replaces tailwind emerald
  posSoft:     '#DBE6CF',
  neg:         '#B0432A',   // burnt red — replaces tailwind red-500
  negSoft:     '#F3D7CC',
  warn:        '#B88019',
  warnSoft:    '#F0E0B8',

  // Per-engine (same chroma/lightness, vary hue — matches dashboard prototype)
  engChatgpt:    '#3E8E6E',  // oklch(0.62 0.14 155) ≈
  engClaude:     '#C47A3A',  // oklch(0.62 0.14 30)  ≈
  engGemini:     '#6B6AB3',  // oklch(0.62 0.14 260) ≈
  engPerplexity: '#3F8FA8',  // oklch(0.62 0.14 200) ≈

  engChatgptSoft:    '#D9ECE3',
  engClaudeSoft:     '#F1DECC',
  engGeminiSoft:     '#DEDDF0',
  engPerplexitySoft: '#D5E6EC',
};

export const ENGINES = {
  openai:     { label: 'ChatGPT',    code: 'GP', color: TOKENS.engChatgpt,    soft: TOKENS.engChatgptSoft    },
  anthropic:  { label: 'Claude',     code: 'CL', color: TOKENS.engClaude,     soft: TOKENS.engClaudeSoft     },
  gemini:     { label: 'Gemini',     code: 'GE', color: TOKENS.engGemini,     soft: TOKENS.engGeminiSoft     },
  perplexity: { label: 'Perplexity', code: 'PX', color: TOKENS.engPerplexity, soft: TOKENS.engPerplexitySoft },
};

/** Mention-status token. `src` (source-only) uses amber — weak-but-present. */
export const STATUS = {
  yes:     { fill: TOKENS.pos,        ink: '#FFFFFF',    label: 'YES' },
  src:     { fill: TOKENS.accent,     ink: '#FFFFFF',    label: 'SRC' },
  no:      { fill: TOKENS.bgSubtle,   ink: TOKENS.ink3,  label: 'NO'  },
  error:   { fill: TOKENS.bgSubtle,   ink: TOKENS.neg,   label: 'ERR' },
  missing: { fill: TOKENS.bgSubtle,   ink: TOKENS.ink4,  label: '—'   },
};

/** Traffic-light status bucket for hero score. */
export function trafficLight(score) {
  if (typeof score !== 'number') return { color: TOKENS.ink4,   label: 'NO DATA',   verb: 'run first audit' };
  if (score === 0)                return { color: TOKENS.neg,   label: 'INVISIBLE', verb: 'establish presence' };
  if (score < 25)                 return { color: TOKENS.accent,label: 'EMERGING',  verb: 'broaden coverage' };
  if (score < 60)                 return { color: TOKENS.warn,  label: 'PRESENT',   verb: 'deepen authority' };
  return                                 { color: TOKENS.pos,   label: 'STRONG',    verb: 'defend position' };
}

/** XML-escape helper shared by all SVG renderers. */
export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const FONT_SANS = "'Inter', system-ui, -apple-system, Segoe UI, Helvetica, Arial, sans-serif";
export const FONT_MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
