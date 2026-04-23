export async function callPerplexity(query, apiKey, model) {
  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: query }],
    }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`Perplexity: ${json.error.message || json.error}`);
  const text = json.choices?.[0]?.message?.content || '';
  // Sonar returns citations as a top-level array of URLs
  const citations = Array.isArray(json.citations) ? json.citations : [];
  return { text, citations, raw: json };
}
