import { TOKENS, STATUS, FONT_SANS, FONT_MONO, esc } from './tokens.js';

/**
 * AI × Query heatmap.
 *
 * Visual system v2 — warm neutrals + amber for SRC. Cell sits on a card-like
 * rounded rect with status fill + matching ink. Row labels in sans, column
 * labels in semibold sans, status label in mono so the three-letter tokens
 * line up visually.
 *
 * @param {Object} data
 * @param {string[]} data.rows     row labels (engines)
 * @param {string[]} data.cols     column labels (queries — truncated upstream)
 * @param {string[][]} data.cells  2D status grid: 'yes'|'src'|'no'|'error'|'missing'
 */
export function heatmap({ rows, cols, cells }) {
  const cellW = 92;
  const cellH = 40;
  const gap = 6;
  const leftPad = 160;
  const topPad = 32;
  const rightPad = 12;
  const bottomPad = 12;
  const W = leftPad + cols.length * cellW + rightPad;
  const H = topPad + rows.length * cellH + bottomPad;

  const colHeaders = cols.map((c, i) => {
    const x = leftPad + i * cellW + cellW / 2;
    const txt = truncate(c, 14);
    return `<text x="${x}" y="${topPad - 10}" text-anchor="middle" font-size="11" font-family="${FONT_SANS}" font-weight="600" fill="${TOKENS.ink2}" letter-spacing="0.02em">${esc(txt)}</text>`;
  }).join('');

  const body = rows.map((row, ri) => {
    const y = topPad + ri * cellH;
    const rowLabel = `<text x="${leftPad - 14}" y="${y + cellH / 2 + 4}" text-anchor="end" font-size="12.5" font-family="${FONT_SANS}" font-weight="500" fill="${TOKENS.ink}">${esc(row)}</text>`;
    const rowCells = cols.map((_, ci) => {
      const status = (cells[ri] || [])[ci] || 'missing';
      const st = STATUS[status] || STATUS.missing;
      const x = leftPad + ci * cellW;
      const rectX = x + gap / 2;
      const rectY = y + gap / 2;
      const rectW = cellW - gap;
      const rectH = cellH - gap;

      // "no" and "missing" get stroked outlines (not filled) to feel like a gap, not a state
      const isEmpty = status === 'no' || status === 'missing';
      const fill = isEmpty ? 'none' : st.fill;
      const stroke = isEmpty ? TOKENS.border : 'none';
      const strokeAttr = isEmpty ? `stroke="${stroke}" stroke-width="1"` : '';
      const textFill = isEmpty ? st.ink : st.ink;

      const cellBg = `<rect x="${rectX}" y="${rectY}" width="${rectW}" height="${rectH}" rx="7" fill="${fill}" ${strokeAttr}/>`;
      const cellLabel = `<text x="${x + cellW / 2}" y="${y + cellH / 2 + 4}" text-anchor="middle" font-size="10.5" font-weight="600" font-family="${FONT_MONO}" fill="${textFill}" letter-spacing="0.08em">${st.label}</text>`;
      return cellBg + cellLabel;
    }).join('');
    return rowLabel + rowCells;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px;height:auto;">${colHeaders}${body}</svg>`;
}

function truncate(s, n) {
  const t = String(s);
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}
