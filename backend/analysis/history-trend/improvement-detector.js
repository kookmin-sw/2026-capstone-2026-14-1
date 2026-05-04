function detectImprovements(trends = []) {
  return trends
    .filter((trend) => Number(trend.delta) >= 8 && Number(trend.confidence) >= 0.45 && Number(trend.recent_sample_count) > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 2)
    .map((trend) => ({
      metric_key: trend.metric_key,
      metric_name: trend.metric_name,
      previous_avg: trend.previous_avg,
      recent_avg: trend.recent_avg,
      delta: trend.delta,
      confidence: trend.confidence,
      evidence: `${trend.metric_name} 평균 점수가 ${Math.round(trend.previous_avg)}점에서 ${Math.round(trend.recent_avg)}점으로 상승`,
    }));
}

module.exports = { detectImprovements };
