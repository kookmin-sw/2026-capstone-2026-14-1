const test = require('node:test');
const assert = require('node:assert/strict');

const { buildMetricTrends } = require('../../../backend/analysis/history-trend/metric-trend-builder');

test('buildMetricTrends compares previous and recent windows per metric', () => {
  const sessions = [
    { session_id: 's1', ended_at: '2026-01-01T00:00:00Z' },
    { session_id: 's2', ended_at: '2026-01-02T00:00:00Z' },
    { session_id: 's3', ended_at: '2026-01-03T00:00:00Z' },
    { session_id: 's4', ended_at: '2026-01-04T00:00:00Z' },
  ];
  const metrics = [
    { session_id: 's1', metric_key: 'depth', metric_name: '스쿼트 깊이', avg_score: 40, sample_count: 10 },
    { session_id: 's2', metric_key: 'depth', metric_name: '스쿼트 깊이', avg_score: 50, sample_count: 10 },
    { session_id: 's3', metric_key: 'depth', metric_name: '스쿼트 깊이', avg_score: 65, sample_count: 10 },
    { session_id: 's4', metric_key: 'depth', metric_name: '스쿼트 깊이', avg_score: 75, sample_count: 10 },
  ];

  const trends = buildMetricTrends({ sessions, metrics, recentCount: 2 });

  assert.equal(trends.length, 1);
  assert.equal(trends[0].metric_key, 'depth');
  assert.equal(trends[0].previous_avg, 45);
  assert.equal(trends[0].recent_avg, 70);
  assert.equal(trends[0].delta, 25);
  assert.equal(trends[0].occurrence_count_below_60, 0);
});
