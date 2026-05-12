const test = require('node:test');
const assert = require('node:assert/strict');

const { createAiGrowthReportService } = require('../../../backend/analysis/service/ai-growth-report.service');

function createFakeHistoryRepo(sessions, metrics = [], events = []) {
  const repo = {
    calls: [],
    getRecentHistory: async (input) => {
      repo.calls.push(input);
      return { sessions, metrics, events };
    },
  };
  return repo;
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

test('getCoachReport supports all exercise reports when history is sufficient', async () => {
  const llmOutput = {
    summary: '전체 운동 기록 요약',
    improvements: [],
    weak_points: [],
    next_mission: { title: 't', action: 'a', reason: 'r', metric_key: 'depth' },
    data_quality_note: { label: 'high', message: 'm' },
    coach_comment: 'c',
  };
  const sessions = Array.from({ length: 5 }, (_, index) => ({
    session_id: `s${index + 1}`,
    final_score: 70 + index,
    status: 'done',
    ended_at: `2026-01-0${index + 1}T00:00:00Z`,
    exercise_key: index % 2 === 0 ? 'squat' : 'push_up',
    exercise_name: index % 2 === 0 ? '스쿼트' : '푸시업',
  }));
  const metrics = sessions.map((session) => ({
    session_id: session.session_id,
    metric_key: 'depth',
    metric_name: '동작 안정성',
    avg_score: 70,
    sample_count: 10,
  }));
  const service = createAiGrowthReportService({
    historyRepo: createFakeHistoryRepo(sessions, metrics),
    llmClient: createFakeLlmClient(llmOutput),
  });

  const response = await service.getCoachReport({ userId: 'u1', period: 'recent_5', exercise: 'all' });

  assert.equal(response.isFallback, false);
  assert.equal(response.result.summary, '전체 운동 기록 요약');
});

test('getCoachReport post-processes contradictory LLM output for doing-well reports', async () => {
  const llmOutput = {
    summary: 'recent records are stable',
    improvements: [{ title: 'stable average', evidence: 'avg 92', meaning: 'good' }],
    weak_points: [{ title: 'invented weak point', evidence: 'not in feature', meaning: 'contradiction', metric_key: 'fake_metric' }],
    next_mission: { title: 'fix fake metric', action: 'do fake cue', reason: 'because fake', metric_key: 'fake_metric' },
    data_quality_note: { label: 'low', message: 'not enough data' },
    coach_comment: 'keep going',
  };
  const sessions = Array.from({ length: 5 }, (_, index) => ({
    session_id: `s${index + 1}`,
    final_score: 92,
    status: 'done',
    ended_at: `2026-01-0${index + 1}T00:00:00Z`,
    exercise_key: 'squat',
    exercise_name: 'squat',
  }));
  const metrics = sessions.map((session) => ({
    session_id: session.session_id,
    metric_key: 'depth',
    metric_name: 'Depth',
    avg_score: 92,
    sample_count: 30,
  }));
  const service = createAiGrowthReportService({
    historyRepo: createFakeHistoryRepo(sessions, metrics),
    llmClient: createFakeLlmClient(llmOutput),
  });

  const response = await service.getCoachReport({ userId: 'u1', period: 'recent_5', exercise: 'squat' });

  assert.equal(response.isFallback, false);
  assert.deepEqual(response.result.weak_points, []);
  assert.equal(response.result.next_mission.metric_key, 'general_maintenance');
  assert.equal(response.result.data_quality_note.label, 'high');
  assert.notEqual(response.result.data_quality_note.message, 'not enough data');
});

test('getCoachReport keeps detailed positive and corrective feedback together', async () => {
  const llmOutput = {
    summary: 'stable score with heel contact weakness',
    improvements: [],
    weak_points: [{ title: '뒤꿈치 접지', evidence: '낮게 측정됨', metric_key: 'heel_contact' }],
    next_mission: { title: '뒤꿈치 접지 집중', action: '뒤꿈치를 유지하세요', reason: '낮음', metric_key: 'heel_contact' },
    data_quality_note: { label: 'medium', message: 'm' },
    coach_comment: 'c',
  };
  const sessions = Array.from({ length: 6 }, (_, index) => ({
    session_id: `s${index + 1}`,
    final_score: 89,
    status: index < 4 ? 'done' : 'aborted',
    ended_at: `2026-05-0${index + 1}T00:00:00Z`,
    exercise_key: 'squat',
    exercise_name: '스쿼트',
  }));
  const metrics = sessions.map((session, index) => ({
    session_id: session.session_id,
    metric_key: 'heel_contact',
    metric_name: '뒤꿈치 접지',
    avg_score: index < 4 ? 55 : 75,
    sample_count: 10,
  }));
  const service = createAiGrowthReportService({
    historyRepo: createFakeHistoryRepo(sessions, metrics),
    llmClient: createFakeLlmClient(llmOutput),
  });

  const response = await service.getCoachReport({ userId: 'u1', period: 'recent_10', exercise: 'squat' });

  assert.equal(response.isFallback, false);
  assert.equal(response.result.improvements.length, 1);
  assert.match(response.result.improvements[0].evidence, /평균/);
  assert.match(response.result.improvements[0].meaning, /스쿼트|운동/);
  assert.match(response.result.weak_points[0].evidence, /최근 6회 중 4회/);
  assert.match(response.result.weak_points[0].meaning, /무게 중심|안정/);
});

test('getCoachReport requests a date range history window for last_30_days', async () => {
  const llmOutput = {
    summary: 'last 30 days summary',
    improvements: [],
    weak_points: [],
    next_mission: { title: 't', action: 'a', reason: 'r', metric_key: 'general_maintenance' },
    data_quality_note: { label: 'medium', message: 'm' },
    coach_comment: 'c',
  };
  const sessions = Array.from({ length: 3 }, (_, index) => ({
    session_id: `s${index + 1}`,
    final_score: 90 + index,
    status: 'done',
    ended_at: `2026-05-0${index + 1}T00:00:00Z`,
    exercise_key: 'squat',
    exercise_name: 'squat',
  }));
  const historyRepo = createFakeHistoryRepo(sessions);
  const service = createAiGrowthReportService({
    historyRepo,
    llmClient: createFakeLlmClient(llmOutput),
    now: () => new Date('2026-05-12T00:00:00.000Z'),
  });

  const response = await service.getCoachReport({ userId: 'u1', period: 'last_30_days', exercise: 'squat' });

  assert.equal(response.period, 'last_30_days');
  assert.equal(historyRepo.calls[0].limit, 50);
  assert.equal(historyRepo.calls[0].endedAfter, '2026-04-12T00:00:00.000Z');
});

test('getCoachReport returns report metadata for client contract checks', async () => {
  const service = createAiGrowthReportService({
    historyRepo: createFakeHistoryRepo([]),
  });

  const response = await service.getCoachReport({ userId: 'u1', period: 'recent_10', exercise: 'plank' });

  assert.equal(response.reportVersion, 'growth_report.v1');
  assert.equal(response.historyFeatureVersion, 'htf_v1');
  assert.equal(response.period, 'recent_10');
  assert.equal(response.exercise, 'plank');
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
