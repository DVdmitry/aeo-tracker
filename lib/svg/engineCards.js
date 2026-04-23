/**
 * Engine cards — a 4-up strip shown at the top of the report so readers see
 * per-engine visibility before the global score. Each card has:
 *   - engine code badge (coloured by engine hue)
 *   - engine name + kind
 *   - big percentage in engine hue
 *   - sparkline area-fill in engine hue
 *   - hits / total micro-stat
 *
 * Rendered as a single SVG so it survives markdown → GitHub, Notion, email,
 * etc. Zero runtime deps.
 */

import { TOKENS, ENGINES, FONT_SANS, FONT_MONO, esc } from './tokens.js';
import { sparkline } from './sparkline.js';

/**
 * @param {Object} opts
 * @param {{provider:string,label:string,color:string,pct:number,hits:number,total:number,series:(number|null)[],delta?:number|null}[]} opts.cards
 */
export function engineCards({ cards }) {
  if (!cards || cards.length === 0) return '';

  const cardW = cards.length > 5 ? 160 : 180;
  const cardH = 148;
  const gap = 10;
  const pad = 14;
  const W = cards.length * cardW + (cards.length - 1) * gap;
  const H = cardH;

  const body = cards.map((c, i) => {
    const x = i * (cardW + gap);
    const color = c.color || TOKENS.ink;
    const pct = Math.round(c.pct ?? 0);
    const deltaStr = c.delta == null
      ? '▪ baseline'
      : c.delta > 0 ? `▲ +${c.delta}pp`
      : c.delta < 0 ? `▼ ${c.delta}pp`
      : '▪ no change';
    const deltaColor = c.delta == null ? TOKENS.ink3
      : c.delta > 0 ? TOKENS.pos
      : c.delta < 0 ? TOKENS.neg
      : TOKENS.ink3;

    // Top accent strip + card body
    const frame = `<rect x="${x}" y="0" width="${cardW}" height="${cardH}" rx="10" fill="${TOKENS.bgRaised}" stroke="${TOKENS.border}" stroke-width="1"/>`;
    const topAccent = `<rect x="${x}" y="0" width="${cardW}" height="3" rx="1.5" fill="${color}"/>`;

    // Badge
    const bx = x + pad;
    const by = pad + 6;
    const badge = `<rect x="${bx}" y="${by}" width="26" height="26" rx="6" fill="${color}"/>` +
      `<text x="${bx + 13}" y="${by + 17}" text-anchor="middle" font-family="${FONT_MONO}" font-weight="700" font-size="10.5" fill="#FFFFFF" letter-spacing="0.04em">${esc(c.code || '')}</text>`;

    // Name + kind
    const nx = x + pad + 34;
    const nameLine = `<text x="${nx}" y="${by + 11}" font-family="${FONT_SANS}" font-weight="600" font-size="13" fill="${TOKENS.ink}">${esc(c.label)}</text>`;
    const kindLine = `<text x="${nx}" y="${by + 25}" font-family="${FONT_SANS}" font-size="10.5" fill="${TOKENS.ink3}">${esc(c.kind || '')}</text>`;

    // Big number + unit
    const vy = by + 58;
    const valueTxt = `<text x="${x + pad}" y="${vy}" font-family="${FONT_MONO}" font-weight="500" font-size="28" fill="${color}" letter-spacing="-0.02em">${pct}<tspan font-size="14" fill="${TOKENS.ink3}" dy="-1">%</tspan></text>`;
    const delta = `<text x="${x + cardW - pad}" y="${vy}" text-anchor="end" font-family="${FONT_SANS}" font-size="10.5" fill="${deltaColor}" font-weight="500">${esc(deltaStr)}</text>`;

    // Sparkline (positioned under value)
    const spW = cardW - pad * 2;
    const spH = 24;
    const spY = vy + 8;
    const sparkSvg = sparkline({ values: c.series || [], width: spW, height: spH, color }).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
    const sparkWrap = `<g transform="translate(${x + pad},${spY})"><svg width="${spW}" height="${spH}" viewBox="0 0 ${spW} ${spH}">${sparkSvg}</svg></g>`;

    // Bottom stats — hits/total + sub-text
    const statsY = cardH - 14;
    const divider = `<line x1="${x + pad}" y1="${statsY - 16}" x2="${x + cardW - pad}" y2="${statsY - 16}" stroke="${TOKENS.border}" stroke-width="1"/>`;
    const statsTxt = `<text x="${x + pad}" y="${statsY}" font-family="${FONT_SANS}" font-size="10.5" fill="${TOKENS.ink3}">Hits <tspan font-family="${FONT_MONO}" font-weight="500" fill="${TOKENS.ink}">${c.hits}/${c.total}</tspan></text>`;
    const rate = `<text x="${x + cardW - pad}" y="${statsY}" text-anchor="end" font-family="${FONT_MONO}" font-size="10.5" fill="${TOKENS.ink3}">${Math.round(((c.hits || 0) / (c.total || 1)) * 100)}% hit</text>`;

    return frame + topAccent + badge + nameLine + kindLine + valueTxt + delta + sparkWrap + divider + statsTxt + rate;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px;height:auto;">${body}</svg>`;
}
