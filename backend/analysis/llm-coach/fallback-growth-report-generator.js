function generateFallbackGrowthReport({ feature, reason = null } = {}) {
  // 잘하고 있는 사용자 — 개선/약점/회귀 모두 없고 평균 점수 75 이상
  if (feature?.is_doing_well) {
    const avgScore = Math.round(feature.overall?.recent_avg_score || 0);
    return {
      summary: `최근 ${feature.user_scope?.exercise_name || '운동'} 점수가 평균 ${avgScore}점으로 안정적으로 유지되고 있습니다.`,
      improvements: [{
        title: '좋은 자세가 계속 유지되고 있어요',
        evidence: `최근 ${feature.user_scope?.session_count || 5}회 세션 평균 ${avgScore}점을 기록하며 안정적인 자세를 유지하고 있습니다.`,
        meaning: '반복할수록 자세가 더 안정적으로 정착되고 있습니다. 앞으로도 지금처럼 유지해보세요.',
      }],
      weak_points: [],
      next_mission: {
        title: '지금의 좋은 자세를 유지하기',
        action: '한 번의 반복이라도 집중력을 유지하며 천천히 수행해보세요. 잘하고 있는 것을 더 다지는 시간입니다.',
        reason: '현재 자세가 안정적이므로 무리한 변화보다 유지에 집중하는 것이 효과적입니다.',
        metric_key: 'general_maintenance',
      },
      data_quality_note: {
        label: feature?.data_quality?.confidence_label || 'medium',
        message: '분석에 사용된 운동 기록은 충분한 품질로 확인되었습니다.',
      },
      coach_comment: '현재 자세가 잘 잡혀 있습니다. 꾸준히 지금처럼 유지하면서, 한 가지 동작에 더 집중해보면 좋겠습니다.',
    };
  }

  const improvements = (feature?.improvements || []).slice(0, 2).map((item) => ({
    title: `${item.metric_name}이 좋아졌습니다`,
    evidence: item.evidence,
    meaning: `${item.metric_name} 기록이 이전보다 안정적으로 개선되었습니다.`,
  }));
  const weakPoints = (feature?.weak_points || []).slice(0, 2).map((item) => ({
    title: `${item.metric_name}은 아직 보완이 필요합니다`,
    evidence: item.evidence,
    meaning: `${item.metric_name}이 최근 기록에서 반복적으로 낮게 측정되었습니다.`,
  }));
  const focus = feature?.next_focus_candidates?.[0] || null;
  const missionMetric = focus?.metric_key || weakPoints[0]?.metric_key || 'general_focus';
  const missionTitle = focus ? `오늘은 ${focus.metric_name}에 집중하기` : '오늘은 안정적인 자세 유지하기';
  const missionAction = buildMissionAction(focus);
  const trend = feature?.overall?.trend;

  return {
    summary: buildSummary(feature, trend),
    improvements,
    weak_points: weakPoints,
    next_mission: {
      title: missionTitle,
      action: missionAction,
      reason: focus?.reason || '최근 기록에서 다음 운동 집중 포인트로 선정되었습니다.',
      metric_key: missionMetric,
    },
    data_quality_note: {
      label: feature?.data_quality?.confidence_label || 'low',
      message: feature?.data_quality?.note || '운동 기록이 충분하지 않아 참고용으로 확인해 주세요.',
    },
    coach_comment: buildCoachComment({ feature, reason, focus, improvements, weakPoints }),
  };
}

function buildSummary(feature, trend) {
  const period = feature?.user_scope?.period_label || `최근 ${feature?.user_scope?.session_count || 5}회`;
  const exercise = feature?.user_scope?.exercise_name || '운동';
  const recentAvg = formatScore(feature?.overall?.recent_avg_score);
  const previousAvg = formatScore(feature?.overall?.previous_avg_score);
  const delta = formatSigned(feature?.overall?.score_delta);
  const completed = Number(feature?.overall?.completed_sessions || 0);
  const trendText = trend === 'improving' ? '좋아지고 있는 흐름' : trend === 'declining' ? '하락하는 흐름' : '안정적인 흐름';

  const scoreText = recentAvg !== null
    ? `${period} ${exercise} 평균은 ${recentAvg}점으로 ${trendText}입니다`
    : `${period} ${exercise} 기록을 기준으로 ${trendText}을 확인했습니다`;
  const compareText = previousAvg !== null && delta !== null
    ? `이전 평균 ${previousAvg}점 대비 ${delta}점 변화가 있습니다`
    : '이전 구간과 직접 비교할 수 있는 표본은 제한적입니다';
  const completionText = completed > 0
    ? `${completed}회 완료 기록과 세부 지표를 함께 반영했습니다`
    : '세부 지표가 충분하지 않아 확인 가능한 기록 중심으로 정리했습니다';

  return `${scoreText}. ${compareText}. ${completionText}. 다음 집중 포인트를 함께 정리했습니다.`;
}

function buildMissionAction(focus) {
  const cues = Array.isArray(focus?.recommended_cues) ? focus.recommended_cues.filter(Boolean) : [];
  if (cues.length > 0) {
    const first = cues[0];
    const second = cues[1] || `${focus.metric_name || '집중 지표'}가 반복 내내 유지되는지 확인하세요`;
    return `첫째, ${first}. 둘째, ${second}. 반복 수를 늘리기보다 각 rep가 끝난 뒤 이 기준이 유지됐는지 확인하세요.`;
  }

  return '첫째, 반복 수보다 자세를 천천히 유지하는 데 집중하세요. 둘째, 세트가 끝난 뒤 가장 낮게 나온 지표 하나를 확인하고 다음 세트에서 같은 지표를 다시 점검하세요.';
}

function buildCoachComment({ feature, reason, focus, improvements = [], weakPoints = [] } = {}) {
  const exercise = feature?.user_scope?.exercise_name || '운동';
  const positive = improvements[0]?.title || '최근 기록에서 확인되는 좋은 흐름';
  const weak = weakPoints[0]?.title || focus?.metric_name || '오늘의 집중 지표';
  const prefix = reason
    ? 'AI 응답 대신 기록 기반 기본 리포트를 표시합니다.'
    : '기록 기반으로 다음 운동 포인트를 정리했습니다.';

  return `${prefix} ${exercise}에서 ${positive}은 유지하고, ${weak}은 다음 세트에서 가장 먼저 확인하세요. 한 번에 여러 자세를 바꾸기보다 하나의 미션을 정해 천천히 반복하는 것이 안정적입니다.`;
}

function formatScore(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Number(number.toFixed(1)).toString();
}

function formatSigned(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return `${number > 0 ? '+' : ''}${Number(number.toFixed(1))}`;
}

module.exports = { generateFallbackGrowthReport };
