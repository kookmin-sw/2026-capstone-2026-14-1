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
