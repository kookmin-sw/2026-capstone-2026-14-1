const test = require('node:test');
const assert = require('node:assert/strict');

const dbModulePath = require.resolve('../config/db');
require.cache[dbModulePath] = {
  id: dbModulePath,
  filename: dbModulePath,
  loaded: true,
  exports: { supabase: {} }
};

const historyController = require('../controllers/history');

test('buildMetricSeries groups interim and final metrics by metric key', () => {
  assert.equal(typeof historyController.__test?.buildMetricSeries, 'function');

  const series = historyController.__test.buildMetricSeries({
    startedAt: '2026-04-16T10:00:00.000Z',
    snapshots: [
      { session_snapshot_id: 11, snapshot_no: 1, snapshot_type: 'INTERIM', recorded_at: '2026-04-16T10:00:05.000Z' },
      { session_snapshot_id: 12, snapshot_no: 2, snapshot_type: 'FINAL', recorded_at: '2026-04-16T10:00:09.000Z' }
    ],
    metricRows: [
      { session_snapshot_id: 11, metric_key: 'depth', metric_name: '깊이', avg_score: 42, avg_raw_value: 41, sample_count: 3 },
      { session_snapshot_id: 12, metric_key: 'depth', metric_name: '깊이', avg_score: 75, avg_raw_value: 48, sample_count: 6 }
    ]
  });

  assert.deepEqual(series, [
    {
      metric_key: 'depth',
      metric_name: '깊이',
      points: [
        {
          snapshot_no: 1,
          snapshot_type: 'INTERIM',
          recorded_at: '2026-04-16T10:00:05.000Z',
          t_sec: 5,
          avg_score: 42,
          avg_raw_value: 41,
          min_raw_value: null,
          max_raw_value: null,
          sample_count: 3
        },
        {
          snapshot_no: 2,
          snapshot_type: 'FINAL',
          recorded_at: '2026-04-16T10:00:09.000Z',
          t_sec: 9,
          avg_score: 75,
          avg_raw_value: 48,
          min_raw_value: null,
          max_raw_value: null,
          sample_count: 6
        }
      ]
    }
  ]);
});

test('buildMetricSeries returns empty array when no metric rows exist', () => {
  assert.equal(typeof historyController.__test?.buildMetricSeries, 'function');

  const series = historyController.__test.buildMetricSeries({
    startedAt: '2026-04-16T10:00:00.000Z',
    snapshots: [
      { session_snapshot_id: 11, snapshot_no: 1, snapshot_type: 'INTERIM', recorded_at: '2026-04-16T10:00:05.000Z' }
    ],
    metricRows: []
  });

  assert.deepEqual(series, []);
});

test('buildAccuracyFocus explains why final score can be lower than strong metrics', () => {
  assert.equal(typeof historyController.__test?.buildAccuracyFocus, 'function');

  const focus = historyController.__test.buildAccuracyFocus({
    session: {
      final_score: 58,
      summary_feedback: '자세 교정이 필요합니다. 5회 완료!'
    },
    metrics: [
      { metric_key: 'knee_symmetry', metric_name: '무릎 균형', avg_score: 92, sample_count: 12 },
      { metric_key: 'depth', metric_name: '스쿼트 깊이', avg_score: 44, sample_count: 10 },
      { metric_key: 'trunk_stability', metric_name: '상체 안정성', avg_score: 84, sample_count: 9 }
    ],
    metricSeries: []
  });

  assert.equal(focus.score_explanation.headline, '스쿼트 깊이가 최종 점수를 낮춘 핵심 요인입니다.');
  assert.match(focus.score_explanation.reason, /강점 항목만 보면 높아 보일 수 있지만/);
  assert.match(focus.score_explanation.reason, /스쿼트 깊이/);
  assert.match(focus.score_explanation.note, /필수 동작 조건/);
  assert.equal(focus.score_explanation.metric_name, '스쿼트 깊이');
});

test('buildAccuracyFocus uses natural Korean subject particles in score explanation', () => {
  const focus = historyController.__test.buildAccuracyFocus({
    session: { final_score: 81 },
    metrics: [
      { metric_key: 'knee_valgus', metric_name: '무릎 안쪽 무너짐', avg_score: 100, sample_count: 10 },
      { metric_key: 'trunk_stability', metric_name: '상체 안정성', avg_score: 87.4, sample_count: 10 }
    ],
    metricSeries: []
  });

  assert.equal(focus.score_explanation.headline, '상체 안정성이 최종 점수를 낮춘 핵심 요인입니다.');
});
