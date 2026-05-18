// Regression test for Phase 1 audit P0 #2.
// Guards against re-introduction of /portal/ segment in aeo-mission-control links.
import { readFileSync } from 'node:fs';

const src = readFileSync('lib/report/sections.js', 'utf8');

if (src.includes('/portal/aeo-mission-control')) {
  console.error('FAIL: sections.js still contains /portal/aeo-mission-control (404 path)');
  process.exit(1);
}

if (!src.includes('${lang}/aeo-mission-control')) {
  console.error('FAIL: sections.js does not use ${lang}/aeo-mission-control template');
  process.exit(1);
}

console.log('OK: sections.js uses lang-aware URL without /portal/ segment');
