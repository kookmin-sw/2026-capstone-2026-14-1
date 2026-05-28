const test = require('node:test');
const assert = require('node:assert/strict');

const { analyzeHistoryTrend } = require('../../../backend/analysis/history-trend/history-trend-analyzer');

test('analyzeHistoryTrend builds feature JSON with overall, trends, and focus', () => {
  const feature = analyzeHistoryTrend({
    userId: 'u1',
    period: 'recent_5',
    exerciseKey: 'squat',
    exerciseName: '스쿼트',
    sessions: [
      { session_id: 's1', final_score: 55, status: 'done', ended_at: '2026-01-01T00:00:00Z' },
      { session_id: 's2', final_score: 67, status: 'done', ended_at: '2026-01-02T00:00:00Z' },
    ],
    metrics: [
      { session_id: 's1', metric_key: 'depth', metric_name: '스쿼트 깊이', avg_score: 48, sample_count: 10 },
      { session_id: 's2', metric_key: 'depth', metric_name: '스쿼트 깊이', avg_score: 66, sample_count: 10 },
    ],
    events: [],
  });

  assert.equal(feature.feature_version, 'htf_v1');
  assert.equal(feature.user_scope.user_id, 'u1');
  assert.equal(feature.overall.completed_sessions, 2);
  assert.ok(Array.isArray(feature.improvements));
  assert.ok(Array.isArray(feature.next_focus_candidates));
});

test('analyzeHistoryTrend scopes completed/aborted counts and events to recent sessions', () => {
  const feature = analyzeHistoryTrend({
    userId: 'u1',
    period: 'recent_5',
    exerciseKey: 'squat',
    exerciseName: '스쿼트',
    sessions: [
      { session_id: 's1', final_score: 40, status: 'aborted', ended_at: '2026-01-01T00:00:00Z' },
      { session_id: 's2', final_score: 55, status: 'done', ended_at: '2026-01-02T00:00:00Z' },
      { session_id: 's3', final_score: 60, status: 'done', ended_at: '2026-01-03T00:00:00Z' },
      { session_id: 's4', final_score: 65, status: 'done', ended_at: '2026-01-04T00:00:00Z' },
      { session_id: 's5', final_score: 70, status: 'done', ended_at: '2026-01-05T00:00:00Z' },
      { session_id: 's6', final_score: 75, status: 'done', ended_at: '2026-01-06T00:00:00Z' },
    ],
    metrics: [
      { session_id: 's2', metric_key: 'depth', metric_name: '스쿼트 깊이', avg_score: 55, sample_count: 10 },
      { session_id: 's3', metric_key: 'depth', metric_name: '스쿼트 깊이', avg_score: 60, sample_count: 10 },
      { session_id: 's4', metric_key: 'depth', metric_name: '스쿼트 깊이', avg_score: 65, sample_count: 10 },
      { session_id: 's5', metric_key: 'depth', metric_name: '스쿼트 깊이', avg_score: 70, sample_count: 10 },
      { session_id: 's6', metric_key: 'depth', metric_name: '스쿼트 깊이', avg_score: 75, sample_count: 10 },
    ],
    events: [
      { session_id: 's1', type: 'NO_PERSON' },
    ],
  });

  assert.equal(feature.overall.aborted_sessions, 0);
  assert.equal(feature.overall.completed_sessions, 5);
  assert.equal(feature.data_quality.camera_issue_count, 0);
});

test('analyzeHistoryTrend does not mark stable completed sessions low quality only because metrics are absent', () => {
  const sessions = Array.from({ length: 5 }, (_, index) => ({
    session_id: `s${index + 1}`,
    final_score: 92,
    status: 'done',
    ended_at: `2026-01-0${index + 1}T00:00:00Z`,
  }));

  const feature = analyzeHistoryTrend({
    userId: 'u1',
    period: 'recent_5',
    exerciseKey: 'squat',
    exerciseName: 'squat',
    sessions,
    metrics: [],
    events: [],
  });

  assert.equal(feature.is_doing_well, true);
  assert.equal(feature.overall.completed_sessions, 5);
  assert.notEqual(feature.data_quality.confidence_label, 'low');
  assert.match(feature.data_quality.note, /session|세션|점수/i);
});

test('analyzeHistoryTrend uses all supplied sessions for date range periods', () => {
  const sessions = Array.from({ length: 8 }, (_, index) => ({
    session_id: `s${index + 1}`,
    final_score: 80 + index,
    status: 'done',
    ended_at: `2026-04-${String(index + 1).padStart(2, '0')}T00:00:00Z`,
  }));

  const feature = analyzeHistoryTrend({
    userId: 'u1',
    period: 'last_30_days',
    exerciseKey: 'squat',
    exerciseName: 'squat',
    sessions,
    metrics: [],
    events: [],
  });

  assert.equal(feature.user_scope.period_type, 'date_range');
  assert.equal(feature.user_scope.period_label, '최근 30일');
  assert.equal(feature.user_scope.session_count, 8);
  assert.equal(feature.overall.completed_sessions, 8);
  assert.equal(feature.overall.recent_avg_score, 83.5);
});

test('analyzeHistoryTrend surfaces a reliable low metric even when overall score is high', () => {
  const sessions = Array.from({ length: 10 }, (_, index) => ({
    session_id: `s${index + 1}`,
    final_score: index === 0 ? 87 : 84,
    status: 'done',
    ended_at: `2026-05-${String(index + 1).padStart(2, '0')}T00:00:00Z`,
  }));

  const metrics = sessions.flatMap((session) => [
    {
      session_id: session.session_id,
      metric_key: 'knee_alignment',
      metric_name: '무릎 정렬',
      avg_score: 72,
      sample_count: 10,
    },
    {
      session_id: session.session_id,
      metric_key: 'depth',
      metric_name: '스쿼트 깊이',
      avg_score: 88,
      sample_count: 10,
    },
  ]);

  const feature = analyzeHistoryTrend({
    userId: 'u1',
    period: 'recent_10',
    exerciseKey: 'squat',
    exerciseName: '스쿼트',
    sessions,
    metrics,
    events: [],
  });

  assert.equal(feature.overall.recent_avg_score, 84.3);
  assert.equal(feature.is_doing_well, false);
  assert.equal(feature.weak_points[0].metric_key, 'knee_alignment');
  assert.match(feature.weak_points[0].evidence, /상대적으로 낮게/);
  assert.equal(feature.next_focus_candidates[0].metric_key, 'knee_alignment');
});
