// Regression test for Phase 1 audit P0 #1.
// Guards against re-introduction of hardcoded /ru/ in mc-bridge.js.
import { readFileSync } from 'node:fs';

const src = readFileSync('lib/report/mc-bridge.js', 'utf8');

if (src.includes('webappski.com/ru/aeo-mission-control')) {
  console.error('FAIL: mc-bridge.js still contains hardcoded /ru/aeo-mission-control');
  process.exit(1);
}

// Must derive lang from metadata.identity.lang (or fallback)
if (!src.includes('${lang}/aeo-mission-control')) {
  console.error('FAIL: mc-bridge.js does not use ${lang}/aeo-mission-control template');
  process.exit(1);
}

if (!src.match(/metadata\s*&&\s*metadata\.identity\s*&&\s*metadata\.identity\.lang/)) {
  console.error('FAIL: mc-bridge.js does not derive lang from metadata.identity.lang');
  process.exit(1);
}

console.log('OK: mc-bridge.js uses lang-aware URL via metadata.identity.lang');
