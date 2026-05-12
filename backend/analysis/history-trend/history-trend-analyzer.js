const { average, normalizeExerciseKey } = require('./score-utils');
const { buildMetricTrends } = require('./metric-trend-builder');
const { detectImprovements } = require('./improvement-detector');
const { detectWeakPoints } = require('./weakness-detector');
const { detectRegressions } = require('./regression-detector');
const { buildDataQuality } = require('./data-quality-builder');
const { buildNextFocusCandidates } = require('./next-focus-builder');
const { loadMetricGuide } = require('../metric-guides');

function analyzeHistoryTrend({ userId, period = 'recent_5', exerciseKey, exerciseName, sessions = [], metrics = [], events = [] } = {}) {
  const normalizedExerciseKey = normalizeExerciseKey(exerciseKey);
  const metricGuide = loadMetricGuide(normalizedExerciseKey);
  const orderedSessions = [...sessions].sort((a, b) => String(a.ended_at || '').localeCompare(String(b.ended_at || '')));
  const periodDescriptor = describeAnalysisPeriod(period, orderedSessions.length);
  const recentCount = periodDescriptor.count;
  const recentSessions = periodDescriptor.type === 'date_range'
    ? orderedSessions
    : orderedSessions.slice(-recentCount);
  const previousSessions = periodDescriptor.type === 'date_range'
    ? []
    : orderedSessions.slice(Math.max(0, orderedSessions.length - recentCount * 2), Math.max(0, orderedSessions.length - recentCount));
  const recentAvgScore = average(recentSessions.map((session) => session.final_score));
  const previousAvgScore = average(previousSessions.map((session) => session.final_score));
  const scoreDelta = recentAvgScore !== null && previousAvgScore !== null ? Number((recentAvgScore - previousAvgScore).toFixed(1)) : null;
  const trends = buildMetricTrends({ sessions: orderedSessions, metrics, recentCount });
  const improvements = detectImprovements(trends);
  const weakPoints = detectWeakPoints(trends);
  const regressions = detectRegressions(trends);
  const recentSessionIds = new Set(recentSessions.map((session) => session.session_id));
  const filteredEvents = events.filter((event) => !event.session_id || recentSessionIds.has(event.session_id));
  const completedSessions = recentSessions.filter((session) => String(session.status || '').toLowerCase() === 'done');
  const abortedSessions = recentSessions.filter((session) => String(session.status || '').toLowerCase() === 'aborted');
  const dataQuality = buildDataQuality({
    events: filteredEvents,
    trends,
    completedSessionCount: completedSessions.length,
  });
  const nextFocusCandidates = buildNextFocusCandidates({ weakPoints, regressions, metricGuide });
  const isDoingWell = improvements.length === 0 && weakPoints.length === 0 && regressions.length === 0
    && Number.isFinite(recentAvgScore) && recentAvgScore >= 75;

  return {
    feature_version: 'htf_v1',
    user_scope: {
      user_id: userId,
      period_type: periodDescriptor.type,
      period_key: periodDescriptor.key,
      period_label: periodDescriptor.label,
      session_count: recentSessions.length,
      exercise_key: normalizedExerciseKey,
      exercise_name: exerciseName || normalizedExerciseKey,
    },
    overall: {
      recent_avg_score: recentAvgScore,
      previous_avg_score: previousAvgScore,
      score_delta: scoreDelta,
      trend: classifyTrend(scoreDelta),
      completed_sessions: completedSessions.length,
      aborted_sessions: abortedSessions.length,
    },
    improvements,
    weak_points: weakPoints,
    regressions,
    data_quality: dataQuality,
    next_focus_candidates: nextFocusCandidates,
    is_doing_well: isDoingWell,
  };
}

function parsePeriodCount(period) {
  const map = { recent_3: 3, recent_5: 5, recent_10: 10 };
  return map[period] || 5;
}

function describeAnalysisPeriod(period, sessionCount = 0) {
  const dateRangeMap = {
    last_7_days: '최근 7일',
    last_30_days: '최근 30일',
  };
  if (dateRangeMap[period]) {
    return {
      type: 'date_range',
      key: period,
      label: dateRangeMap[period],
      count: Math.max(0, Number(sessionCount || 0)),
    };
  }

  const count = parsePeriodCount(period);
  return {
    type: 'recent_sessions',
    key: ['recent_3', 'recent_5', 'recent_10'].includes(period) ? period : 'recent_5',
    label: `최근 ${count}회`,
    count,
  };
}

function classifyTrend(delta) {
  if (!Number.isFinite(Number(delta))) return 'stable';
  if (delta >= 5) return 'improving';
  if (delta <= -5) return 'declining';
  return 'stable';
}

module.exports = { analyzeHistoryTrend, parsePeriodCount, classifyTrend, describeAnalysisPeriod };
