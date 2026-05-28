const test = require('node:test');
const assert = require('node:assert/strict');

const { buildGrowthReportPrompt } = require('../../../backend/analysis/llm-coach/prompt-builder');
const { createLlmClient } = require('../../../backend/analysis/llm-coach/llm-client');

test('buildGrowthReportPrompt includes feature and schema', () => {
  const prompt = buildGrowthReportPrompt({ feature: { feature_version: 'htf_v1' }, metricGuide: { exercise: 'squat' } });
  assert.match(prompt.systemPrompt, /운동 히스토리 분석 코치/);
  assert.match(prompt.userPrompt, /htf_v1/);
  assert.match(prompt.userPrompt, /출력 schema/);
});

test('buildGrowthReportPrompt substitutes all placeholders', () => {
  const prompt = buildGrowthReportPrompt({ feature: { test: true }, metricGuide: { exercise: 'plank' } });
  assert.ok(!prompt.userPrompt.includes('{{history_trend_feature_json}}'));
  assert.ok(!prompt.userPrompt.includes('{{metric_guide_json}}'));
  assert.ok(!prompt.userPrompt.includes('{{output_schema_json}}'));
  assert.match(prompt.userPrompt, /"test": true/);
  assert.match(prompt.userPrompt, /"exercise": "plank"/);
});

test('buildGrowthReportPrompt does not send internal user id to provider', () => {
  const prompt = buildGrowthReportPrompt({
    feature: { user_scope: { user_id: 'internal-user-id', exercise_key: 'squat' }, overall: {} },
    metricGuide: { exercise: 'squat', metrics: {} },
  });

  assert.ok(!prompt.userPrompt.includes('internal-user-id'));
  assert.ok(!prompt.userPrompt.includes('"user_id"'));
});

test('buildGrowthReportPrompt asks for detailed Korean narrative fields', () => {
  const prompt = buildGrowthReportPrompt({
    feature: { user_scope: { exercise_key: 'squat' }, overall: {} },
    metricGuide: { exercise: 'squat', metrics: {} },
  });

  assert.match(prompt.systemPrompt, /summary는 2~3문장/);
  assert.match(prompt.systemPrompt, /next_mission.action/);
  assert.match(prompt.systemPrompt, /coach_comment/);
});

test('buildGrowthReportPrompt tells LLM to preserve feature weak points and corrective mission', () => {
  const prompt = buildGrowthReportPrompt({
    feature: {
      weak_points: [{ metric_key: 'knee_alignment', metric_name: '무릎 정렬' }],
      next_focus_candidates: [{ metric_key: 'knee_alignment', metric_name: '무릎 정렬' }],
    },
    metricGuide: { exercise: 'squat', metrics: {} },
  });

  assert.match(prompt.systemPrompt, /feature\.weak_points/);
  assert.match(prompt.systemPrompt, /비워두지 마라/);
  assert.match(prompt.systemPrompt, /general_maintenance/);
  assert.match(prompt.systemPrompt, /템플릿/);
});

test('createLlmClient parses JSON response content', async () => {
  const fakeFetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: '{"summary":"ok","improvements":[],"weak_points":[],"next_mission":{"title":"t","action":"a","reason":"r","metric_key":"m"},"data_quality_note":{"label":"medium","message":"m"},"coach_comment":"c"}' } }],
      model: 'test-model',
    }),
  });
  const client = createLlmClient({ fetchImpl: fakeFetch, apiKey: 'key' });
  const result = await client.generateJson({ systemPrompt: 's', userPrompt: 'u' });
  assert.equal(result.output.summary, 'ok');
  assert.equal(result.model, 'test-model');
});

test('createLlmClient parses JSON wrapped in a markdown code fence', async () => {
  const fakeFetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [{
        message: {
          content: '```json\n{"summary":"ok","improvements":[],"weak_points":[],"next_mission":{"title":"t","action":"a","reason":"r","metric_key":"m"},"data_quality_note":{"label":"medium","message":"m"},"coach_comment":"c"}\n```',
        },
      }],
      model: 'test-model',
    }),
  });
  const client = createLlmClient({ fetchImpl: fakeFetch, apiKey: 'key' });
  const result = await client.generateJson({ systemPrompt: 's', userPrompt: 'u' });
  assert.equal(result.output.summary, 'ok');
});

test('createLlmClient uses AI report specific OpenAI-compatible base URL and model', async () => {
  let requestedUrl = null;
  let requestBody = null;
  let authHeader = null;
  const fakeFetch = async (url, options) => {
    requestedUrl = url;
    requestBody = JSON.parse(options.body);
    authHeader = options.headers.Authorization;
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"summary":"ok","improvements":[],"weak_points":[],"next_mission":{"title":"t","action":"a","reason":"r","metric_key":"m"},"data_quality_note":{"label":"medium","message":"m"},"coach_comment":"c"}' } }],
        model: 'crof-test-model',
      }),
    };
  };

  const client = createLlmClient({
    fetchImpl: fakeFetch,
    apiKey: 'crof-key',
    model: 'crof-report-model',
    baseUrl: 'https://crof.ai/v1/',
  });
  const result = await client.generateJson({ systemPrompt: 's', userPrompt: 'u' });

  assert.equal(requestedUrl, 'https://crof.ai/v1/chat/completions');
  assert.equal(authHeader, 'Bearer crof-key');
  assert.equal(requestBody.model, 'crof-report-model');
  assert.equal(result.model, 'crof-test-model');
});

test('createLlmClient does not send OpenRouter key to a custom AI report base URL', async () => {
  const originalOpenRouterKey = process.env.OPENROUTER_API_KEY;
  const originalAiReportKey = process.env.AI_REPORT_LLM_API_KEY;
  const originalCrofKey = process.env.CROF_API_KEY;
  const originalBaseUrl = process.env.AI_REPORT_LLM_BASE_URL;
  let fetchCalled = false;

  process.env.OPENROUTER_API_KEY = 'openrouter-key';
  process.env.AI_REPORT_LLM_BASE_URL = 'https://crof.ai/v1';
  delete process.env.AI_REPORT_LLM_API_KEY;
  delete process.env.CROF_API_KEY;

  try {
    const client = createLlmClient({
      fetchImpl: async () => {
        fetchCalled = true;
        return { ok: true, json: async () => ({}) };
      },
    });
    await assert.rejects(() => client.generateJson({ systemPrompt: 's', userPrompt: 'u' }), /AI_REPORT_LLM_API_KEY/);
  } finally {
    restoreEnv('OPENROUTER_API_KEY', originalOpenRouterKey);
    restoreEnv('AI_REPORT_LLM_API_KEY', originalAiReportKey);
    restoreEnv('CROF_API_KEY', originalCrofKey);
    restoreEnv('AI_REPORT_LLM_BASE_URL', originalBaseUrl);
  }

  assert.equal(fetchCalled, false);
});

test('createLlmClient throws when API key missing', async () => {
  const client = createLlmClient({ fetchImpl: async () => {}, apiKey: '' });
  await assert.rejects(() => client.generateJson({ systemPrompt: 's', userPrompt: 'u' }), /OPENROUTER_API_KEY/);
});

test('createLlmClient throws when response not ok', async () => {
  const fakeFetch = async () => ({ ok: false, status: 500 });
  const client = createLlmClient({ fetchImpl: fakeFetch, apiKey: 'key' });
  await assert.rejects(() => client.generateJson({ systemPrompt: 's', userPrompt: 'u' }), /500/);
});

test('createLlmClient throws when response content missing', async () => {
  const fakeFetch = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: null } }] }),
  });
  const client = createLlmClient({ fetchImpl: fakeFetch, apiKey: 'key' });
  await assert.rejects(() => client.generateJson({ systemPrompt: 's', userPrompt: 'u' }), /content missing/);
});

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
