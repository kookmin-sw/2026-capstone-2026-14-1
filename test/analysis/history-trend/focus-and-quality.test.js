const test = require('node:test');
const assert = require('node:assert/strict');

const { buildDataQuality } = require('../../../backend/analysis/history-trend/data-quality-builder');
const { buildNextFocusCandidates } = require('../../../backend/analysis/history-trend/next-focus-builder');

test('buildDataQuality counts camera and low sample issues', () => {
  const result = buildDataQuality({
    events: [
      { type: 'NO_PERSON' },
      { type: 'CAMERA_STALE' },
      { type: 'LOW_SCORE_HINT' },
    ],
    trends: [{ recent_sample_count: 4 }, { recent_sample_count: 40 }],
  });

  assert.equal(result.camera_issue_count, 2);
  assert.equal(result.no_person_count, 1);
  assert.equal(result.low_sample_sessions, 1);
  assert.equal(result.confidence_label, 'medium');
});

test('buildNextFocusCandidates prioritizes weak metric with guide cues', () => {
  const candidates = buildNextFocusCandidates({
    weakPoints: [{ metric_key: 'knee_alignment', metric_name: '무릎 정렬', recent_avg: 55, confidence: 0.68, occurrence_count: 4 }],
    regressions: [],
    metricGuide: {
      metrics: {
        knee_alignment: {
          safety_priority: 0.9,
          actionability: 0.9,
          coaching_cues: ['무릎과 발끝 방향을 맞추세요'],
        },
      },
    },
  });

  assert.equal(candidates[0].metric_key, 'knee_alignment');
  assert.equal(candidates[0].priority, 1);
  assert.deepEqual(candidates[0].recommended_cues, ['무릎과 발끝 방향을 맞추세요']);
});

test('buildNextFocusCandidates treats zero recent average as maximal weakness', () => {
  const candidates = buildNextFocusCandidates({
    weakPoints: [
      { metric_key: 'critical_depth', metric_name: '깊이', recent_avg: 0, confidence: 0.7, occurrence_count: 4 },
      { metric_key: 'minor_alignment', metric_name: '정렬', recent_avg: 60, confidence: 0.7, occurrence_count: 4 },
    ],
    regressions: [],
    metricGuide: {
      metrics: {
        critical_depth: { safety_priority: 0.5, actionability: 0.5 },
        minor_alignment: { safety_priority: 0.5, actionability: 0.5 },
      },
    },
  });

  assert.equal(candidates[0].metric_key, 'critical_depth');
  assert.equal(candidates[0].priority, 1);
  assert.equal(candidates[1].metric_key, 'minor_alignment');
});
