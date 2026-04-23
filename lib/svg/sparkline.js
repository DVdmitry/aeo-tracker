import { TOKENS } from './tokens.js';

/**
 * Mini-trend sparkline — line + area fill + last-point dot.
 *
 * Colour is driven by trend direction (up = pos, down = neg, flat = ink3).
 * The area underneath uses a matching low-alpha fill so it reads as a unit
 * even at 80×20 — important when embedded inline with text.
 *
 * @param {Object} opts
 * @param {(number|null)[]} opts.values
 * @param {number} [opts.width=92]
 * @param {number} [opts.height=22]
 * @param {string} [opts.color]  override auto colour
 */
export function sparkline({ values, width = 92, height = 22, color }) {
  const empty = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"></svg>`;
  if (!values || values.length === 0) return empty;

  const present = values.filter(v => v !== null && v !== undefined && !Number.isNaN(v));
  if (present.length === 0) return empty;

  const min = Math.min(...present);
  const max = Math.max(...present);
  const range = max - min || 1;

  const padY = 3;
  const innerH = height - padY * 2;
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;

  const points = [];
  values.forEach((v, i) => {
    if (v === null || v === undefined || Number.isNaN(v)) return;
    const x = i * stepX;
    const y = padY + innerH - ((v - min) / range) * innerH;
    points.push({ x: +x.toFixed(2), y: +y.toFixed(2) });
  });

  if (points.length === 0) return empty;

  const first = present[0];
  const last = present[present.length - 1];
  const autoColor = last > first ? TOKENS.pos : last < first ? TOKENS.neg : TOKENS.ink3;
  const c = color || autoColor;

  const path = points.map((p, i) => (i === 0 ? `M${p.x} ${p.y}` : `L${p.x} ${p.y}`)).join(' ');
  const firstP = points[0];
  const lastP = points[points.length - 1];
  const area = `M${firstP.x} ${height} L${firstP.x} ${firstP.y} ${points.slice(1).map(p => `L${p.x} ${p.y}`).join(' ')} L${lastP.x} ${height} Z`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="vertical-align:middle;"><path d="${area}" fill="${c}" fill-opacity="0.14"/><path d="${path}" fill="none" stroke="${c}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${lastP.x}" cy="${lastP.y}" r="2.25" fill="${c}"/></svg>`;
}
