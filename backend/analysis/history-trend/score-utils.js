function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(toFiniteNumber(value, 0))));
}

function average(values = []) {
  const valid = values
    .filter((value) => value !== null)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (valid.length === 0) return null;
  const sum = valid.reduce((acc, value) => acc + value, 0);
  return Number((sum / valid.length).toFixed(1));
}

function confidenceLabel(score) {
  const value = toFiniteNumber(score, 0);
  if (value >= 0.7) return 'high';
  if (value >= 0.4) return 'medium';
  return 'low';
}

function normalizeExerciseKey(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'pushup') return 'push_up';
  return key;
}

module.exports = {
  toFiniteNumber,
  clampScore,
  average,
  confidenceLabel,
  normalizeExerciseKey,
};
