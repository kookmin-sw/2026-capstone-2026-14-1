function detectRegressions(trends = []) {
  return trends
    .filter((trend) => Number(trend.delta) <= -8 && Number(trend.confidence) >= 0.45)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, 2)
    .map((trend) => ({
      metric_key: trend.metric_key,
      metric_name: trend.metric_name,
      previous_avg: trend.previous_avg,
      recent_avg: trend.recent_avg,
      delta: trend.delta,
      confidence: trend.confidence,
      evidence: `${trend.metric_name} 평균 점수가 ${Math.abs(Math.round(trend.delta))}점 하락`,
    }));
}

module.exports = { detectRegressions };
