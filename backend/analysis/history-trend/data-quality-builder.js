const { confidenceLabel } = require('./score-utils');

function buildDataQuality({ events = [], trends = [] } = {}) {
  const eventTypes = events.map((event) => String(event.type || '').toUpperCase());
  const cameraIssueCount = eventTypes.filter((type) => type.includes('NO_PERSON') || type.includes('CAMERA') || type.includes('STALE')).length;
  const noPersonCount = eventTypes.filter((type) => type.includes('NO_PERSON')).length;
  const lowSampleSessions = trends.filter((trend) => Number(trend.recent_sample_count || 0) < 5).length;
  const trendConfidence = trends.length > 0
    ? trends.reduce((sum, trend) => sum + Number(trend.confidence ?? 0.55), 0) / trends.length
    : 0.35;
  const penalty = Math.min(0.25, cameraIssueCount * 0.04 + lowSampleSessions * 0.05);
  const overallConfidence = Number(Math.max(0.2, Math.min(0.95, trendConfidence - penalty)).toFixed(2));

  let note = '분석에 필요한 데이터가 충분합니다.';
  if (overallConfidence < 0.4) {
    note = '운동 기록이나 카메라 인식 데이터가 부족해 참고용으로만 확인해 주세요.';
  } else if (cameraIssueCount > 0) {
    note = '일부 세션에서 카메라 인식 문제가 있었으나 반복 패턴 판단은 가능합니다.';
  }

  return {
    camera_issue_count: cameraIssueCount,
    no_person_count: noPersonCount,
    low_sample_sessions: lowSampleSessions,
    overall_confidence: overallConfidence,
    confidence_label: confidenceLabel(overallConfidence),
    note,
  };
}

module.exports = { buildDataQuality };
