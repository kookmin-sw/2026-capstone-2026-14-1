const { average, clampScore } = require('./score-utils');

function buildMetricTrends({ sessions = [], metrics = [], recentCount = 5 } = {}) {
  const orderedSessions = [...sessions].sort((a, b) => String(a.ended_at || '').localeCompare(String(b.ended_at || '')));
  const recentSessions = orderedSessions.slice(-recentCount);
  const previousSessions = orderedSessions.slice(Math.max(0, orderedSessions.length - recentCount * 2), Math.max(0, orderedSessions.length - recentCount));
  const recentIds = new Set(recentSessions.map((session) => session.session_id));
  const previousIds = new Set(previousSessions.map((session) => session.session_id));
  const byMetric = new Map();

  for (const row of metrics) {
    const key = String(row.metric_key || '').trim();
    if (!key) continue;
    if (!byMetric.has(key)) {
      byMetric.set(key, {
        metric_key: key,
        metric_name: row.metric_name || key,
        recent_scores: [],
        previous_scores: [],
        recent_sample_count: 0,
        previous_sample_count: 0,
      });
    }
    const item = byMetric.get(key);
    const score = clampScore(row.avg_score);
    const sampleCount = Math.max(0, Math.round(Number(row.sample_count) || 0));
    if (recentIds.has(row.session_id)) {
      item.recent_scores.push(score);
      item.recent_sample_count += sampleCount;
    }
    if (previousIds.has(row.session_id)) {
      item.previous_scores.push(score);
      item.previous_sample_count += sampleCount;
    }
  }

  return [...byMetric.values()].map((item) => {
    const recentAvg = average(item.recent_scores);
    const previousAvg = average(item.previous_scores);
    const delta = recentAvg !== null && previousAvg !== null ? Number((recentAvg - previousAvg).toFixed(1)) : null;
    return {
      metric_key: item.metric_key,
      metric_name: item.metric_name,
      previous_avg: previousAvg,
      recent_avg: recentAvg,
      delta,
      recent_sample_count: item.recent_sample_count,
      previous_sample_count: item.previous_sample_count,
      occurrence_count_below_60: item.recent_scores.filter((score) => score < 60).length,
      recent_session_count: item.recent_scores.length,
      confidence: calculateMetricConfidence(item),
    };
  });
}

function calculateMetricConfidence(item) {
  const recentSamples = Math.min(item.recent_sample_count / 30, 1);
  const previousSamples = item.previous_scores.length > 0 ? Math.min(item.previous_sample_count / 30, 1) : 0.6;
  const recentCoverage = Math.min(item.recent_scores.length / 5, 1);
  return Number((0.45 * recentSamples + 0.25 * previousSamples + 0.30 * recentCoverage).toFixed(2));
}

module.exports = { buildMetricTrends };
