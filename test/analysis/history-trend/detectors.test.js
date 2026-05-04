const test = require('node:test');
const assert = require('node:assert/strict');

const { detectImprovements } = require('../../../backend/analysis/history-trend/improvement-detector');
const { detectWeakPoints } = require('../../../backend/analysis/history-trend/weakness-detector');
const { detectRegressions } = require('../../../backend/analysis/history-trend/regression-detector');

const trends = [
  { metric_key: 'depth', metric_name: '스쿼트 깊이', previous_avg: 48, recent_avg: 66, delta: 18, confidence: 0.72, recent_sample_count: 50, occurrence_count_below_60: 1, recent_session_count: 5 },
  { metric_key: 'knee_alignment', metric_name: '무릎 정렬', previous_avg: 58, recent_avg: 55, delta: -3, confidence: 0.68, recent_sample_count: 48, occurrence_count_below_60: 4, recent_session_count: 5 },
  { metric_key: 'spine_angle', metric_name: '상체 각도', previous_avg: 72, recent_avg: 61, delta: -11, confidence: 0.61, recent_sample_count: 40, occurrence_count_below_60: 2, recent_session_count: 5 },
];

test('detectImprovements selects metrics with meaningful positive delta', () => {
  const result = detectImprovements(trends);
  assert.equal(result.length, 1);
  assert.equal(result[0].metric_key, 'depth');
  assert.match(result[0].evidence, /48점에서 66점/);
});

test('detectWeakPoints selects recurring low metrics', () => {
  const result = detectWeakPoints(trends);
  assert.equal(result[0].metric_key, 'knee_alignment');
  assert.equal(result[0].occurrence_count, 4);
});

test('detectRegressions selects meaningful negative delta', () => {
  const result = detectRegressions(trends);
  assert.equal(result[0].metric_key, 'spine_angle');
  assert.match(result[0].evidence, /11점 하락/);
});

test('detectRegressions rounds absolute drop amounts', () => {
  const result = detectRegressions([
    { metric_key: 'tempo', metric_name: '템포', previous_avg: 70, recent_avg: 61.5, delta: -8.5, confidence: 0.7 },
  ]);

  assert.match(result[0].evidence, /9점 하락/);
});
