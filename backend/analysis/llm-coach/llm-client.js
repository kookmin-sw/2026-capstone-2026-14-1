const DEFAULT_AI_REPORT_LLM_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_AI_REPORT_LLM_MODEL = 'openai/gpt-4o-mini';

function createLlmClient(options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const baseUrl = options.baseUrl ?? process.env.AI_REPORT_LLM_BASE_URL ?? process.env.CROF_BASE_URL ?? DEFAULT_AI_REPORT_LLM_BASE_URL;
  const endpointBase = normalizeBaseUrl(baseUrl);
  const apiKey = options.apiKey ?? resolveApiKey(endpointBase);
  const model = options.model ?? resolveModel(endpointBase);

  async function generateJson({ systemPrompt, userPrompt, timeoutMs = 30000 } = {}) {
    if (!apiKey) throw new Error('AI report LLM API key not set (AI_REPORT_LLM_API_KEY, CROF_API_KEY, or OPENROUTER_API_KEY for the default OpenRouter endpoint)');
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const response = await fetchImpl(`${endpointBase}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        signal: controller?.signal,
        body: JSON.stringify({
          model,
          temperature: 0.2,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
      });
      if (!response.ok) throw new Error(`LLM request failed: ${response.status}`);
      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content) throw new Error('LLM response content missing');
      return { output: parseJsonContent(content), model: data.model || model };
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
  return { generateJson };
}

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || DEFAULT_AI_REPORT_LLM_BASE_URL).replace(/\/+$/, '');
}

function resolveApiKey(endpointBase) {
  if (process.env.AI_REPORT_LLM_API_KEY) return process.env.AI_REPORT_LLM_API_KEY;
  if (process.env.CROF_API_KEY) return process.env.CROF_API_KEY;
  if (endpointBase === DEFAULT_AI_REPORT_LLM_BASE_URL) return process.env.OPENROUTER_API_KEY;
  return '';
}

function resolveModel(endpointBase) {
  if (process.env.AI_REPORT_LLM_MODEL) return process.env.AI_REPORT_LLM_MODEL;
  if (process.env.CROF_LLM_MODEL) return process.env.CROF_LLM_MODEL;
  if (endpointBase === DEFAULT_AI_REPORT_LLM_BASE_URL && process.env.OPENROUTER_LLM_MODEL) {
    return process.env.OPENROUTER_LLM_MODEL;
  }
  return DEFAULT_AI_REPORT_LLM_MODEL;
}

function parseJsonContent(content) {
  const trimmed = String(content || '').trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) return JSON.parse(fenced[1].trim());

  try {
    return JSON.parse(trimmed);
  } catch (error) {
    const extracted = extractFirstJsonObject(trimmed);
    if (!extracted) throw error;
    return JSON.parse(extracted);
  }
}

function extractFirstJsonObject(content) {
  const start = content.search(/[\[{]/);
  if (start < 0) return null;

  const opening = content[start];
  const closing = opening === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < content.length; index += 1) {
    const char = content[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === opening) depth += 1;
    if (char === closing) depth -= 1;
    if (depth === 0) return content.slice(start, index + 1);
  }

  return null;
}

module.exports = { createLlmClient };
