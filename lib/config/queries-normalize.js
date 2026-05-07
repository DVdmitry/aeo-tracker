/**
 * Normalise queries from `.aeo-tracker.json` into a uniform shape.
 *
 * Supported input formats (backwards-compatible — string-only is the
 * historical shape, object form is new in v0.4):
 *
 *   queries: ["best CRM 2026", "free SEO tools"]                // strings only
 *   queries: [
 *     { q: "best CRM 2026", tag: "comparison-bofu" },           // tagged object
 *     { q: "free SEO tools", tag: "tofu" },
 *     "untagged top-of-funnel keyword",                          // mixed OK
 *   ]
 *
 * Output:
 *   {
 *     texts: ["best CRM 2026", "free SEO tools", "untagged ..."],
 *     tags:  ["comparison-bofu", "tofu", null],
 *     hasTags: true,         // any item carries a tag
 *     uniqueTags: ["comparison-bofu", "tofu"],
 *   }
 *
 * The two parallel arrays mean existing code that loops `for (qi of queries)`
 * keeps working unchanged — `texts[qi]` returns the same string it always did.
 * The tag is looked up separately and attached to results.
 */

/**
 * Normalise raw `queries` from `.aeo-tracker.json` into a uniform
 * { texts, tags, hasTags, uniqueTags } shape.
 *
 * Why: tagged objects are new in v0.4 (sales/comparison/tofu); legacy configs
 * are bare strings. Centralising the parse keeps every consumer (`run`, report,
 * topic clusterer) on one shape and unaware of the input variant.
 *
 * Unknown items in the array are silently skipped — keeping the function pure
 * and cheap. Validation/warnings happen earlier in `cmdInit`.
 *
 * @param {Array<string|{q:string,tag?:string}>} rawQueries
 * @returns {{ texts: string[], tags: Array<string|null>, hasTags: boolean, uniqueTags: string[] }}
 */
export function normalizeQueries(rawQueries) {
  if (!Array.isArray(rawQueries)) {
    return { texts: [], tags: [], hasTags: false, uniqueTags: [] };
  }

  const texts = [];
  const tags = [];

  for (const item of rawQueries) {
    if (typeof item === 'string') {
      texts.push(item);
      tags.push(null);
    } else if (item && typeof item === 'object' && typeof item.q === 'string') {
      texts.push(item.q);
      const tag = typeof item.tag === 'string' ? item.tag.trim() : null;
      tags.push(tag && tag.length > 0 ? tag : null);
    } else {
      // unknown shape — skip
    }
  }

  const tagSet = new Set(tags.filter(t => !!t));
  return {
    texts,
    tags,
    hasTags: tagSet.size > 0,
    uniqueTags: Array.from(tagSet),
  };
}
