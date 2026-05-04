function buildNextFocusCandidates({ weakPoints = [], regressions = [], metricGuide = {} } = {}) {
  const candidates = new Map();

  for (const weakPoint of weakPoints) {
    candidates.set(weakPoint.metric_key, {
      metric_key: weakPoint.metric_key,
      metric_name: weakPoint.metric_name,
      weakness_score: Math.max(0, (65 - Number(weakPoint.recent_avg || 65)) / 65),
      regression_score: 0,
      occurrence_count: Number(weakPoint.occurrence_count || 0),
      confidence: Number(weakPoint.confidence || 0),
    });
  }

  for (const regression of regressions) {
    const existing = candidates.get(regression.metric_key) || {
      metric_key: regression.metric_key,
      metric_name: regression.metric_name,
      weakness_score: 0,
      occurrence_count: 0,
      confidence: Number(regression.confidence || 0),
    };
    existing.regression_score = Math.min(1, Math.abs(Number(regression.delta || 0)) / 30);
    candidates.set(regression.metric_key, existing);
  }

  return [...candidates.values()]
    .map((candidate) => {
      const guide = metricGuide?.metrics?.[candidate.metric_key] || {};
      const safetyPriority = Number(guide.safety_priority ?? 0.5);
      const actionability = Number(guide.actionability ?? 0.5);
      const priorityScore =
        0.35 * candidate.weakness_score +
        0.25 * safetyPriority +
        0.20 * actionability +
        0.10 * candidate.regression_score +
        0.10 * candidate.confidence;
      return {
        metric_key: candidate.metric_key,
        metric_name: candidate.metric_name,
        priority_score: Number(priorityScore.toFixed(3)),
        reason: '반복 빈도, 안전 중요도, 교정 가능성을 함께 고려함',
        recommended_cues: Array.isArray(guide.coaching_cues) ? guide.coaching_cues.slice(0, 2) : [],
      };
    })
    .sort((a, b) => b.priority_score - a.priority_score)
    .map((candidate, index) => ({ ...candidate, priority: index + 1 }));
}

module.exports = { buildNextFocusCandidates };
