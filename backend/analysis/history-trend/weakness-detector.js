function detectWeakPoints(trends = []) {
  return trends
    .filter((trend) => {
      const recentAvg = Number(trend.recent_avg);
      const occurrenceCount = Number(trend.occurrence_count_below_60 || 0);
      const sessionCount = Math.max(1, Number(trend.recent_session_count || 1));
      const occurrenceRatio = occurrenceCount / sessionCount;
      return Number(trend.confidence) >= 0.45 && (recentAvg < 65 || occurrenceRatio >= 0.5);
    })
    .sort((a, b) => {
      const occurrenceDiff = Number(b.occurrence_count_below_60 || 0) - Number(a.occurrence_count_below_60 || 0);
      if (occurrenceDiff !== 0) return occurrenceDiff;
      return Number(a.recent_avg || 0) - Number(b.recent_avg || 0);
    })
    .slice(0, 2)
    .map((trend) => ({
      metric_key: trend.metric_key,
      metric_name: trend.metric_name,
      recent_avg: trend.recent_avg,
      occurrence_count: trend.occurrence_count_below_60,
      session_count: trend.recent_session_count,
      confidence: trend.confidence,
      evidence: `최근 ${trend.recent_session_count}회 중 ${trend.occurrence_count_below_60}회에서 ${trend.metric_key}가 낮게 측정됨`,
    }));
}

module.exports = { detectWeakPoints };
