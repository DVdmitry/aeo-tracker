function listMap(list, key = 'name') {
  const m = new Map();
  for (const item of (list || [])) m.set(item[key], item.count);
  return m;
}

export function diff(summaryA, summaryB) {
  const scoreDelta = (summaryB.score ?? 0) - (summaryA.score ?? 0);

  // Cell changes — union of (query, provider) pairs from both runs
  const cells = new Map();
  for (const r of (summaryA.results || [])) {
    cells.set(`${r.query}|${r.provider}`, { query: r.query, provider: r.provider, was: r.mention });
  }
  for (const r of (summaryB.results || [])) {
    const key = `${r.query}|${r.provider}`;
    const prev = cells.get(key) || { query: r.query, provider: r.provider, was: null };
    prev.now = r.mention;
    cells.set(key, prev);
  }

  const cellChanges = [];
  for (const cell of cells.values()) {
    if (cell.was !== cell.now) {
      cellChanges.push({
        provider: cell.provider,
        query: cell.query,
        was: cell.was ?? 'missing',
        now: cell.now ?? 'missing',
      });
    }
  }

  // Competitor movements
  const aComps = listMap(summaryA.topCompetitors);
  const bComps = listMap(summaryB.topCompetitors);

  const newCompetitors = [];
  const lostCompetitors = [];
  for (const [name, count] of bComps) {
    if (!aComps.has(name)) newCompetitors.push({ name, count });
  }
  for (const [name, count] of aComps) {
    if (!bComps.has(name)) lostCompetitors.push({ name, count });
  }

  // Canonical sources movement
  const aSrc = listMap(summaryA.topCanonicalSources, 'url');
  const bSrc = listMap(summaryB.topCanonicalSources, 'url');

  const sourcesGained = [];
  const sourcesLost = [];
  for (const [url, count] of bSrc) {
    if (!aSrc.has(url)) sourcesGained.push({ url, count });
  }
  for (const [url, count] of aSrc) {
    if (!bSrc.has(url)) sourcesLost.push({ url, count });
  }

  return {
    scoreDelta,
    cellChanges,
    newCompetitors,
    lostCompetitors,
    sourcesMovement: { gained: sourcesGained, lost: sourcesLost },
  };
}
