const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

function createLlmClient({ fetchImpl = fetch, apiKey = process.env.OPENROUTER_API_KEY, model = process.env.OPENROUTER_LLM_MODEL || 'openai/gpt-4o-mini' } = {}) {
  async function generateJson({ systemPrompt, userPrompt, timeoutMs = 12000 } = {}) {
    if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const response = await fetchImpl(`${OPENROUTER_BASE}/chat/completions`, {
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
      return { output: JSON.parse(content), model: data.model || model };
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
  return { generateJson };
}

module.exports = { createLlmClient };
