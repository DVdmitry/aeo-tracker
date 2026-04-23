import { TOKENS, FONT_SANS, FONT_MONO, esc } from './tokens.js';

/**
 * Horizontal bar chart — competitor / canonical-sources visualisation.
 *
 * YOU row (`accent: true`) gets the amber accent; others use a warm slate
 * that's slightly deeper than `border` so bars read as solid on the warm bg.
 *
 * @param {Object} opts
 * @param {{label:string,value:number,accent?:boolean,sublabel?:string}[]} opts.items
 * @param {number} [opts.maxBarWidth=360]
 * @param {number} [opts.barHeight=22]
 * @param {number} [opts.gap=10]
 * @param {number} [opts.labelWidth=200]
 */
export function barchart({ items, maxBarWidth = 480, barHeight = 26, gap = 12, labelWidth = 220 }) {
  if (!items || items.length === 0) return '';

  const max = items.reduce((m, it) => Math.max(m, it.value), 0) || 1;
  const valueWidth = 64;
  const W = labelWidth + maxBarWidth + valueWidth;
  const H = items.length * (barHeight + gap) + 2;

  const body = items.map((it, i) => {
    const y = i * (barHeight + gap) + 2;
    const w = Math.max(3, Math.round((it.value / max) * maxBarWidth));
    const barColor = it.accent ? TOKENS.accent : TOKENS.ink3;
    const bgColor = it.accent ? TOKENS.accentSoft : TOKENS.bgSubtle;
    const labelColor = it.accent ? TOKENS.accentInk : TOKENS.ink;
    const labelWeight = it.accent ? '700' : '500';

    // Background track (subtle)
    const track = `<rect x="${labelWidth}" y="${y}" width="${maxBarWidth}" height="${barHeight}" rx="4" fill="${bgColor}" opacity="0.6"/>`;
    const bar = `<rect x="${labelWidth}" y="${y}" width="${w}" height="${barHeight}" rx="4" fill="${barColor}"/>`;
    const label = `<text x="${labelWidth - 12}" y="${y + barHeight * 0.68}" text-anchor="end" font-size="15" font-family="${FONT_SANS}" font-weight="${labelWeight}" fill="${labelColor}">${esc(it.label)}</text>`;
    const value = `<text x="${labelWidth + w + 8}" y="${y + barHeight * 0.68}" font-size="14" font-family="${FONT_MONO}" font-weight="500" fill="${TOKENS.ink3}">${it.value}</text>`;
    return track + bar + label + value;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px;height:auto;">${body}</svg>`;
}
