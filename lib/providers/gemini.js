/**
 * Call Google Gemini generateContent API.
 *
 * @param {object} [options]
 * @param {boolean} [options.webSearch=true]
 *   When true, attaches `google_search` grounding tool.
 *   When false, omits the tool — use for analysis tasks (e.g. init auto-suggest).
 */
export async function callGemini(query, apiKey, model, options = {}) {
  const webSearch = options.webSearch !== false;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const body = { contents: [{ parts: [{ text: query }] }] };
  if (webSearch) body.tools = [{ google_search: {} }];

  const MAX_ATTEMPTS = 3;
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();

    if (json.error) {
      const isRateLimit = res.status === 429 || /resource exhausted|quota/i.test(json.error.message || '');
      if (isRateLimit && attempt < MAX_ATTEMPTS) {
        await new Promise(r => setTimeout(r, 2000 * attempt)); // 2s, 4s
        lastErr = new Error(`Gemini: ${json.error.message}`);
        continue;
      }
      throw new Error(`Gemini: ${json.error.message}`);
    }

    const text = (json.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('\n');
    const citations = (json.candidates?.[0]?.groundingMetadata?.groundingChunks || [])
      .map(ch => resolveGeminiCitation(ch.web))
      .filter(Boolean);
    return { text, citations, raw: json };
  }
  throw lastErr;
}

// Gemini's groundingChunks[*].web.uri is a Vertex AI redirect token, not a resolvable URL.
// The `title` field contains the real domain (e.g. "example.com"). Fall back to that when the uri is a redirect.
function resolveGeminiCitation(web) {
  if (!web) return null;
  const uri = web.uri;
  const title = web.title;
  if (!uri) return null;
  const isVertexRedirect = /^https?:\/\/vertexaisearch\.cloud\.google\.com\/grounding-api-redirect\//.test(uri);
  if (isVertexRedirect) {
    if (title && /^[\w-]+(?:\.[\w-]+)+(?:\/|$)/.test(title)) {
      return title.startsWith('http') ? title : `https://${title}`;
    }
    return null; // drop unreadable redirect if title is unusable
  }
  return uri;
}
