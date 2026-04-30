const test = require('node:test');
const assert = require('node:assert/strict');

if (typeof global.window === 'undefined') {
  global.window = {};
}

window.WorkoutExerciseRegistry = {
  _modules: {},
  register(code, mod) { this._modules[code] = mod; },
  get(code) { return this._modules[code] || null; },
};

require('../../public/js/workout/exercises/squat-exercise.js');
require('../../public/js/workout/exercises/push-up-exercise.js');
require('../../public/js/workout/exercises/plank-exercise.js');

function createScoringEngine(metricMap) {
  return {
    getMetricValue(angles, key) {
      void angles;
      return metricMap[key] ?? null;
    },
  };
}

test('push-up learn steps expose passable step evaluations', () => {
  const pushUpModule = window.WorkoutExerciseRegistry.get('push_up');
  assert.ok(pushUpModule, 'push-up module must be registered');

  const steps = pushUpModule.getLearnSteps();
  assert.equal(steps.length, 4);

  const evaluation = steps[0].evaluate({
    angles: {},
    scoringEngine: createScoringEngine({
      elbow_lockout: 160,
      hip_angle: 165,
      spine_angle: 80,
    }),
  });

  assert.equal(evaluation.passed, true);
});

test('plank learn steps expose hold-ready posture checks', () => {
  const plankModule = window.WorkoutExerciseRegistry.get('plank');
  assert.ok(plankModule, 'plank module must be registered');

  const steps = plankModule.getLearnSteps();
  assert.equal(steps.length, 4);

  const evaluation = steps[3].evaluate({
    angles: {},
    scoringEngine: createScoringEngine({
      hip_angle: 165,
      spine_angle: 90,
      elbow_support_angle: 75,
      knee_angle: 170,
    }),
  });

  assert.equal(evaluation.passed, true);
});

test('squat learn steps stay view-aware between front and side', () => {
  const squatModule = window.WorkoutExerciseRegistry.get('squat');
  assert.ok(squatModule, 'squat module must be registered');

  const frontSteps = squatModule.getLearnSteps({ selectedView: 'FRONT' });
  const sideSteps = squatModule.getLearnSteps({ selectedView: 'SIDE' });

  assert.equal(frontSteps[0].badge, '정면 준비');
  assert.equal(sideSteps[0].badge, '측면 준비');
});
