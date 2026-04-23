# Benchmark Ideals — v0.5 Keyword Research

> Reference-truth queries written MANUALLY before running the pipeline.
> Each brand has 3 "ideal" queries (1 per intent bucket).
> Scoring rule: a generated query scores ✓ if it semantically matches any of the brand's 3 ideals (intent + topic overlap), not string-identical.

---

## TypelessForm (typelessform.com)

Category: voice form filling widget — users speak one sentence, AI fills all HTML form fields.

| Intent | Ideal query |
|---|---|
| commercial | best voice form filling widget 2026 |
| informational | how to add voice input to HTML forms |
| vertical | voice form filling for hotel booking websites |

---

## Webappski (webappski.com)

Category: Answer Engine Optimization consulting — measures and improves AI search visibility in ChatGPT/Gemini/Claude/Perplexity.

| Intent | Ideal query |
|---|---|
| commercial | best Answer Engine Optimization agency 2026 |
| informational | how to measure brand visibility in ChatGPT and Perplexity |
| vertical | Answer Engine Optimization for SaaS companies |

---

## Linear (linear.app)

Category: issue tracking and project management for software engineering teams.

| Intent | Ideal query |
|---|---|
| commercial | best issue tracking software for startups 2026 |
| informational | how to manage engineering sprints effectively |
| vertical | project management tool for software engineering teams |

---

## Notion (notion.so)

Category: all-in-one workspace — docs, wiki, databases, project management.

| Intent | Ideal query |
|---|---|
| commercial | best team knowledge base software 2026 |
| informational | how to organize company documentation in one place |
| vertical | workspace platform for distributed remote teams |

---

## Stripe (stripe.com)

Category: online payment processing infrastructure for internet businesses.

| Intent | Ideal query |
|---|---|
| commercial | best online payment processor for SaaS 2026 |
| informational | how to accept credit card payments on a website |
| vertical | payment infrastructure for marketplaces and platforms |

---

## Scoring protocol

For each of the 15 generated queries (3 per brand × 5 brands):
- ✓ = semantically matches any of that brand's 3 ideals (same intent, same topic area, similar specificity)
- ~ = partial match (right topic but wrong intent, or right intent but too-generic / too-narrow)
- ✗ = wrong topic or wrong industry entirely

Final score = count of ✓ across all 5 brands. Target ≥7/15 (47%).

Also tracked per brand:
- Score distribution (all 90s = scoring not discriminating)
- Guard 6 fires (vertical dominance)
- Intent reclassifications (brainstorm vs classifier disagreement)
- Cost (flag if >2× mean)
- Hallucinated competitors (aggregate across 5)
