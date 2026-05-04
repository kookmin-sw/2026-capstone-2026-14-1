const test = require('node:test');
const assert = require('node:assert/strict');

const {
  toFiniteNumber,
  clampScore,
  average,
  confidenceLabel,
  normalizeExerciseKey,
} = require('../../../backend/analysis/history-trend/score-utils');

test('clampScore normalizes invalid and out-of-range scores', () => {
  assert.equal(clampScore(120), 100);
  assert.equal(clampScore(-5), 0);
  assert.equal(clampScore('71.7'), 72);
  assert.equal(clampScore(null), 0);
});

test('average ignores invalid values and rounds to one decimal', () => {
  assert.equal(average([50, '61.25', null, NaN]), 55.6);
  assert.equal(average([]), null);
});

test('confidenceLabel maps scores to labels', () => {
  assert.equal(confidenceLabel(0.8), 'high');
  assert.equal(confidenceLabel(0.5), 'medium');
  assert.equal(confidenceLabel(0.2), 'low');
});

test('normalizeExerciseKey supports pushup aliases', () => {
  assert.equal(normalizeExerciseKey('pushup'), 'push_up');
  assert.equal(normalizeExerciseKey('PUSH_UP'), 'push_up');
  assert.equal(normalizeExerciseKey('squat'), 'squat');
});
