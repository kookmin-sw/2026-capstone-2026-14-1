const test = require('node:test');
const assert = require('node:assert/strict');

const { postProcessGrowthReportOutput } = require('../../../backend/analysis/llm-coach/report-post-processor');

test('postProcessGrowthReportOutput adds a detailed improvement when LLM omits positives for a strong report', () => {
  const report = postProcessGrowthReportOutput({
    output: {
      summary: 'stable but has one weakness',
      improvements: [],
      weak_points: [
        { title: '뒤꿈치 접지', evidence: '최근 6회 중 4회에서 낮게 측정됨', metric_key: 'heel_contact' },
      ],
      next_mission: {
        title: '뒤꿈치 접지 집중 훈련',
        action: '뒤꿈치를 바닥에 유지하세요',
        reason: '반복적으로 낮게 측정됨',
        metric_key: 'heel_contact',
      },
      data_quality_note: { label: 'low', message: 'bad' },
      coach_comment: 'c',
    },
    feature: {
      user_scope: {
        period_label: '최근 30일',
        session_count: 50,
        exercise_name: '스쿼트',
      },
      overall: {
        recent_avg_score: 89.2,
        trend: 'stable',
        completed_sessions: 23,
      },
      improvements: [],
      weak_points: [
        {
          metric_key: 'heel_contact',
          metric_name: '뒤꿈치 접지',
          recent_avg: 58,
          occurrence_count: 4,
          session_count: 6,
        },
      ],
      regressions: [],
      next_focus_candidates: [{ metric_key: 'heel_contact', metric_name: '뒤꿈치 접지' }],
      data_quality: { confidence_label: 'medium', note: '일부 세션에서 카메라 인식 문제가 있었으나 반복 패턴 판단은 가능합니다.' },
      is_doing_well: false,
    },
  });

  assert.equal(report.improvements.length, 1);
  assert.match(report.improvements[0].title, /평균|점수|안정/);
  assert.match(report.improvements[0].evidence, /최근 30일/);
  assert.match(report.improvements[0].evidence, /89\.2/);
  assert.match(report.improvements[0].evidence, /23회 완료/);
  assert.match(report.improvements[0].meaning, /안정|유지|무너지지/);
});

test('postProcessGrowthReportOutput enriches weak point evidence and meaning with metric detail', () => {
  const report = postProcessGrowthReportOutput({
    output: {
      summary: 'stable but has one weakness',
      improvements: [],
      weak_points: [
        { title: '뒤꿈치 접지', evidence: '낮게 측정됨', metric_key: 'heel_contact' },
      ],
      next_mission: {
        title: '뒤꿈치 접지 집중 훈련',
        action: '뒤꿈치를 바닥에 유지하세요',
        reason: '반복적으로 낮게 측정됨',
        metric_key: 'heel_contact',
      },
      data_quality_note: { label: 'medium', message: 'ok' },
      coach_comment: 'c',
    },
    feature: {
      user_scope: { period_label: '최근 30일', exercise_name: '스쿼트' },
      overall: { recent_avg_score: 89.2, trend: 'stable', completed_sessions: 23 },
      improvements: [],
      weak_points: [
        {
          metric_key: 'heel_contact',
          metric_name: '뒤꿈치 접지',
          recent_avg: 58,
          occurrence_count: 4,
          session_count: 6,
        },
      ],
      regressions: [],
      next_focus_candidates: [{ metric_key: 'heel_contact', metric_name: '뒤꿈치 접지' }],
      data_quality: { confidence_label: 'medium', note: 'ok' },
    },
  });

  assert.equal(report.weak_points.length, 1);
  assert.match(report.weak_points[0].evidence, /최근 6회 중 4회/);
  assert.match(report.weak_points[0].evidence, /58점/);
  assert.match(report.weak_points[0].meaning, /뒤꿈치 접지/);
  assert.match(report.weak_points[0].meaning, /무게 중심|안정/);
});
