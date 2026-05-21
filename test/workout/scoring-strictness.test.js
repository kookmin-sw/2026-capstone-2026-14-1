const test = require('node:test');
const assert = require('node:assert/strict');

if (typeof window === 'undefined') {
  global.window = {};
}

if (!window.WorkoutExerciseRegistry) {
  window.WorkoutExerciseRegistry = {
    _modules: {},
    register(code, mod) { this._modules[code] = mod; },
    get(code) { return this._modules[code] || null; },
  };
}

require('../../public/js/workout/exercises/squat-exercise.js');
require('../../public/js/workout/exercises/push-up-exercise.js');
require('../../public/js/workout/session-buffer.js');
const { ScoringEngine } = require('../../public/js/workout/scoring-engine.js');

function metricConfig({
  key,
  weight,
  maxScore,
  required = false,
  rule = { type: 'threshold', value: 1, direction: 'gte' },
}) {
  return {
    weight,
    max_score: maxScore,
    required,
    rule,
    metric: {
      metric_id: key,
      key,
      title: key,
      unit: 'SCORE',
    },
  };
}

function createScoringEngineStub() {
  return {
    pickMetric(summary, phases, metricKey, statKey) {
      return summary.metricStats?.[metricKey]?.[statKey] ?? null;
    },
    pickPhaseMetric(summary, phases, metricKey, statKey) {
      return summary.metricStats?.[metricKey]?.[statKey] ?? null;
    },
    getProfileMetricConfig(metricKey, fallbackTitle, fallbackMaxScore = 100) {
      return {
        metric_id: metricKey,
        title: fallbackTitle,
        maxScore: fallbackMaxScore,
      };
    },
  };
}

test('frame scoring gives zero and caps score when a required metric is missing', () => {
  const scoringEngine = new ScoringEngine({
    scoring_profile_metric: [
      metricConfig({
        key: 'hip_angle',
        weight: 0.9,
        maxScore: 90,
        required: true,
        rule: {
          ideal_min: 150,
          ideal_max: 180,
          acceptable_min: 120,
          acceptable_max: 180,
        },
      }),
      metricConfig({
        key: 'spine_angle',
        weight: 0.1,
        maxScore: 10,
        rule: {
          ideal_min: 0,
          ideal_max: 20,
          acceptable_min: 0,
          acceptable_max: 40,
        },
      }),
    ],
  });

  const result = scoringEngine.calculate({ spine: 10 });
  const missingHip = result.breakdown.find((item) => item.key === 'hip_angle');

  assert.ok(missingHip, 'required missing metric must remain in breakdown');
  assert.equal(missingHip.actualValue, null);
  assert.equal(missingHip.score, 0);
  assert.equal(missingHip.normalizedScore, 0);
  assert.equal(result.score, 10);
});

test('frame scoring still excludes optional missing metrics', () => {
  const scoringEngine = new ScoringEngine({
    scoring_profile_metric: [
      metricConfig({
        key: 'hip_angle',
        weight: 0.9,
        maxScore: 90,
        required: false,
        rule: {
          ideal_min: 150,
          ideal_max: 180,
          acceptable_min: 120,
          acceptable_max: 180,
        },
      }),
      metricConfig({
        key: 'spine_angle',
        weight: 0.1,
        maxScore: 10,
        rule: {
          ideal_min: 0,
          ideal_max: 20,
          acceptable_min: 0,
          acceptable_max: 40,
        },
      }),
    ],
  });

  const result = scoringEngine.calculate({ spine: 10 });

  assert.equal(result.breakdown.some((item) => item.key === 'hip_angle'), false);
  assert.equal(result.score, 100);
});

test('frame scoring uses metric weights instead of max score as final weighting', () => {
  const scoringEngine = new ScoringEngine({
    scoring_profile_metric: [
      metricConfig({ key: 'bad_metric', weight: 0.1, maxScore: 90 }),
      metricConfig({ key: 'good_metric', weight: 0.9, maxScore: 10 }),
    ],
  });

  const result = scoringEngine.calculate({
    bad_metric: 0,
    good_metric: 1,
  });

  assert.equal(result.score, 90);
});

test('push-up rep score is capped when multiple soft failures are present', () => {
  const pushUpModule = window.WorkoutExerciseRegistry.get('push_up');
  assert.ok(pushUpModule, 'push-up module must be registered');

  const result = pushUpModule.scoreRep(createScoringEngineStub(), {
    repNumber: 1,
    selectedView: 'SIDE',
    duration: 1200,
    score: 95,
    summary: {
      dominantView: 'SIDE',
      confidence: { score: 0.95, level: 'HIGH', factor: 1 },
      flags: {
        bottomReached: true,
        lockoutReached: true,
      },
      metricStats: {
        elbowAngle: { min: 110, max: 147 },
        hipAngle: { min: 170 },
      },
      overall: {
        metrics: {
          spineAngle: { count: 2, min: 10, max: 15 },
        },
      },
      phases: {},
    },
  });

  assert.deepEqual(result.softFails.sort(), ['elbow_depth', 'elbow_lockout']);
  assert.equal(result.score, 75);
});

test('push-up rep score ignores capture confidence when posture metrics match', () => {
  const pushUpModule = window.WorkoutExerciseRegistry.get('push_up');
  assert.ok(pushUpModule, 'push-up module must be registered');

  const makeRep = (confidence) => pushUpModule.scoreRep(createScoringEngineStub(), {
    repNumber: 1,
    selectedView: 'SIDE',
    duration: 1200,
    score: 95,
    summary: {
      dominantView: 'SIDE',
      confidence,
      flags: {
        bottomReached: true,
        lockoutReached: true,
      },
      metricStats: {
        elbowAngle: { min: 80, max: 160 },
        hipAngle: { min: 170 },
        spineAngle: { min: 8, max: 12 },
      },
      phases: {},
    },
  });

  const highQuality = makeRep({ score: 0.95, level: 'HIGH', factor: 1 });
  const lowQuality = makeRep({ score: 0.35, level: 'LOW', factor: 0.7 });

  assert.equal(lowQuality.score, highQuality.score);
});

test('squat rep score is capped when a soft failure is present', () => {
  const squatModule = window.WorkoutExerciseRegistry.get('squat');
  assert.ok(squatModule, 'squat module must be registered');

  const result = squatModule.scoreRep(createScoringEngineStub(), {
    repNumber: 1,
    selectedView: 'FRONT',
    duration: 1200,
    score: 95,
    summary: {
      dominantView: 'FRONT',
      confidence: { score: 0.95, level: 'HIGH', factor: 1 },
      flags: {
        bottomReached: true,
        lockoutReached: true,
      },
      metricStats: {
        kneeAngle: { min: 92, max: 170 },
        hipAngle: { min: 105, max: 165 },
        spineAngle: { max: 12 },
        kneeSymmetry: { avg: 20 },
        kneeAlignment: { avg: 0.02 },
        hipBelowKnee: { min: 0 },
        kneeValgus: { avg: 0.02 },
      },
      phases: {},
    },
  });

  assert.deepEqual(result.softFails, ['knee_symmetry']);
  assert.equal(result.score, 80);
});

test('squat rep score ignores capture confidence when posture metrics match', () => {
  const squatModule = window.WorkoutExerciseRegistry.get('squat');
  assert.ok(squatModule, 'squat module must be registered');

  const makeRep = (confidence) => squatModule.scoreRep(createScoringEngineStub(), {
    repNumber: 1,
    selectedView: 'FRONT',
    duration: 1200,
    score: 95,
    summary: {
      dominantView: 'FRONT',
      confidence,
      flags: {
        bottomReached: true,
        lockoutReached: true,
      },
      metricStats: {
        kneeAngle: { min: 92, max: 170 },
        hipAngle: { min: 105, max: 165 },
        spineAngle: { max: 8 },
        kneeSymmetry: { avg: 5 },
        kneeAlignment: { avg: 0.01 },
        hipBelowKnee: { min: 1 },
        kneeValgus: { avg: 0.01 },
      },
      phases: {},
    },
  });

  const highQuality = makeRep({ score: 0.95, level: 'HIGH', factor: 1 });
  const lowQuality = makeRep({ score: 0.35, level: 'LOW', factor: 0.7 });

  assert.equal(lowQuality.score, highQuality.score);
});

test('session export keeps final score posture-based when quality-gate withhold ratio is high', () => {
  const buffer = new window.SessionBuffer('strict-withhold-cap', {
    resultBasis: 'REPS',
  });

  buffer.addRep({ repNumber: 1, score: 95 });
  buffer.addRep({ repNumber: 2, score: 95 });
  buffer.recordEvent({ type: 'QUALITY_GATE_WITHHOLD', withhold_reason: 'view_unstable' });
  buffer.recordEvent({ type: 'QUALITY_GATE_WITHHOLD', withhold_reason: 'view_unstable' });
  buffer.recordEvent({ type: 'QUALITY_GATE_WITHHOLD', withhold_reason: 'joints_missing' });

  const exported = buffer.export();

  assert.equal(exported.withhold_count, 3);
  assert.equal(exported.withhold_ratio, 0.6);
  assert.equal(exported.score_cap_applied, null);
  assert.equal(exported.final_score, 95);
});
