const test = require('node:test');
const assert = require('node:assert/strict');

const { generateFallbackGrowthReport } = require('../../../backend/analysis/llm-coach/fallback-growth-report-generator');
const { validateGrowthReportOutput } = require('../../../backend/analysis/llm-coach/output-validator');

test('generateFallbackGrowthReport creates schema-valid report from feature', () => {
  const report = generateFallbackGrowthReport({
    feature: {
      improvements: [{ metric_key: 'depth', metric_name: '스쿼트 깊이', evidence: '48점에서 66점으로 상승' }],
      weak_points: [{ metric_key: 'knee_alignment', metric_name: '무릎 정렬', evidence: '최근 5회 중 4회 낮음' }],
      next_focus_candidates: [{ metric_key: 'knee_alignment', metric_name: '무릎 정렬', recommended_cues: ['무릎과 발끝 방향을 맞추세요'], reason: '반복 약점' }],
      data_quality: { confidence_label: 'medium', note: '일부 카메라 이슈가 있었습니다.' },
      overall: { trend: 'improving' },
    },
  });

  assert.match(report.summary, /좋아지고/);
  assert.equal(report.improvements.length, 1);
  assert.equal(report.weak_points.length, 1);
  assert.equal(report.next_mission.metric_key, 'knee_alignment');
  assert.equal(report.data_quality_note.label, 'medium');

  const validation = validateGrowthReportOutput(report);
  assert.equal(validation.valid, true, `Validation errors: ${JSON.stringify(validation.errors)}`);
});

test('generateFallbackGrowthReport handles empty feature gracefully', () => {
  const report = generateFallbackGrowthReport({ feature: {} });

  assert.equal(report.improvements.length, 0);
  assert.equal(report.weak_points.length, 0);
  assert.equal(report.next_mission.metric_key, 'general_focus');
  assert.equal(report.data_quality_note.label, 'low');

  const validation = validateGrowthReportOutput(report);
  assert.equal(validation.valid, true, `Validation errors: ${JSON.stringify(validation.errors)}`);
});

test('generateFallbackGrowthReport includes reason message when LLM fallback reason given', () => {
  const report = generateFallbackGrowthReport({ feature: { overall: { trend: 'stable' } }, reason: 'LLM timeout' });

  assert.match(report.summary, /다음 집중 포인트/);
  assert.match(report.coach_comment, /기록 기반 기본 리포트/);
});

test('generateFallbackGrowthReport uses first cue as mission action', () => {
  const report = generateFallbackGrowthReport({
    feature: {
      next_focus_candidates: [{ metric_key: 'depth', metric_name: '스쿼트 깊이', recommended_cues: ['엉덩이를 뒤로 빼며 천천히 내려가세요'], reason: '반복' }],
    },
  });

  assert.equal(report.next_mission.metric_key, 'depth');
  assert.match(report.next_mission.action, /엉덩이/);
});

test('generateFallbackGrowthReport keeps enough detail for fallback reports', () => {
  const report = generateFallbackGrowthReport({
    feature: {
      user_scope: { period_label: '최근 5회', exercise_name: '스쿼트', session_count: 5 },
      overall: { trend: 'improving', recent_avg_score: 71.6, previous_avg_score: 62, score_delta: 9.6, completed_sessions: 5 },
      improvements: [{ metric_key: 'depth', metric_name: '스쿼트 깊이', evidence: '52점에서 63.8점으로 상승' }],
      weak_points: [{ metric_key: 'knee_alignment', metric_name: '무릎 정렬', evidence: '최근 5회 중 3회 낮음' }],
      next_focus_candidates: [{
        metric_key: 'knee_alignment',
        metric_name: '무릎 정렬',
        recommended_cues: ['무릎과 발끝 방향을 맞추세요', '내려갈 때 양쪽 무릎이 안쪽으로 모이지 않는지 확인하세요'],
        reason: '반복 약점',
      }],
      data_quality: { confidence_label: 'high', note: '분석에 필요한 데이터가 충분합니다.' },
    },
    reason: 'PROVIDER_ERROR',
  });

  assert.ok(report.summary.length >= 90, report.summary);
  assert.ok(report.next_mission.action.length >= 60, report.next_mission.action);
  assert.ok(report.coach_comment.length >= 80, report.coach_comment);
});
