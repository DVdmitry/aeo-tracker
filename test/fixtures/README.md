# Test fixtures

This directory is reserved for real AI-response snapshots when they are needed
for regression testing.

**Currently empty.** The previous regex-based extractor relied on fixtures because
its output depended heavily on the exact markdown formatting of each engine. The
current extractor (`lib/report/extract-competitors-llm.js`) uses two LLMs to
decide what is and isn't a brand, so its behavior isn't tied to fixture-specific
formatting quirks.

If a future bug surfaces that requires pinning behavior against a specific real
response, add fixtures here and document:

- Source date
- Engines covered
- What the fixture pins down (e.g. "Gemini definition-list format where brand
  name is inside bold with trailing colon")

## When to rotate

Re-capture fixtures when **any** of these is true:

1. **Calendar drift** — fixtures older than ~6 weeks. Engine output style changes
   with model updates; stale fixtures test yesterday's behavior.
2. **New provider added** — capture a sample response from the new engine.
3. **Model upgrade** — provider bumped to a new model version.

## How to rotate

```bash
# 1. Run a fresh visibility check
node bin/aeo-tracker.js run

# 2. Copy raw responses into the fixture directory
DATE=$(date +%Y-%m-%d)
for i in 1 2 3; do
  for p in openai anthropic gemini; do
    model=$(jq -r ".providers.$p.model" .aeo-tracker.json)
    cp "aeo-responses/$DATE/q$i-$p-$model.txt" "test/fixtures/q$i-$p-$model.txt" 2>/dev/null
  done
done

# 3. Write/update the test that uses the fixture.
# 4. Run npm test — regressions show up here.
```

## What NOT to do

- Don't hand-edit fixture files to make tests pass — if an engine changed output,
  the fixture should reflect it.
- Don't commit fixtures with PII or API keys — verify before copying.
