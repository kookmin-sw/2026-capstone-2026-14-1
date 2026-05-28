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

test('postProcessGrowthReportOutput expands short LLM narrative fields with feature evidence', () => {
  const report = postProcessGrowthReportOutput({
    output: {
      summary: '좋아지고 있습니다.',
      improvements: [],
      weak_points: [
        { title: '무릎 정렬', evidence: '낮음', metric_key: 'knee_alignment' },
      ],
      next_mission: {
        title: '무릎 정렬 집중',
        action: '무릎을 맞추세요.',
        reason: '낮음',
        metric_key: 'knee_alignment',
      },
      data_quality_note: { label: 'medium', message: 'ok' },
      coach_comment: '좋아요.',
    },
    feature: {
      user_scope: { period_label: '최근 5회', exercise_name: '스쿼트' },
      overall: {
        recent_avg_score: 71.6,
        previous_avg_score: 62,
        score_delta: 9.6,
        trend: 'improving',
        completed_sessions: 5,
        aborted_sessions: 0,
      },
      improvements: [
        { metric_key: 'depth', metric_name: '스쿼트 깊이', previous_avg: 52, recent_avg: 63.8, delta: 11.8 },
      ],
      weak_points: [
        {
          metric_key: 'knee_alignment',
          metric_name: '무릎 정렬',
          recent_avg: 58,
          occurrence_count: 3,
          session_count: 5,
        },
      ],
      regressions: [],
      next_focus_candidates: [{
        metric_key: 'knee_alignment',
        metric_name: '무릎 정렬',
        recommended_cues: ['무릎과 발끝 방향을 맞추세요', '내려갈 때 양쪽 무릎이 안쪽으로 모이지 않는지 확인하세요'],
        reason: '반복 약점',
      }],
      data_quality: { confidence_label: 'high', note: '분석에 필요한 데이터가 충분합니다.' },
    },
  });

  assert.ok(report.summary.length >= 90, report.summary);
  assert.match(report.summary, /최근 5회/);
  assert.match(report.summary, /71\.6/);
  assert.ok(report.next_mission.action.length >= 60, report.next_mission.action);
  assert.match(report.next_mission.action, /무릎과 발끝 방향/);
  assert.ok(report.coach_comment.length >= 80, report.coach_comment);
  assert.match(report.coach_comment, /무릎 정렬/);
});

test('postProcessGrowthReportOutput restores feature weak point when LLM recommends only maintenance', () => {
  const report = postProcessGrowthReportOutput({
    output: {
      summary: '최근 평균 점수가 높아 현재 자세를 유지하면 됩니다.',
      improvements: [{ title: '높은 평균 점수 유지', evidence: '최근 평균 82점', meaning: '전체 점수가 안정적입니다.' }],
      weak_points: [],
      next_mission: {
        title: '현재 자세 유지',
        action: '지금처럼 반복하세요.',
        reason: '최근 평균 점수가 높습니다.',
        metric_key: 'general_maintenance',
      },
      data_quality_note: { label: 'high', message: 'ok' },
      coach_comment: '잘하고 있습니다.',
    },
    feature: {
      user_scope: { period_label: '최근 5회', exercise_name: '스쿼트' },
      overall: { recent_avg_score: 82, trend: 'stable', completed_sessions: 5 },
      improvements: [],
      weak_points: [
        {
          metric_key: 'knee_alignment',
          metric_name: '무릎 정렬',
          recent_avg: 42,
          occurrence_count: 4,
          session_count: 5,
          evidence: '최근 5회 중 4회에서 무릎 정렬이 낮게 측정됨',
        },
      ],
      regressions: [],
      next_focus_candidates: [{
        metric_key: 'knee_alignment',
        metric_name: '무릎 정렬',
        recommended_cues: ['무릎과 발끝 방향을 맞추세요', '내려갈 때 양쪽 무릎이 안쪽으로 모이지 않는지 확인하세요'],
        reason: '반복 빈도와 안전 중요도를 함께 고려함',
      }],
      data_quality: { confidence_label: 'high', note: '분석에 필요한 데이터가 충분합니다.' },
      is_doing_well: false,
    },
  });

  assert.equal(report.weak_points.length, 1);
  assert.equal(report.weak_points[0].metric_key, 'knee_alignment');
  assert.match(report.weak_points[0].evidence, /최근 5회 중 4회/);
  assert.equal(report.next_mission.metric_key, 'knee_alignment');
  assert.match(report.next_mission.title, /무릎 정렬/);
  assert.match(report.next_mission.action, /무릎과 발끝 방향/);
  assert.match(report.coach_comment, /무릎 정렬/);
});

test('postProcessGrowthReportOutput redirects mission from improvement to corrective focus', () => {
  const report = postProcessGrowthReportOutput({
    output: {
      summary: '최근 스쿼트 점수는 안정적입니다.',
      improvements: [{ title: '스쿼트 깊이 개선', evidence: '깊이가 좋아짐', meaning: '가동 범위가 좋아졌습니다.', metric_key: 'depth' }],
      weak_points: [{ title: '무릎 정렬', evidence: '낮음', meaning: '정렬이 흔들림', metric_key: 'knee_alignment' }],
      next_mission: {
        title: '스쿼트 깊이 유지',
        action: '깊이를 유지하세요.',
        reason: '좋아지고 있습니다.',
        metric_key: 'depth',
      },
      data_quality_note: { label: 'high', message: 'ok' },
      coach_comment: '좋습니다.',
    },
    feature: {
      user_scope: { period_label: '최근 5회', exercise_name: '스쿼트' },
      overall: { recent_avg_score: 82, trend: 'improving', completed_sessions: 5 },
      improvements: [{ metric_key: 'depth', metric_name: '스쿼트 깊이', previous_avg: 60, recent_avg: 80, delta: 20 }],
      weak_points: [{
        metric_key: 'knee_alignment',
        metric_name: '무릎 정렬',
        recent_avg: 42,
        occurrence_count: 4,
        session_count: 5,
      }],
      regressions: [],
      next_focus_candidates: [{
        metric_key: 'knee_alignment',
        metric_name: '무릎 정렬',
        recommended_cues: ['무릎과 발끝 방향을 맞추세요'],
        reason: '반복 약점',
      }],
      data_quality: { confidence_label: 'high', note: '분석에 필요한 데이터가 충분합니다.' },
      is_doing_well: false,
    },
  });

  assert.equal(report.next_mission.metric_key, 'knee_alignment');
  assert.match(report.next_mission.title, /무릎 정렬/);
  assert.match(report.next_mission.action, /무릎과 발끝 방향/);
});

test('postProcessGrowthReportOutput keeps relative-low weak point evidence', () => {
  const report = postProcessGrowthReportOutput({
    output: {
      summary: '최근 평균 점수가 안정적입니다.',
      improvements: [],
      weak_points: [],
      next_mission: {
        title: '현재 자세 유지',
        action: '지금처럼 반복하세요.',
        reason: '안정적입니다.',
        metric_key: 'general_maintenance',
      },
      data_quality_note: { label: 'medium', message: 'ok' },
      coach_comment: '좋습니다.',
    },
    feature: {
      user_scope: { period_label: '최근 10회', exercise_name: '스쿼트' },
      overall: { recent_avg_score: 84.3, trend: 'stable', completed_sessions: 10 },
      improvements: [],
      weak_points: [{
        metric_key: 'knee_alignment',
        metric_name: '무릎 정렬',
        recent_avg: 72,
        occurrence_count: 0,
        session_count: 10,
        evidence: '최근 10회 평균 72점으로 다른 지표보다 상대적으로 낮게 측정됨',
        severity: 'relative_low',
      }],
      regressions: [],
      next_focus_candidates: [{
        metric_key: 'knee_alignment',
        metric_name: '무릎 정렬',
        recommended_cues: ['무릎과 발끝 방향을 맞추세요'],
      }],
      data_quality: { confidence_label: 'medium', note: 'ok' },
      is_doing_well: false,
    },
  });

  assert.match(report.weak_points[0].evidence, /상대적으로 낮게/);
  assert.equal(report.next_mission.metric_key, 'knee_alignment');
});
