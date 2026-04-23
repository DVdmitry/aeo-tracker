/**
 * Dynamic model discovery — queries each provider's models API and returns
 * the single best current search-capable model per provider.
 *
 * Strategy per provider:
 *   openai      — latest stable search model (undated ID, no alpha/snapshots)
 *   anthropic   — latest claude-sonnet (opus is too expensive for weekly tracking)
 *   gemini      — latest pro > flash (prefer quality; both are cheap)
 *   perplexity  — sonar-pro (flagship search model)
 *
 * Returns null on any failure so cmdRun falls back to the config model.
 */

// ─── OpenAI ───────────────────────────────────────────────────────────────────
async function fetchOpenAIModels(apiKey, baseURL = 'https://api.openai.com') {
  const res = await fetch(`${baseURL}/v1/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  const { data } = await res.json();
  const model = (data || [])
    .filter(m =>
      m.id.includes('search') &&
      !m.id.includes('audio') &&
      !m.id.includes('realtime'),
    )
    .sort((a, b) => {
      // prefer higher generation (gpt-5 > gpt-4)
      const gen = id => id.startsWith('gpt-5') ? 5 : id.startsWith('gpt-4') ? 4 : 0;
      const gDiff = gen(b.id) - gen(a.id);
      if (gDiff !== 0) return gDiff;
      // within same generation prefer undated stable pointer over dated snapshots
      const dated = id => (/-\d{4}-\d{2}-\d{2}$/.test(id) ? 1 : 0);
      return dated(a.id) - dated(b.id);
    })
    [0];
  return model ? [model.id] : null;
}

// ─── Anthropic ────────────────────────────────────────────────────────────────
async function fetchAnthropicModels(apiKey) {
  const res = await fetch('https://api.anthropic.com/v1/models', {
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  const { data } = await res.json();
  // Only sonnet — opus is 5-10x more expensive with similar AEO detection quality
  const model = (data || [])
    .filter(m =>
      /claude.*sonnet/.test(m.id) &&
      !/\d{8}$/.test(m.id) &&
      !/-\d{4}-\d{2}-\d{2}$/.test(m.id),
    )
    .sort((a, b) => (b.created_at > a.created_at ? 1 : -1))
    [0];
  return model ? [model.id] : null;
}

// ─── Gemini ───────────────────────────────────────────────────────────────────
async function fetchGeminiModels(apiKey) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
  );
  if (!res.ok) throw new Error(`${res.status}`);
  const { models } = await res.json();
  const candidates = (models || [])
    .filter(m => {
      const id = m.name.replace('models/', '');
      return (
        m.supportedGenerationMethods?.includes('generateContent') &&
        /^gemini-2/.test(id) &&
        !id.includes('embedding') &&
        !id.includes('lite') &&
        !id.includes('aqa') &&
        !id.includes('thinking') &&
        !id.includes('exp')
      );
    })
    .map(m => m.name.replace('models/', ''))
    // prefer latest version > pro > flash
    .sort((a, b) => {
      const ver  = id => parseFloat(id.match(/gemini-(\d+\.\d+)/)?.[1] || '0');
      const tier = id => id.includes('pro') ? 1 : 0;
      const vDiff = ver(b) - ver(a);
      return vDiff !== 0 ? vDiff : tier(b) - tier(a);
    });
  return candidates.length > 0 ? [candidates[0]] : null;
}

// ─── Perplexity ───────────────────────────────────────────────────────────────
async function fetchPerplexityModels(apiKey) {
  try {
    const res = await fetch('https://api.perplexity.ai/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.ok) {
      const json = await res.json();
      const ids = (json.data || json.models || []).map(m => m.id || m).filter(Boolean);
      const pro = ids.find(id => id === 'sonar-pro') || ids.find(id => /sonar/.test(id));
      if (pro) return [pro];
    }
  } catch { /* fall through */ }
  return ['sonar-pro'];
}

// ─── Registry ─────────────────────────────────────────────────────────────────
const FETCHERS = {
  openai:     fetchOpenAIModels,
  anthropic:  fetchAnthropicModels,
  gemini:     fetchGeminiModels,
  perplexity: fetchPerplexityModels,
};

/**
 * Returns the single best current model ID for the given provider.
 * Returns null on failure; caller falls back to the config model.
 */
export async function discoverModels(provider, apiKey, baseURL) {
  const fn = FETCHERS[provider];
  if (!fn) return null;
  try {
    const models = await fn(apiKey, baseURL);
    return Array.isArray(models) && models.length > 0 ? models : null;
  } catch {
    return null;
  }
}
