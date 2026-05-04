const test = require('node:test');
const assert = require('node:assert/strict');

const { createAiGrowthReportService } = require('../../../backend/analysis/service/ai-growth-report.service');

function createFakeHistoryRepo(sessions, metrics = [], events = []) {
  return { getRecentHistory: async () => ({ sessions, metrics, events }) };
}

function createFakeLlmClient(output) {
  return {
    generateJson: async () => ({ output, model: 'test-model' }),
  };
}

test('getCoachReport returns fallback for insufficient history', async () => {
  const service = createAiGrowthReportService({
    historyRepo: createFakeHistoryRepo([]),
  });

  const response = await service.getCoachReport({ userId: 'u1', period: 'recent_5', exercise: 'squat' });
  assert.equal(response.status, 'completed');
  assert.equal(response.source, 'generated');
  assert.equal(response.isFallback, true);
  assert.equal(response.fallbackReason, 'INSUFFICIENT_HISTORY');
});

test('getCoachReport returns LLM result when history sufficient and LLM succeeds', async () => {
  const llmOutput = {
    summary: '좋아지고 있습니다',
    improvements: [],
    weak_points: [],
    next_mission: { title: 't', action: 'a', reason: 'r', metric_key: 'depth' },
    data_quality_note: { label: 'high', message: 'm' },
    coach_comment: 'c',
  };
  const service = createAiGrowthReportService({
    historyRepo: createFakeHistoryRepo(
      [
        { session_id: 's1', final_score: 55, status: 'done', ended_at: '2026-01-01T00:00:00Z', exercise_key: 'squat', exercise_name: '스쿼트' },
        { session_id: 's2', final_score: 67, status: 'done', ended_at: '2026-01-02T00:00:00Z', exercise_key: 'squat', exercise_name: '스쿼트' },
      ],
      [{ session_id: 's1', metric_key: 'depth', metric_name: '스쿼트 깊이', avg_score: 55, sample_count: 10 }, { session_id: 's2', metric_key: 'depth', metric_name: '스쿼트 깊이', avg_score: 67, sample_count: 10 }],
    ),
    llmClient: createFakeLlmClient(llmOutput),
  });

  const response = await service.getCoachReport({ userId: 'u1', period: 'recent_5', exercise: 'squat' });
  assert.equal(response.status, 'completed');
  assert.equal(response.source, 'generated');
  assert.equal(response.isFallback, false);
  assert.equal(response.result.summary, '좋아지고 있습니다');
});

test('getCoachReport falls back when LLM throws', async () => {
  const service = createAiGrowthReportService({
    historyRepo: createFakeHistoryRepo(
      [
        { session_id: 's1', final_score: 55, status: 'done', ended_at: '2026-01-01T00:00:00Z', exercise_key: 'squat', exercise_name: '스쿼트' },
        { session_id: 's2', final_score: 67, status: 'done', ended_at: '2026-01-02T00:00:00Z', exercise_key: 'squat', exercise_name: '스쿼트' },
      ],
      [{ session_id: 's1', metric_key: 'depth', metric_name: '스쿼트 깊이', avg_score: 55, sample_count: 10 }, { session_id: 's2', metric_key: 'depth', metric_name: '스쿼트 깊이', avg_score: 67, sample_count: 10 }],
    ),
    llmClient: { generateJson: async () => { throw new Error('API timeout'); } },
  });

  const response = await service.getCoachReport({ userId: 'u1', period: 'recent_5', exercise: 'squat' });
  assert.equal(response.isFallback, true);
  assert.equal(response.fallbackReason, 'PROVIDER_ERROR');
});

test('getCoachReport falls back when LLM output is schema-invalid', async () => {
  const service = createAiGrowthReportService({
    historyRepo: createFakeHistoryRepo(
      [
        { session_id: 's1', final_score: 55, status: 'done', ended_at: '2026-01-01T00:00:00Z', exercise_key: 'squat', exercise_name: '스쿼트' },
        { session_id: 's2', final_score: 67, status: 'done', ended_at: '2026-01-02T00:00:00Z', exercise_key: 'squat', exercise_name: '스쿼트' },
      ],
      [{ session_id: 's1', metric_key: 'depth', metric_name: '스쿼트 깊이', avg_score: 55, sample_count: 10 }, { session_id: 's2', metric_key: 'depth', metric_name: '스쿼트 깊이', avg_score: 67, sample_count: 10 }],
    ),
    llmClient: { generateJson: async () => ({ output: { summary: 'x' }, model: 'test-model' }) },
  });

  const response = await service.getCoachReport({ userId: 'u1', period: 'recent_5', exercise: 'squat' });
  assert.equal(response.isFallback, true);
  assert.equal(response.fallbackReason, 'SCHEMA_INVALID');
});

test('getCoachReport returns response with createdAt timestamp', async () => {
  const service = createAiGrowthReportService({
    historyRepo: createFakeHistoryRepo([]),
  });

  const response = await service.getCoachReport({ userId: 'u1' });
  assert.ok(response.createdAt);
  assert.ok(new Date(response.createdAt).getTime() > 0);
});
