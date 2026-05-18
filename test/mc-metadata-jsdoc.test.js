// Regression test for audit-plan finding 2026-05-18.
// Guards against re-introduction of /portal/ in mc-metadata.js JSDoc.
import { readFileSync } from 'node:fs';

const src = readFileSync('lib/report/mc-metadata.js', 'utf8');

if (src.includes('/portal/aeo-mission-control')) {
  console.error('FAIL: mc-metadata.js JSDoc still references /portal/aeo-mission-control');
  process.exit(1);
}

console.log('OK: mc-metadata.js JSDoc clean (no /portal/ reference)');
