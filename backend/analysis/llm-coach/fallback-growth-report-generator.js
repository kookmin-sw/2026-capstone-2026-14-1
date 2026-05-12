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
  const missionAction = focus?.recommended_cues?.[0] || '반복 수보다 자세를 천천히 유지하는 데 집중하세요.';
  const trend = feature?.overall?.trend;

  return {
    summary: trend === 'improving'
      ? '최근 운동 기록은 전반적으로 좋아지고 있습니다.'
      : '최근 운동 기록을 기준으로 다음 집중 포인트를 정리했습니다.',
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
    coach_comment: reason
      ? 'AI 응답 대신 기록 기반 기본 리포트를 표시합니다. 다음 운동에서는 한 가지 미션에 집중해 보세요.'
      : '좋아진 점은 유지하고, 다음 운동에서는 미션 하나에 집중해 보세요.',
  };
}

module.exports = { generateFallbackGrowthReport };
