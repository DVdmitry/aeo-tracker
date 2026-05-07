/**
 * Authority-source presence checker — does the brand have a Wikipedia article?
 * Is it discussed in relevant subreddits?
 *
 * Otterly recommends "PR + earned media + Reddit + Wikipedia" as core off-page
 * signals AI engines weight heavily. This module surfaces those signals as
 * boolean (or count) checks at zero LLM cost.
 *
 *   - Wikipedia: Wikipedia REST API → page exists yes/no, lastModified, URL
 *   - Reddit:    old.reddit.com search JSON → match count + top subreddits
 *
 * Both sources have free public APIs with no authentication. Both have rate
 * limits; we run once per report and cache the result in `_summary.json`.
 */

const FETCH_TIMEOUT_MS = 8000;
const USER_AGENT = '@webappski/aeo-tracker (https://github.com/webappski/aeo-tracker)';

async function fetchWithTimeout(url, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs || FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...opts,
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json', ...(opts.headers || {}) },
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Wikipedia REST summary — exact title match. We only check `en.wikipedia.org`
 * because that's the corpus most LLMs were trained on. Disambiguation pages
 * count as "found" but are flagged so the user knows it's not their brand.
 */
export async function checkWikipedia(brand, { fetchImpl = fetchWithTimeout } = {}) {
  if (!brand || typeof brand !== 'string') return { found: false, error: 'no brand' };
  const slug = encodeURIComponent(brand.trim().replace(/\s+/g, '_'));
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`;

  try {
    const res = await fetchImpl(url);
    if (res.status === 404) {
      return { found: false, status: 404, url, queryUrl: `https://en.wikipedia.org/wiki/${slug}` };
    }
    if (!res.ok) {
      return { found: false, status: res.status, url, error: `HTTP ${res.status}` };
    }
    const data = await res.json();
    return {
      found: true,
      title: data.title,
      type: data.type,                          // "standard" | "disambiguation"
      isDisambiguation: data.type === 'disambiguation',
      extract: typeof data.extract === 'string' ? data.extract.slice(0, 240) : '',
      pageUrl: data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${slug}`,
      lastModified: data.timestamp || null,
    };
  } catch (err) {
    return { found: false, error: err.message || String(err), url };
  }
}

/**
 * Reddit search — old.reddit.com supports a JSON endpoint that returns up to
 * 25 results without auth. We count matches and report the top 5 subreddits
 * where the brand surfaces. This is "discoverable in social proof?", not
 * "what do people say?" — sentiment requires another module pass.
 */
export async function checkReddit(brand, { fetchImpl = fetchWithTimeout, limit = 25 } = {}) {
  if (!brand || typeof brand !== 'string') return { found: false, error: 'no brand' };

  // Strip embedded double-quotes so the wrapping quote-pair stays balanced;
  // wrap multi-word brands so the search is exact-match.
  const cleaned = brand.replace(/"/g, '');
  const q = cleaned.includes(' ') ? `"${cleaned}"` : cleaned;
  const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(q)}&sort=relevance&limit=${limit}`;

  try {
    const res = await fetchImpl(url);
    if (!res.ok) {
      return { found: false, status: res.status, error: `HTTP ${res.status}`, url };
    }
    const data = await res.json();
    const posts = data.data?.children || [];
    if (posts.length === 0) {
      return { found: false, mentionCount: 0, topSubs: [], url };
    }

    const subCounts = new Map();
    for (const p of posts) {
      const sub = p.data?.subreddit;
      if (!sub) continue;
      subCounts.set(sub, (subCounts.get(sub) || 0) + 1);
    }
    const topSubs = Array.from(subCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    return {
      found: true,
      mentionCount: posts.length,
      capped: posts.length === limit,
      topSubs,
      sampleTitle: posts[0]?.data?.title?.slice(0, 140) || '',
      url,
    };
  } catch (err) {
    return { found: false, error: err.message || String(err), url };
  }
}

/**
 * Run both checks in parallel and return a combined object suitable for
 * caching in `_summary.json::authorityPresence`.
 */
export async function checkAuthorityPresence(brand, opts = {}) {
  const [wikipedia, reddit] = await Promise.all([
    checkWikipedia(brand, opts),
    checkReddit(brand, opts),
  ]);
  return {
    brand,
    ranAt: new Date().toISOString(),
    wikipedia,
    reddit,
  };
}
