import { callOpenAI } from './openai.js';
import { callGemini } from './gemini.js';
import { callAnthropic } from './anthropic.js';
import { callPerplexity } from './perplexity.js';

export const PROVIDERS = {
  openai: { call: callOpenAI, label: 'ChatGPT' },
  gemini: { call: callGemini, label: 'Gemini' },
  anthropic: { call: callAnthropic, label: 'Claude' },
  perplexity: { call: callPerplexity, label: 'Perplexity' },
};
