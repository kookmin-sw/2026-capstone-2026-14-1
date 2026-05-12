const { confidenceLabel } = require('./score-utils');

function buildDataQuality({ events = [], trends = [], completedSessionCount = 0 } = {}) {
  const eventTypes = events.map((event) => String(event.type || '').toUpperCase());
  const cameraIssueEvents = events.filter((event) => isCameraIssueType(event.type));
  const cameraIssueCount = cameraIssueEvents.length;
  const noPersonCount = eventTypes.filter((type) => type.includes('NO_PERSON')).length;
  const lowSampleSessions = trends.filter((trend) => Number(trend.recent_sample_count || 0) < 5).length;
  const hasTrendMetrics = trends.length > 0;
  const trendConfidence = hasTrendMetrics
    ? trends.reduce((sum, trend) => sum + Number(trend.confidence ?? 0.55), 0) / trends.length
    : sessionScoreConfidence(completedSessionCount);
  const penalty = Math.min(0.25, cameraIssuePenalty(cameraIssueEvents, completedSessionCount) + lowSampleSessions * 0.05);
  const overallConfidence = Number(Math.max(0.2, Math.min(0.95, trendConfidence - penalty)).toFixed(2));

  let note = '분석에 필요한 데이터가 충분합니다.';
  if (overallConfidence < 0.4) {
    note = '운동 기록이나 카메라 인식 데이터가 부족해 참고용으로만 확인해 주세요.';
  } else if (cameraIssueCount > 0) {
    note = '일부 세션에서 카메라 인식 문제가 있었으나 반복 패턴 판단은 가능합니다.';
  } else if (!hasTrendMetrics && completedSessionCount >= 2) {
    note = '최근 세션 점수는 확인되었지만 세부 metric 표본이 부족해 요약 중심으로 분석했습니다.';
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

function sessionScoreConfidence(completedSessionCount) {
  const count = Number(completedSessionCount || 0);
  if (count >= 5) return 0.55;
  if (count >= 2) return 0.45;
  return 0.35;
}

function cameraIssuePenalty(cameraIssueEvents, completedSessionCount) {
  const count = cameraIssueEvents.length;
  if (Number(completedSessionCount || 0) < 2) return count * 0.04;

  const affectedSessionIds = new Set(
    cameraIssueEvents
      .map((event) => event.session_id)
      .filter(Boolean),
  );
  const issueUnits = affectedSessionIds.size || count;
  return Math.min(0.15, issueUnits * 0.02);
}

function isCameraIssueType(type) {
  const value = String(type || '').toUpperCase();
  return value.includes('NO_PERSON') || value.includes('CAMERA') || value.includes('STALE');
}

module.exports = { buildDataQuality };
