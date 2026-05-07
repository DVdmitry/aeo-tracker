/**
 * Static, rule-based domain → category classifier.
 *
 * Knowatoa's "citation source breakdown" (Reddit 42%, G2 28%, ...) is a
 * useful signal because it tells the user WHERE AI's answers come from
 * structurally — reviews vs forums vs news vs reference — and that maps
 * directly to outreach strategy (reviews ≠ forums ≠ media pitch).
 *
 * No LLM call: we just keep a small lookup table of well-known domains
 * by category, plus tail-pattern heuristics (.gov, .edu, "blog." subdomain).
 * Unknown domains fall into "Other".
 *
 * Pure function — easy to unit-test, easy to extend.
 */

// Category definitions — order matters for tie-breaking when a domain matches
// multiple buckets (first match wins). Slug used internally; label is what
// shows in the report.
export const CATEGORIES = [
  { slug: 'review',     label: 'Review platforms', icon: '⭐', why: 'Reach editors of these platforms — get reviews + listings' },
  { slug: 'forum',      label: 'Forums & community', icon: '💬', why: 'Engage in threads where your category is discussed' },
  { slug: 'news',       label: 'News & media',     icon: '📰', why: 'Pitch reporters covering your category' },
  { slug: 'reference',  label: 'Reference (Wikipedia, etc.)', icon: '📚', why: 'Citations rules apply — earn them via independent sources first' },
  { slug: 'qna',        label: 'Q&A platforms',    icon: '❓', why: 'Answer questions with verifiable expertise' },
  { slug: 'social',     label: 'Social platforms', icon: '🌐', why: 'Build authority via posts and discussions' },
  { slug: 'agency',     label: 'Agency / consultancy', icon: '🏢', why: 'Get listed in their roundup posts' },
  { slug: 'blog',       label: 'Blog / publication', icon: '✍️', why: 'Pitch guest posts or contributed bylines' },
  { slug: 'docs',       label: 'Docs / knowledge base', icon: '🛠', why: 'Submit your tool to their integrations page' },
  { slug: 'vendor',     label: 'Vendor sites',     icon: '🏷', why: 'Your product is being listed alongside competitors' },
  { slug: 'gov-edu',    label: 'Government / education', icon: '🎓', why: 'Earn citations via research / regulatory papers' },
  { slug: 'other',      label: 'Other',            icon: '🔗', why: 'Mixed bucket — review individually' },
];

// Direct exact-match domain → category lookups. Stored as a Map for O(1).
// Adding new entries here is the main extension point.
const DOMAIN_TABLE = new Map(Object.entries({
  // Reviews
  'g2.com': 'review',
  'capterra.com': 'review',
  'trustradius.com': 'review',
  'trustpilot.com': 'review',
  'glassdoor.com': 'review',
  'producthunt.com': 'review',
  'softwareadvice.com': 'review',
  'getapp.com': 'review',
  'crozdesk.com': 'review',

  // Forums & community
  'reddit.com': 'forum',
  'quora.com': 'qna',
  'stackoverflow.com': 'qna',
  'stackexchange.com': 'qna',
  'news.ycombinator.com': 'forum',
  'ycombinator.com': 'forum',
  'lobste.rs': 'forum',
  'indiehackers.com': 'forum',
  'discourse.org': 'forum',
  'community.openai.com': 'forum',
  'spiceworks.com': 'forum',

  // News & media
  'techcrunch.com': 'news',
  'theverge.com': 'news',
  'arstechnica.com': 'news',
  'wired.com': 'news',
  'venturebeat.com': 'news',
  'engadget.com': 'news',
  'forbes.com': 'news',
  'businessinsider.com': 'news',
  'bloomberg.com': 'news',
  'reuters.com': 'news',
  'cnbc.com': 'news',
  'wsj.com': 'news',
  'fastcompany.com': 'news',
  'inc.com': 'news',
  'entrepreneur.com': 'news',
  'searchengineland.com': 'news',
  'searchenginejournal.com': 'news',

  // Reference
  'wikipedia.org': 'reference',
  'wiktionary.org': 'reference',
  'britannica.com': 'reference',
  'investopedia.com': 'reference',

  // Social
  'linkedin.com': 'social',
  'twitter.com': 'social',
  'x.com': 'social',
  'facebook.com': 'social',
  'instagram.com': 'social',
  'youtube.com': 'social',
  'tiktok.com': 'social',
  'mastodon.social': 'social',
  'bsky.app': 'social',
  'threads.net': 'social',

  // Agency / consultancy
  'firstpagesage.com': 'agency',
  'neilpatel.com': 'agency',
  'ahrefs.com': 'agency',
  'semrush.com': 'agency',
  'moz.com': 'agency',
  'backlinko.com': 'agency',
  'hubspot.com': 'agency',
  'siegemedia.com': 'agency',
  'animalz.co': 'agency',
  'nogood.io': 'agency',
  'minuttia.com': 'agency',
  'optimist.com': 'agency',
  'webappski.com': 'agency',

  // Blog / publication
  'medium.com': 'blog',
  'substack.com': 'blog',
  'dev.to': 'blog',
  'hashnode.com': 'blog',
  'hackernoon.com': 'blog',
  'smashingmagazine.com': 'blog',

  // Docs / knowledge base
  'readthedocs.io': 'docs',
  'gitbook.com': 'docs',
  'docs.github.com': 'docs',
  'developer.mozilla.org': 'docs',
  'github.com': 'docs',
}));

/**
 * Classify a single hostname into one of CATEGORIES.
 *
 * Order: exact lookup → suffix heuristic → subdomain heuristic → fallback.
 */
export function categorizeDomain(host) {
  if (!host || typeof host !== 'string') return { slug: 'other', label: 'Other', icon: '🔗' };

  const cleaned = host.toLowerCase().replace(/^www\./, '').trim();

  // Exact match in table
  if (DOMAIN_TABLE.has(cleaned)) {
    return findCategoryBySlug(DOMAIN_TABLE.get(cleaned));
  }

  // Suffix heuristic: check parent domain (e.g. blog.example.com → example.com)
  const parts = cleaned.split('.');
  if (parts.length > 2) {
    const parent = parts.slice(-2).join('.');
    if (DOMAIN_TABLE.has(parent)) {
      return findCategoryBySlug(DOMAIN_TABLE.get(parent));
    }
  }

  // TLD-based defaults
  if (cleaned.endsWith('.gov') || cleaned.endsWith('.edu')) {
    return findCategoryBySlug('gov-edu');
  }

  // Subdomain hint: blog.foo.com / docs.foo.com
  if (cleaned.startsWith('blog.') || cleaned.includes('.blog.')) {
    return findCategoryBySlug('blog');
  }
  if (cleaned.startsWith('docs.') || cleaned.startsWith('developer.') || cleaned.startsWith('developers.')) {
    return findCategoryBySlug('docs');
  }
  if (cleaned.startsWith('community.') || cleaned.startsWith('forum.') || cleaned.startsWith('discuss.')) {
    return findCategoryBySlug('forum');
  }
  if (cleaned.startsWith('help.') || cleaned.startsWith('support.')) {
    return findCategoryBySlug('docs');
  }

  return findCategoryBySlug('other');
}

function findCategoryBySlug(slug) {
  return CATEGORIES.find(c => c.slug === slug) || CATEGORIES[CATEGORIES.length - 1];
}

/**
 * Aggregate a list of {host, count} into per-category buckets with totals.
 *
 * Returns:
 *   [{ slug, label, icon, count, share, domains: [{host, count, share}], why }]
 * sorted by count desc.
 */
export function aggregateByCategory(topDomains) {
  if (!Array.isArray(topDomains) || topDomains.length === 0) return [];

  const totalCount = topDomains.reduce((s, d) => s + (d.count || 0), 0);
  if (totalCount === 0) return [];

  const byCategory = new Map();
  for (const d of topDomains) {
    const cat = categorizeDomain(d.host);
    if (!byCategory.has(cat.slug)) {
      byCategory.set(cat.slug, { ...cat, count: 0, share: 0, domains: [] });
    }
    const bucket = byCategory.get(cat.slug);
    bucket.count += d.count || 0;
    bucket.domains.push({ host: d.host, count: d.count || 0, share: d.share || 0 });
  }

  for (const bucket of byCategory.values()) {
    bucket.share = bucket.count / totalCount;
    bucket.domains.sort((a, b) => b.count - a.count);
  }

  return Array.from(byCategory.values()).sort((a, b) => b.count - a.count);
}
