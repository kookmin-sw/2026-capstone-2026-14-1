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

function createScoringEngine() {
  return {
    pickMetric(summary, phases, metricKey, statKey) {
      return summary.metricStats?.[metricKey]?.[statKey] ?? null;
    },
    pickPhaseMetric(summary, phases, metricKey, statKey) {
      return summary.metricStats?.[metricKey]?.[statKey] ?? null;
    },
    getProfileMetricConfig(metricKey, fallbackTitle) {
      return {
        metric_id: metricKey,
        title: fallbackTitle,
      };
    },
  };
}

function scoreSquatRep({ view = 'SIDE', confidence, flags, metricStats, extraSummary = {} }) {
  const squatModule = window.WorkoutExerciseRegistry.get('squat');
  assert.ok(squatModule, 'squat module must be registered');

  return squatModule.scoreRep(createScoringEngine(), {
    repNumber: 1,
    selectedView: view,
    score: 90,
    summary: {
      dominantView: view,
      confidence: confidence || { score: 0.95, level: 'HIGH', factor: 1 },
      flags: {
        bottomReached: true,
        lockoutReached: true,
        ...flags,
      },
      metricStats,
      ...extraSummary,
    },
  });
}

function baseMetrics(overrides = {}) {
  return {
    kneeAngle: { min: 92, max: 170 },
    hipAngle: { min: 105, max: 165 },
    spineAngle: { max: 12 },
    kneeSymmetry: { avg: 2 },
    kneeAlignment: { avg: 0.02 },
    trunkTibiaAngle: { max: 8 },
    heelContact: { avg: 0.95 },
    hipBelowKnee: { min: 1 },
    kneeValgus: { avg: 0.02 },
    ...overrides,
  };
}

function assertRepResultContract(result) {
  assert.ok(Object.hasOwn(result, 'score'), 'result must include score');
  assert.ok(Object.hasOwn(result, 'status'), 'result must include status');
  assert.ok(Object.hasOwn(result, 'primaryFeedback'), 'result must include primaryFeedback');
  assert.ok(Array.isArray(result.hardFails), 'result must include hardFails array');
  assert.ok(result.rawMetrics && typeof result.rawMetrics === 'object', 'result must include rawMetrics object');
}

function findMetric(result, key) {
  const metric = result.breakdown.find((item) => item.key === key);
  assert.ok(metric, `${key} must be present in breakdown`);
  return metric;
}

test('SQ-01 normal front squat returns a valid high-scoring rep', () => {
  const result = scoreSquatRep({
    view: 'FRONT',
    metricStats: baseMetrics({
      kneeAngle: { min: 92, max: 170 },
      spineAngle: { max: 10 },
      kneeSymmetry: { avg: 3 },
      kneeValgus: { avg: 0.02 },
    }),
  });

  assertRepResultContract(result);
  assert.equal(result.status, 'VALID_REP');
  assert.ok(result.score >= 80);
  assert.equal(result.hardFails.length, 0);
  assert.equal(Number.isFinite(result.rawMetrics.bottomKnee), true);
});

test('SQ-02 normal side squat returns a valid high-scoring rep', () => {
  const result = scoreSquatRep({
    view: 'SIDE',
    metricStats: baseMetrics({
      kneeAngle: { min: 94, max: 170 },
      hipAngle: { min: 108, max: 165 },
      trunkTibiaAngle: { max: 9 },
      heelContact: { avg: 0.92 },
    }),
  });

  assertRepResultContract(result);
  assert.equal(result.status, 'VALID_REP');
  assert.ok(result.score >= 80);
  assert.equal(result.hardFails.length, 0);
  assert.equal(Number.isFinite(result.rawMetrics.bottomKnee), true);
});

test('SQ-03 shallow squat is capped or marked partial even when other metrics are good', () => {
  const result = scoreSquatRep({
    view: 'SIDE',
    metricStats: baseMetrics({
      kneeAngle: { min: 125, max: 170 },
      hipAngle: { min: 105, max: 165 },
      spineAngle: { max: 10 },
      trunkTibiaAngle: { max: 7 },
      heelContact: { avg: 0.96 },
      hipBelowKnee: { min: 0 },
    }),
  });

  assertRepResultContract(result);
  assert.ok(result.score <= 65 || result.status === 'PARTIAL_REP');
  assert.ok(result.rawMetrics.bottomKnee >= 120);
});

test('Phase 1 shallow squat at 112 degrees is capped to 70 even with otherwise strong side metrics', () => {
  const result = scoreSquatRep({
    view: 'SIDE',
    metricStats: baseMetrics({
      kneeAngle: { min: 112, max: 170 },
      hipAngle: { min: 105, max: 165 },
      spineAngle: { max: 10 },
      trunkTibiaAngle: { max: 7 },
      heelContact: { avg: 0.96 },
      hipBelowKnee: { min: 0 },
    }),
  });

  assertRepResultContract(result);
  assert.equal(result.status, 'VALID_REP');
  assert.ok(result.softFails.includes('depth'));
  assert.ok(result.score <= 70);
});

test('Phase 1 shallow squat past partial range is hard failed and capped to 45', () => {
  const result = scoreSquatRep({
    view: 'SIDE',
    metricStats: baseMetrics({
      kneeAngle: { min: 121, max: 170 },
      hipAngle: { min: 105, max: 165 },
      spineAngle: { max: 10 },
      trunkTibiaAngle: { max: 7 },
      heelContact: { avg: 0.96 },
      hipBelowKnee: { min: 0 },
    }),
  });

  assertRepResultContract(result);
  assert.equal(result.status, 'PARTIAL_REP');
  assert.ok(result.hardFails.includes('depth_not_reached'));
  assert.ok(result.score <= 45);
});

test('Phase 2 final squat depth uses bottom median before brief deepest frames', () => {
  const result = scoreSquatRep({
    view: 'SIDE',
    metricStats: baseMetrics({
      kneeAngle: { min: 96, max: 170 },
      hipAngle: { min: 105, max: 165 },
      spineAngle: { max: 10 },
      trunkTibiaAngle: { max: 7 },
      heelContact: { avg: 0.96 },
      hipBelowKnee: { min: 0 },
    }),
    extraSummary: {
      phases: {
        BOTTOM: {
          robust: {
            bottomKneeMedian: 118,
            bottomKneeLow10Avg: 96,
            sampleCounts: { kneeAngle: 10 },
            hipBelowKnee: 0,
            hipNearKnee: 0,
            heelContactAvg: 0.96,
          },
        },
      },
    },
  });

  assertRepResultContract(result);
  assert.equal(result.rawMetrics.bottomKnee, 118);
  assert.equal(result.status, 'PARTIAL_REP');
  assert.ok(result.hardFails.includes('depth_not_reached'));
  assert.ok(result.score <= 45);
});

test('Phase 2 squat is capped when good depth is only a brief moment', () => {
  const result = scoreSquatRep({
    view: 'SIDE',
    metricStats: baseMetrics({
      kneeAngle: { min: 94, max: 170 },
      hipAngle: { min: 105, max: 165 },
      spineAngle: { max: 10 },
      trunkTibiaAngle: { max: 7 },
      heelContact: { avg: 0.96 },
      hipBelowKnee: { min: 1 },
    }),
    extraSummary: {
      phases: {
        BOTTOM: {
          robust: {
            bottomKneeMedian: 100,
            bottomKneeLow10Avg: 94,
            depthGoodRatio: 0.25,
            depthPartialRatio: 0.75,
            sampleCounts: { kneeAngle: 12 },
            hipBelowKnee: 1,
            hipNearKnee: 1,
            heelContactAvg: 0.96,
          },
        },
      },
    },
  });

  assertRepResultContract(result);
  assert.equal(result.status, 'PARTIAL_REP');
  assert.ok(result.hardFails.includes('depth_not_held'));
  assert.ok(result.score <= 55);
  assert.equal(findMetric(result, 'depth').normalizedScore, 55);
});

test('SQ-04 front knee valgus gets primary feedback priority', () => {
  const result = scoreSquatRep({
    view: 'FRONT',
    metricStats: baseMetrics({
      kneeAngle: { min: 94, max: 170 },
      kneeSymmetry: { avg: 4 },
      kneeValgus: { avg: 0.13 },
      hipBelowKnee: { min: 1 },
    }),
  });

  assertRepResultContract(result);
  assert.equal(result.status, 'PARTIAL_REP');
  assert.ok(result.hardFails.includes('severe_knee_valgus'));
  assert.ok(result.score <= 50);
  assert.match(result.primaryFeedback, /무릎|knee/i);
  assert.match(result.primaryFeedback, /안쪽|valgus/i);
});

test('Phase 1 severe front knee valgus is hard failed and capped to 50', () => {
  const result = scoreSquatRep({
    view: 'FRONT',
    metricStats: baseMetrics({
      kneeAngle: { min: 94, max: 170 },
      kneeSymmetry: { avg: 4 },
      kneeValgus: { avg: 0.10 },
      hipBelowKnee: { min: 1 },
    }),
  });

  assertRepResultContract(result);
  assert.equal(result.status, 'PARTIAL_REP');
  assert.ok(result.hardFails.includes('severe_knee_valgus'));
  assert.ok(result.score <= 50);
  assert.match(result.primaryFeedback, /무릎|knee/i);
});

test('Phase 2 front knee valgus uses bad-frame severity for fail and card score', () => {
  const result = scoreSquatRep({
    view: 'FRONT',
    metricStats: baseMetrics({
      kneeAngle: { min: 94, max: 170 },
      kneeSymmetry: { avg: 4 },
      kneeValgus: { avg: 0.02 },
      hipBelowKnee: { min: 1 },
    }),
    extraSummary: {
      phases: {
        BOTTOM: {
          robust: {
            valgusAvg: 0.02,
            valgusP90: 0.10,
            valgusBadRatio: 0.4,
          },
        },
      },
    },
  });

  assertRepResultContract(result);
  assert.equal(result.status, 'PARTIAL_REP');
  assert.ok(result.hardFails.includes('severe_knee_valgus'));
  assert.ok(result.score <= 50);
  assert.ok(findMetric(result, 'knee_valgus').normalizedScore <= 50);
});

test('Phase 1 moderate front knee valgus is a soft fail and capped to 80', () => {
  const result = scoreSquatRep({
    view: 'FRONT',
    metricStats: baseMetrics({
      kneeAngle: { min: 94, max: 170 },
      kneeSymmetry: { avg: 4 },
      kneeValgus: { avg: 0.08 },
      hipBelowKnee: { min: 1 },
    }),
  });

  assertRepResultContract(result);
  assert.equal(result.status, 'VALID_REP');
  assert.ok(result.softFails.includes('knee_valgus'));
  assert.ok(result.score <= 80);
});

test('SQ-05 incomplete lockout becomes a partial rep or receives the lockout cap', () => {
  const result = scoreSquatRep({
    view: 'SIDE',
    flags: { lockoutReached: false },
    metricStats: baseMetrics({
      kneeAngle: { min: 92, max: 138 },
      hipAngle: { min: 105, max: 130 },
    }),
  });

  assertRepResultContract(result);
  assert.ok(result.status === 'PARTIAL_REP' || result.score <= 65);
  assert.ok(result.hardFails.includes('lockout_incomplete'));
});

test('SQ-06 raised heel gets heel-contact primary feedback in side view', () => {
  const result = scoreSquatRep({
    view: 'SIDE',
    metricStats: baseMetrics({
      heelContact: { avg: 0.42 },
      kneeAngle: { min: 94, max: 170 },
      hipAngle: { min: 106, max: 165 },
      trunkTibiaAngle: { max: 8 },
    }),
  });

  assertRepResultContract(result);
  assert.equal(result.status, 'VALID_REP');
  assert.match(result.primaryFeedback, /뒤꿈치|heel/i);
});

test('Phase 1 repeated heel lift caps side squat score by break-frame severity', () => {
  const result = scoreSquatRep({
    view: 'SIDE',
    metricStats: baseMetrics({
      kneeAngle: { min: 94, max: 170 },
      hipAngle: { min: 106, max: 165 },
      trunkTibiaAngle: { max: 8 },
      heelContact: { avg: 0.92 },
    }),
    extraSummary: {
      phases: {
        BOTTOM: {
          robust: {
            heelContactAvg: 0.92,
            heelContactBreakFrames: 5,
          },
        },
      },
    },
  });

  assertRepResultContract(result);
  assert.equal(result.status, 'VALID_REP');
  assert.ok(result.softFails.includes('heel_contact'));
  assert.ok(result.score <= 70);
});

test('SQ-07 excessive trunk imbalance gets trunk feedback in side view', () => {
  const result = scoreSquatRep({
    view: 'SIDE',
    metricStats: baseMetrics({
      trunkTibiaAngle: { max: 42 },
      spineAngle: { max: 50 },
      kneeAngle: { min: 94, max: 170 },
      hipAngle: { min: 106, max: 165 },
    }),
  });

  assertRepResultContract(result);
  assert.equal(result.status, 'VALID_REP');
  assert.match(result.primaryFeedback, /상체|평행|trunk|tibia/i);
});

test('SQ-08 diagonal camera returns hold camera without a score', () => {
  const result = scoreSquatRep({
    view: 'DIAGONAL',
    metricStats: baseMetrics(),
  });

  assertRepResultContract(result);
  assert.equal(result.status, 'HOLD_CAMERA');
  assert.equal(result.score, null);
  assert.match(result.primaryFeedback, /정면|측면/);
});

test('SQ-09 lower body cut off returns hold visibility without a score', () => {
  const result = scoreSquatRep({
    view: 'SIDE',
    confidence: { score: 0.35, level: 'LOW', factor: 0.7 },
    metricStats: baseMetrics({
      kneeAngle: { min: null, max: null },
      hipAngle: { min: null, max: null },
      heelContact: { avg: null },
      hipBelowKnee: { min: null },
    }),
    extraSummary: {
      visibility: {
        lowerBody: 0.25,
        ankles: 0.20,
        knees: 0.30,
      },
    },
  });

  assertRepResultContract(result);
  assert.equal(result.status, 'HOLD_VISIBILITY');
  assert.equal(result.score, null);
  assert.match(result.primaryFeedback, /하체|전신|카메라/);
});

test('SQ-10 low light returns hold confidence or stays under the confidence cap', () => {
  const result = scoreSquatRep({
    view: 'SIDE',
    confidence: { score: 0.45, level: 'LOW', factor: 0.7 },
    metricStats: baseMetrics({
      kneeAngle: { min: 94, max: 170 },
      hipAngle: { min: 108, max: 165 },
      trunkTibiaAngle: { max: 9 },
      heelContact: { avg: 0.92 },
    }),
    extraSummary: {
      visibility: {
        lowerBody: 0.85,
        ankles: 0.80,
        knees: 0.82,
      },
    },
  });

  assertRepResultContract(result);
  if (result.score === null) {
    assert.ok(
      ['HOLD_CONFIDENCE', 'HOLD_CAMERA'].includes(result.status),
      'low side capture confidence should yield a held rep without numeric score'
    );
  } else {
    assert.ok(result.score <= 60);
  }
});

test('lockout baseline accepts knee and hip returning near the standing baseline', () => {
  const result = scoreSquatRep({
    view: 'SIDE',
    metricStats: baseMetrics({
      kneeAngle: { min: 94, max: 162 },
      hipAngle: { min: 108, max: 154 },
    }),
    extraSummary: {
      standingBaseline: {
        kneeAngle: 174,
        hipAngle: 170,
      },
    },
  });

  assertRepResultContract(result);
  assert.equal(result.status, 'VALID_REP');
  assert.equal(result.hardFails.includes('lockout_incomplete'), false);
  assert.equal(result.rawMetrics.lockoutKnee, 162);
  assert.equal(result.rawMetrics.lockoutHip, 154);
});

test('lockout baseline marks a rep partial when knee or hip does not return near baseline', () => {
  const result = scoreSquatRep({
    view: 'SIDE',
    metricStats: baseMetrics({
      kneeAngle: { min: 94, max: 150 },
      hipAngle: { min: 108, max: 145 },
    }),
    extraSummary: {
      standingBaseline: {
        kneeAngle: 174,
        hipAngle: 170,
      },
    },
  });

  assertRepResultContract(result);
  assert.equal(result.status, 'PARTIAL_REP');
  assert.ok(result.hardFails.includes('lockout_incomplete'));
  assert.ok(result.score <= 65);
});

test('lockout baseline falls back to the fixed knee threshold when baseline is missing', () => {
  const passResult = scoreSquatRep({
    view: 'SIDE',
    metricStats: baseMetrics({
      kneeAngle: { min: 94, max: 151 },
      hipAngle: { min: 108, max: 132 },
    }),
  });
  const failResult = scoreSquatRep({
    view: 'SIDE',
    metricStats: baseMetrics({
      kneeAngle: { min: 94, max: 149 },
      hipAngle: { min: 108, max: 165 },
    }),
  });

  assertRepResultContract(passResult);
  assertRepResultContract(failResult);
  assert.equal(passResult.hardFails.includes('lockout_incomplete'), false);
  assert.ok(failResult.hardFails.includes('lockout_incomplete'));
});

test('Phase 2 depth cap is continuous around the 130 degree boundary', () => {
  const at130 = scoreSquatRep({
    view: 'SIDE',
    metricStats: baseMetrics({
      kneeAngle: { min: 130, max: 170 },
      hipAngle: { min: 105, max: 165 },
      spineAngle: { max: 10 },
      trunkTibiaAngle: { max: 7 },
      heelContact: { avg: 0.96 },
      hipBelowKnee: { min: 0 },
    }),
  });
  const at131 = scoreSquatRep({
    view: 'SIDE',
    metricStats: baseMetrics({
      kneeAngle: { min: 131, max: 170 },
      hipAngle: { min: 105, max: 165 },
      spineAngle: { max: 10 },
      trunkTibiaAngle: { max: 7 },
      heelContact: { avg: 0.96 },
      hipBelowKnee: { min: 0 },
    }),
  });

  assertRepResultContract(at130);
  assertRepResultContract(at131);
  assert.ok(at130.score <= 55);
  assert.ok(at131.score <= 55);
  assert.ok(Math.abs(at130.score - at131.score) <= 3);
});

test('Phase 2 front and side scoring weights follow the config contract', () => {
  const front = scoreSquatRep({
    view: 'FRONT',
    metricStats: baseMetrics({
      kneeAngle: { min: 95, max: 170 },
      kneeValgus: { avg: 0.02 },
      kneeSymmetry: { avg: 3 },
      spineAngle: { max: 12 },
    }),
  });
  const side = scoreSquatRep({
    view: 'SIDE',
    metricStats: baseMetrics({
      kneeAngle: { min: 95, max: 170 },
      hipAngle: { min: 108, max: 165 },
      trunkTibiaAngle: { max: 9 },
      spineAngle: { max: 12 },
      heelContact: { avg: 0.92 },
      kneeAlignment: { avg: 0.02 },
    }),
  });

  assert.equal(front.breakdown.find((item) => item.key === 'knee_valgus').configuredWeight, 0.40);
  assert.equal(front.breakdown.find((item) => item.key === 'depth').configuredWeight, 0.25);
  assert.equal(front.breakdown.find((item) => item.key === 'knee_symmetry').configuredWeight, 0.20);
  assert.equal(front.breakdown.find((item) => item.key === 'trunk_stability').configuredWeight, 0.15);
  assert.equal(side.breakdown.find((item) => item.key === 'depth').configuredWeight, 0.34);
  assert.equal(side.breakdown.find((item) => item.key === 'trunk_tibia_angle').configuredWeight, 0.26);
  assert.equal(side.breakdown.find((item) => item.key === 'hip_angle').configuredWeight, 0.16);
  assert.equal(side.breakdown.find((item) => item.key === 'trunk_stability').configuredWeight, 0.14);
  assert.equal(side.breakdown.find((item) => item.key === 'heel_contact').configuredWeight, 0.10);
  assert.equal(side.breakdown.some((item) => item.key === 'knee_alignment'), false);
  const sideWeightSum = side.breakdown.reduce((s, item) => s + item.configuredWeight, 0);
  assert.ok(Math.abs(sideWeightSum - 1) < 1e-6, 'SIDE metric weights must sum to 1');
});

test('Phase 1 side trunk-tibia mismatch below 85 receives feedback and stronger penalty', () => {
  const result = scoreSquatRep({
    view: 'SIDE',
    metricStats: baseMetrics({
      kneeAngle: { min: 94, max: 170 },
      hipAngle: { min: 108, max: 165 },
      trunkTibiaAngle: { max: 15 },
      spineAngle: { max: 12 },
      heelContact: { avg: 0.92 },
    }),
  });

  const trunkTibia = result.breakdown.find((item) => item.key === 'trunk_tibia_angle');

  assert.ok(trunkTibia, 'trunk_tibia_angle metric should be present');
  assert.equal(trunkTibia.normalizedScore, 75);
  assert.match(trunkTibia.feedback, /상체|평행|다리/);
});

test('Phase 2 trunk stability uses the relaxed trunk lean curve', () => {
  const result = scoreSquatRep({
    view: 'SIDE',
    metricStats: baseMetrics({
      kneeAngle: { min: 95, max: 170 },
      hipAngle: { min: 108, max: 165 },
      spineAngle: { max: 24 },
      trunkTibiaAngle: { max: 9 },
    }),
  });

  const trunk = result.breakdown.find((item) => item.key === 'trunk_stability');
  assert.ok(trunk, 'trunk_stability metric should be present');
  assert.equal(trunk.normalizedScore, 100);
});

test('Phase 2 trunk stability curve penalizes forward lean more aggressively', () => {
  const scoreForSpine = (maxSpine) => {
    const result = scoreSquatRep({
      view: 'SIDE',
      metricStats: baseMetrics({
        kneeAngle: { min: 95, max: 170 },
        hipAngle: { min: 108, max: 165 },
        spineAngle: { max: maxSpine },
        trunkTibiaAngle: { max: 9 },
        heelContact: { avg: 0.92 },
      }),
    });

    const trunk = result.breakdown.find((item) => item.key === 'trunk_stability');
    assert.ok(trunk, 'trunk_stability metric should be present');
    return trunk.normalizedScore;
  };

  assert.equal(scoreForSpine(35), 70);
  assert.equal(scoreForSpine(45), 35);
  assert.equal(scoreForSpine(60), 10);
});
