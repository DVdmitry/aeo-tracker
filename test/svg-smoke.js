// Visual smoke test for lib/svg/*.
// Run: node test/svg-smoke.js
// Output: test/svg-smoke-output.html (open in browser to verify visually)

import { writeFile } from 'node:fs/promises';
import { heatmap, barchart, sparkline, deltaArrow } from '../lib/svg/index.js';

const hm = heatmap({
  rows: ['Perplexity', 'Gemini 2.5 Pro', 'Claude Opus 4.6', 'ChatGPT GPT-5.4'],
  cols: ['Q1', 'Q2', 'Q3'],
  cells: [
    ['yes', 'yes', 'yes'],
    ['yes', 'no', 'yes'],
    ['no', 'src', 'no'],
    ['no', 'no', 'no'],
  ],
});

const bc = barchart({
  items: [
    { label: 'https://typelessform.com', value: 9 },
    { label: 'https://www.npmjs.com/...', value: 6 },
    { label: 'https://typeform.com', value: 4 },
    { label: 'https://jonnylangefeld.com', value: 2 },
  ],
});

const sp1 = sparkline({ values: [22, 33, 50, 67] });
const sp2 = sparkline({ values: [70, 55, 40, 0] });
const sp3 = sparkline({ values: [33, 33, 33, 33] });

const upA = deltaArrow({ value: 11 });
const downA = deltaArrow({ value: -8 });
const flatA = deltaArrow({ value: 0 });

const html = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>aeo-tracker SVG smoke test</title>
<style>body{font:14px system-ui,sans-serif;max-width:900px;margin:40px auto;padding:0 24px;color:#0f172a}h2{margin:40px 0 12px;color:#475569;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.06em}figure{margin:0 0 24px;padding:16px;border:1px solid #e2e8f0;border-radius:8px;background:#fff}</style>
</head>
<body>
<h1>SVG primitives smoke test</h1>
<p>If these render correctly in your browser, the primitives work.</p>

<h2>heatmap</h2>
<figure>${hm}</figure>

<h2>barchart</h2>
<figure>${bc}</figure>

<h2>sparkline (up, down, flat)</h2>
<figure>up: ${sp1} &nbsp; down: ${sp2} &nbsp; flat: ${sp3}</figure>

<h2>deltaArrow (up, down, flat)</h2>
<figure>
  up (+11pp) ${upA} &nbsp;&nbsp;
  down (-8pp) ${downA} &nbsp;&nbsp;
  flat (0) ${flatA}
</figure>
</body></html>`;

await writeFile(new URL('./svg-smoke-output.html', import.meta.url), html);
console.log('Wrote test/svg-smoke-output.html');
console.log('Sizes (chars):', { heatmap: hm.length, barchart: bc.length, sparkline: sp1.length, deltaArrow: upA.length });
