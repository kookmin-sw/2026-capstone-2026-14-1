const { normalizeExerciseKey } = require('../history-trend/score-utils');

const guides = {
  squat: require('./squat.v1.json'),
  push_up: require('./push_up.v1.json'),
  plank: require('./plank.v1.json'),
};

function loadMetricGuide(exerciseKey) {
  const normalized = normalizeExerciseKey(exerciseKey);
  const guide = guides[normalized];
  if (!guide) {
    throw new Error(`Unsupported exercise for metric guide: ${exerciseKey}`);
  }
  return guide;
}

function getMetricGuideEntry(guide, metricKey) {
  const key = String(metricKey || '').trim();
  return guide?.metrics?.[key] || {
    display_name: key,
    meaning: key,
    low_score_interpretation: `${key} 점수가 낮게 측정됨`,
    coaching_cues: [],
    safety_priority: 0.5,
    actionability: 0.5,
    view_compatibility: { FRONT: 0.7, SIDE: 0.7 },
  };
}

module.exports = { loadMetricGuide, getMetricGuideEntry };
