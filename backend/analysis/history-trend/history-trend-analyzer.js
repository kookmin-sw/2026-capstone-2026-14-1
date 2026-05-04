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
  const recentCount = parsePeriodCount(period);
  const recentSessions = orderedSessions.slice(-recentCount);
  const previousSessions = orderedSessions.slice(Math.max(0, orderedSessions.length - recentCount * 2), Math.max(0, orderedSessions.length - recentCount));
  const recentAvgScore = average(recentSessions.map((session) => session.final_score));
  const previousAvgScore = average(previousSessions.map((session) => session.final_score));
  const scoreDelta = recentAvgScore !== null && previousAvgScore !== null ? Number((recentAvgScore - previousAvgScore).toFixed(1)) : null;
  const trends = buildMetricTrends({ sessions: orderedSessions, metrics, recentCount });
  const improvements = detectImprovements(trends);
  const weakPoints = detectWeakPoints(trends);
  const regressions = detectRegressions(trends);
  const recentSessionIds = new Set(recentSessions.map((session) => session.session_id));
  const filteredEvents = events.filter((event) => !event.session_id || recentSessionIds.has(event.session_id));
  const dataQuality = buildDataQuality({ events: filteredEvents, trends });

  return {
    feature_version: 'htf_v1',
    user_scope: {
      user_id: userId,
      period_type: 'recent_sessions',
      session_count: recentSessions.length,
      exercise_key: normalizedExerciseKey,
      exercise_name: exerciseName || normalizedExerciseKey,
    },
    overall: {
      recent_avg_score: recentAvgScore,
      previous_avg_score: previousAvgScore,
      score_delta: scoreDelta,
      trend: classifyTrend(scoreDelta),
      completed_sessions: recentSessions.filter((session) => String(session.status || '').toLowerCase() === 'done').length,
      aborted_sessions: recentSessions.filter((session) => String(session.status || '').toLowerCase() === 'aborted').length,
    },
    improvements,
    weak_points: weakPoints,
    regressions,
    data_quality: dataQuality,
    next_focus_candidates: buildNextFocusCandidates({ weakPoints, regressions, metricGuide }),
  };
}

function parsePeriodCount(period) {
  if (period === 'recent_10') return 10;
  return 5;
}

function classifyTrend(delta) {
  if (!Number.isFinite(Number(delta))) return 'stable';
  if (delta >= 5) return 'improving';
  if (delta <= -5) return 'declining';
  return 'stable';
}

module.exports = { analyzeHistoryTrend, parsePeriodCount, classifyTrend };
