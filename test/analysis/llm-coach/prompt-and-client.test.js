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
