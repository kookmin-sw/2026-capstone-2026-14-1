const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeLearnStepEvaluation,
  updateLearnHoldState,
} = require('../../public/js/workout/learn-step-engine.js');

test('normalizeLearnStepEvaluation derives progress from checks', () => {
  const evaluation = normalizeLearnStepEvaluation({
    checks: [
      { label: '준비 자세', passed: true },
      { label: '무릎 정렬', passed: false, progress: 0.25 },
    ],
  });

  assert.equal(evaluation.passed, false);
  assert.equal(evaluation.checks.length, 2);
  assert.equal(evaluation.progress, 0.625);
});

test('updateLearnHoldState accumulates hold time only while current step passes', () => {
  const holding = updateLearnHoldState({
    currentHoldMs: 400,
    deltaMs: 300,
    holdMs: 1000,
    passed: true,
  });

  assert.equal(holding.holdMs, 600);
  assert.equal(holding.completed, false);
  assert.equal(holding.holdProgress, 0.6);

  const reset = updateLearnHoldState({
    currentHoldMs: holding.holdMs,
    deltaMs: 100,
    holdMs: 1000,
    passed: false,
  });

  assert.equal(reset.holdMs, 0);
  assert.equal(reset.holdProgress, 0);
  assert.equal(reset.completed, false);
});
