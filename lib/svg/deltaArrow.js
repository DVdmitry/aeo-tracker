import { TOKENS } from './tokens.js';

/**
 * Tiny inline delta indicator (up/down/flat arrow).
 * Path-based (not unicode) so it renders identically regardless of font stack.
 */
export function deltaArrow({ value, size = 12 }) {
  const v = Number(value);
  const color = v > 0 ? TOKENS.pos : v < 0 ? TOKENS.neg : TOKENS.ink3;
  const pad = 2;
  const a = pad;
  const b = size - pad;
  const mid = size / 2;

  let path, fill, stroke, strokeWidth;
  if (v > 0) {
    path = `M${a} ${b} L${mid} ${a} L${b} ${b} Z`;
    fill = color; stroke = 'none'; strokeWidth = 0;
  } else if (v < 0) {
    path = `M${a} ${a} L${mid} ${b} L${b} ${a} Z`;
    fill = color; stroke = 'none'; strokeWidth = 0;
  } else {
    path = `M${a} ${mid} L${b} ${mid}`;
    fill = 'none'; stroke = color; strokeWidth = 2;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="vertical-align:middle;"><path d="${path}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
