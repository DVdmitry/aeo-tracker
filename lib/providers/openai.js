/**
 * Call OpenAI chat completions API.
 *
 * @param {string} query    user prompt
 * @param {string} apiKey   OpenAI API key
 * @param {string} model    model name (e.g. "gpt-5-search-api" or "gpt-5.4")
 * @param {object} [options]
 * @param {boolean} [options.webSearch=true]
 *   When true, attaches `web_search_options: {}` — required for `-search-preview` models.
 *   When false, omits the flag — use for analysis tasks where the model should not fetch web results
 *   (e.g. init auto-suggest, where we already provide the site content).
 */
export async function callOpenAI(query, apiKey, model, options = {}) {
  const webSearch = options.webSearch !== false;
  const body = {
    model,
    messages: [{ role: 'user', content: query }],
  };
  if (webSearch) {
    body.web_search_options = {};
  }
  const MAX_ATTEMPTS = 3;
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (json.error) {
      const isTransient = res.status >= 500 || /server (had an )?error|internal server/i.test(json.error.message || '');
      if (isTransient && attempt < MAX_ATTEMPTS) {
        await new Promise(r => setTimeout(r, 2000 * attempt));
        lastErr = new Error(`OpenAI: ${json.error.message}`);
        continue;
      }
      throw new Error(`OpenAI: ${json.error.message}`);
    }
    const text = json.choices?.[0]?.message?.content || '';
    const citations = (json.choices?.[0]?.message?.annotations || [])
      .filter(a => a.url_citation).map(a => a.url_citation.url);
    return { text, citations, raw: json };
  }
  throw lastErr;
}
