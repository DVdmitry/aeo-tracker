import { esc } from './tokens.js';

const ORANGE = '#B85C16';
const DARK = '#1A1610';

// Axis order: Presence (top), Mentions (right), Rank (bottom), Sentiment (left).
// Values 0-100 map to radius 0-100 in SVG user-space.
function pointsFor({ presence, mentions, rank, sentiment }) {
  const clamp = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
  const p = clamp(presence);
  const m = clamp(mentions);
  const r = clamp(rank);
  const s = clamp(sentiment);
  return `0,${-p} ${m},0 0,${r} ${-s},0`;
}

/**
 * Combined 4-axis radar — brand polygon overlaid on top-3 competitor average.
 *
 * Layout: viewBox 360×290 (canonical 280×240 was clipping "Mentions" on the
 * right and "Sentiment" on the left because labels at x=±115 plus 60-px text
 * width overflowed the 280-wide canvas). Center moved to (180, 145) so the
 * inner radar still has 100-radius rings + 50px label margin on each side.
 *
 * Tick labels (25/50/75/100) are drawn along the upper Presence axis so the
 * reader can decode polygon distance from centre without an external legend.
 *
 * @param {Object} opts
 * @param {{presence:number,mentions:number,rank:number,sentiment:number}} opts.userAxes
 * @param {{presence:number,mentions:number,rank:number,sentiment:number}} opts.avgAxes
 * @param {string} opts.userLabel  legend label for brand polygon
 * @param {string} [opts.avgLabel='Top-3 avg']
 */
export function combinedRadar({ userAxes, avgAxes, userLabel, avgLabel = 'Top-3 avg' }) {
  const userPts = pointsFor(userAxes);
  const avgPts = pointsFor(avgAxes);
  return `<svg class="chart" viewBox="0 0 360 290" style="margin: auto;" role="img" aria-label="4-axis radar comparing your brand to top-3 competitor average">
  <g transform="translate(180 145)">
    <circle r="25"  fill="none" class="chart-grid"/>
    <circle r="50"  fill="none" class="chart-grid"/>
    <circle r="75"  fill="none" class="chart-grid"/>
    <circle r="100" fill="none" class="chart-grid"/>
    <line x1="0" y1="-100" x2="0" y2="100" class="chart-grid"/>
    <line x1="-100" y1="0" x2="100" y2="0" class="chart-grid"/>
    <text class="chart-axis" x="6" y="-22"  text-anchor="start">25</text>
    <text class="chart-axis" x="6" y="-47"  text-anchor="start">50</text>
    <text class="chart-axis" x="6" y="-72"  text-anchor="start">75</text>
    <text class="chart-axis" x="6" y="-97"  text-anchor="start">100</text>
    <polygon points="${avgPts}" fill="${DARK}" fill-opacity="0.18" stroke="${DARK}" stroke-width="1" stroke-opacity="0.6"/>
    <polygon points="${userPts}" fill="${ORANGE}" fill-opacity="0.4" stroke="${ORANGE}" stroke-width="1.5"/>
    <text class="chart-axis" x="0"    y="-115" text-anchor="middle">Presence</text>
    <text class="chart-axis" x="115"  y="4"    text-anchor="start">Mentions</text>
    <text class="chart-axis" x="0"    y="120"  text-anchor="middle">Rank</text>
    <text class="chart-axis" x="-115" y="4"    text-anchor="end">Sentiment</text>
  </g>
  <g transform="translate(20 275)">
    <rect x="0"   y="0" width="10" height="3" fill="${ORANGE}"/>
    <text class="chart-axis" x="16" y="4">${esc(userLabel)}</text>
    <rect x="140" y="0" width="10" height="3" fill="${DARK}" fill-opacity="0.6"/>
    <text class="chart-axis" x="156" y="4">${esc(avgLabel)}</text>
  </g>
</svg>`;
}
