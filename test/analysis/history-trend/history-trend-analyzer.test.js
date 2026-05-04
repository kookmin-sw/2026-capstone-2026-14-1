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
