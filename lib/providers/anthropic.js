/**
 * Call Anthropic Messages API.
 *
 * @param {object} [options]
 * @param {boolean} [options.webSearch=true]
 *   When true, attaches the `web_search` tool.
 *   When false, omits the tool — use for analysis tasks where the model should not fetch web results
 *   (e.g. init auto-suggest, where we already provide the site content).
 */
export async function callAnthropic(query, apiKey, model, options = {}) {
  const webSearch = options.webSearch !== false;
  const body = {
    model,
    max_tokens: 2048,
    messages: [{ role: 'user', content: query }],
  };
  if (webSearch) {
    body.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }];
  }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (json.error) throw new Error(`Anthropic: ${json.error.message}`);
  const text = (json.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
  const citations = (json.content || [])
    .filter(b => b.type === 'web_search_tool_result')
    .flatMap(b => (b.content || []).map(c => c.url).filter(Boolean));
  return { text, citations, raw: json };
}
