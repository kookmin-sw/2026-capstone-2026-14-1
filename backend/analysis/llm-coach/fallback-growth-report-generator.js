function generateFallbackGrowthReport({ feature, reason = null } = {}) {
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
