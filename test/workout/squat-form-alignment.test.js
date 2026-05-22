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
require('../../public/js/workout/rep-counter.js');
const { ScoringEngine } = require('../../public/js/workout/scoring-engine.js');

const { PoseEngine, LANDMARKS } = require('../../public/js/workout/pose-engine.js');

function createLandmarks(overrides = {}) {
  const landmarks = new Array(33).fill(null).map(() => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 0.99,
  }));

  const defaults = {
    [LANDMARKS.LEFT_SHOULDER]: { x: 0.42, y: 0.35 },
    [LANDMARKS.RIGHT_SHOULDER]: { x: 0.58, y: 0.35 },
    [LANDMARKS.LEFT_HIP]: { x: 0.45, y: 0.80 },
    [LANDMARKS.RIGHT_HIP]: { x: 0.55, y: 0.80 },
    [LANDMARKS.LEFT_KNEE]: { x: 0.46, y: 0.68 },
    [LANDMARKS.RIGHT_KNEE]: { x: 0.54, y: 0.68 },
    [LANDMARKS.LEFT_ANKLE]: { x: 0.47, y: 0.90 },
    [LANDMARKS.RIGHT_ANKLE]: { x: 0.53, y: 0.90 },
    [LANDMARKS.LEFT_HEEL]: { x: 0.45, y: 0.95 },
    [LANDMARKS.RIGHT_HEEL]: { x: 0.55, y: 0.95 },
    [LANDMARKS.LEFT_FOOT_INDEX]: { x: 0.49, y: 0.94 },
    [LANDMARKS.RIGHT_FOOT_INDEX]: { x: 0.59, y: 0.94 },
  };

  Object.entries(defaults).forEach(([index, point]) => {
    Object.assign(landmarks[Number(index)], point);
  });

  Object.entries(overrides).forEach(([index, point]) => {
    Object.assign(landmarks[Number(index)], point);
  });

  return landmarks;
}

test('PoseEngine.calculateAllAngles emits squat support signals', () => {
  const engine = new PoseEngine();
  const landmarks = createLandmarks();
  const angles = engine.calculateAllAngles(landmarks);

  assert.ok(Number.isFinite(angles.tibia), 'tibia must be computed');
  assert.ok(Number.isFinite(angles.trunkTibiaAngle), 'trunkTibiaAngle must be computed');
  assert.equal(angles.heelContact, true, 'heelContact must be true when heels stay down');
  assert.equal(angles.hipBelowKnee, true, 'hipBelowKnee must detect parallel-or-below depth');
  assert.ok(Number.isFinite(angles.kneeAlignment.left), 'kneeAlignment.left must be finite');
  assert.ok(Number.isFinite(angles.kneeAlignment.right), 'kneeAlignment.right must be finite');
});

test('PoseEngine.getHeelContact detects raised heel', () => {
  const engine = new PoseEngine();
  const landmarks = createLandmarks({
    [LANDMARKS.LEFT_HEEL]: { y: 0.86 },
  });

  assert.equal(engine.getHeelContact(landmarks), false);
});

test('PoseEngine.getHeelContact uses visible side in side view', () => {
  const engine = new PoseEngine();
  const landmarks = createLandmarks({
    [LANDMARKS.LEFT_HEEL]: { y: 0.95, visibility: 0.99 },
    [LANDMARKS.LEFT_FOOT_INDEX]: { y: 0.94, visibility: 0.99 },
    [LANDMARKS.RIGHT_HEEL]: { y: 0.82, visibility: 0.99 },
    [LANDMARKS.RIGHT_FOOT_INDEX]: { y: 0.94, visibility: 0.99 },
  });

  assert.equal(engine.getHeelContact(landmarks), false);
  assert.equal(engine.getHeelContact(landmarks, { view: 'SIDE', visibleSide: 'left' }), true);
});

test('squat module removes lumbar metric from active default profile', () => {
  const squatModule = window.WorkoutExerciseRegistry.get('squat');
  assert.ok(squatModule, 'squat module must be registered');

  const metricKeys = squatModule.getDefaultProfileMetrics().map((item) => item.metric.key);
  assert.equal(metricKeys.includes('lumbar_angle'), false);
});

test('squat module no longer exposes getFrameGate', () => {
  const squatModule = window.WorkoutExerciseRegistry.get('squat');
  assert.ok(squatModule, 'squat module must be registered');
  assert.equal(typeof squatModule.getFrameGate, 'undefined');
});

test('RepCounter metric stats accumulate boolean squat signals', () => {
  const repCounter = new window.RepCounter('squat');
  const stats = repCounter.createMetricStats();

  repCounter.updateMetricStats(stats, true);
  repCounter.updateMetricStats(stats, false);
  repCounter.updateMetricStats(stats, true);

  assert.deepEqual(repCounter.finalizeMetricStats(stats), {
    min: 0,
    max: 1,
    avg: 0.7,
    count: 3,
  });
});

test('squat live feedback removes heel contact cue for front view', () => {
  const squatModule = window.WorkoutExerciseRegistry.get('squat');
  const filtered = squatModule.filterLiveFeedback({
    score: 82,
    breakdown: [
      { key: 'heel_contact', title: '뒤꿈치 접지', score: 0, maxScore: 10, feedback: '뒤꿈치가 떨어지지 않도록 유지해주세요' },
      { key: 'depth', title: '스쿼트 깊이', score: 8, maxScore: 10, feedback: null },
    ],
  }, {
    repCounter: {
      currentPhase: window.REP_PHASES.BOTTOM,
      currentState: window.REP_STATES.ACTIVE,
    },
    angles: {
      view: 'FRONT',
    },
  });

  assert.deepEqual(filtered.breakdown.map((item) => item.key), ['depth']);
});

test('squat live feedback keeps knee alignment cue for front view', () => {
  const squatModule = window.WorkoutExerciseRegistry.get('squat');
  const filtered = squatModule.filterLiveFeedback({
    score: 82,
    breakdown: [
      { key: 'knee_alignment', title: '무릎 정렬', score: 4, maxScore: 10, feedback: '무릎이 발끝 방향을 유지하도록 해주세요' },
      { key: 'knee_valgus', title: '무릎 안쪽 무너짐', score: 4, maxScore: 10, feedback: '무릎이 안쪽으로 무너지지 않도록 바깥쪽 힘으로 밀어주세요' },
      { key: 'depth', title: '스쿼트 깊이', score: 8, maxScore: 10, feedback: null },
    ],
  }, {
    repCounter: {
      currentPhase: window.REP_PHASES.BOTTOM,
      currentState: window.REP_STATES.ACTIVE,
    },
    angles: {
      view: 'FRONT',
    },
  });

  assert.deepEqual(filtered.breakdown.map((item) => item.key), ['knee_alignment', 'knee_valgus', 'depth']);
});

test('squat live knee alignment uses continuous alignment curve instead of binary flag', () => {
  const squatModule = window.WorkoutExerciseRegistry.get('squat');
  const kneeAlignmentMetric = squatModule.getDefaultProfileMetrics()
    .find((item) => item.metric.key === 'knee_alignment');
  const scoringEngine = new ScoringEngine({ scoring_profile_metric: [kneeAlignmentMetric] }, {
    exerciseCode: 'squat',
    selectedView: 'FRONT',
  });

  const mild = scoringEngine.calculate({
    view: 'FRONT',
    kneeAlignment: { left: 0.04, right: 0.04, isAligned: true },
  }).breakdown.find((item) => item.key === 'knee_alignment');

  const poor = scoringEngine.calculate({
    view: 'FRONT',
    kneeAlignment: { left: 0.09, right: 0.09, isAligned: false },
  }).breakdown.find((item) => item.key === 'knee_alignment');

  assert.ok(mild, 'knee_alignment must be scored live');
  assert.equal(mild.actualValue, 0.04);
  assert.ok(mild.normalizedScore < 100, 'mild deviation must not stay at 100');
  assert.ok(mild.normalizedScore > 80, 'mild deviation should remain a warning-level score');
  assert.ok(poor.normalizedScore < 40, 'poor alignment should follow the strict alignment curve');
});

test('PoseEngine visual feedback maps squat trunk metrics to torso skeleton', () => {
  const engine = new PoseEngine();

  engine.setVisualFeedback([
    { key: 'trunk_tibia_angle', score: 4, maxScore: 15 },
    { key: 'trunk_stability', score: 4, maxScore: 15 },
  ]);

  assert.equal(engine.getLandmarkSeverity(LANDMARKS.LEFT_SHOULDER), 2);
  assert.equal(engine.getLandmarkSeverity(LANDMARKS.RIGHT_HIP), 2);
  assert.equal(engine.getConnectionSeverity(LANDMARKS.LEFT_SHOULDER, LANDMARKS.LEFT_HIP), 2);
});

test('squat live trunk-tibia scoring keeps corrective feedback for TTS', () => {
  const squatModule = window.WorkoutExerciseRegistry.get('squat');
  const trunkTibiaMetric = squatModule.getDefaultProfileMetrics()
    .find((item) => item.metric.key === 'trunk_tibia_angle');
  const scoringEngine = new ScoringEngine({ scoring_profile_metric: [trunkTibiaMetric] }, {
    exerciseCode: 'squat',
    selectedView: 'SIDE',
  });

  const scoreResult = scoringEngine.calculate({
    view: 'SIDE',
    spine: 48,
    tibia: 8,
  });
  const trunkTibia = scoreResult.breakdown.find((item) => item.key === 'trunk_tibia_angle');

  assert.ok(trunkTibia, 'trunk_tibia_angle must be scored live');
  assert.equal(trunkTibia.actualValue, 40);
  assert.notEqual(trunkTibia.feedback, '상체가 너무 누워있습니다');
  assert.equal(trunkTibia.feedback, '상체와 다리가 평행하도록 자세를 유지해주세요');
});

test('squat rep scoring uses averaged heel contact instead of single-frame min', () => {
  const squatModule = window.WorkoutExerciseRegistry.get('squat');
  const scoringEngine = {
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

  const repRecord = {
    repNumber: 1,
    selectedView: 'SIDE',
    score: 80,
    summary: {
      dominantView: 'SIDE',
      confidence: { score: 0.9, level: 'HIGH', factor: 1 },
      flags: { bottomReached: true, lockoutReached: true },
      metricStats: {
        kneeAngle: { min: 90, max: 170 },
        hipAngle: { min: 100 },
        spineAngle: { max: 12 },
        kneeSymmetry: { avg: 2 },
        kneeAlignment: { avg: 0.02 },
        trunkTibiaAngle: { max: 8 },
        heelContact: { min: 0, avg: 0.8 },
        hipBelowKnee: { min: 1 },
        kneeValgus: { avg: 0.02 },
      },
    },
  };

  const scored = squatModule.scoreRep(scoringEngine, repRecord);
  const heelBreakdown = scored.breakdown.find((item) => item.key === 'heel_contact');

  assert.ok(heelBreakdown, 'heel_contact must be part of side-view scoring');
  assert.ok(heelBreakdown.normalizedScore >= 70, 'averaged heel contact should not collapse to zero');
  assert.equal(scored.feedback, '뒤꿈치가 떨어지지 않도록 유지해주세요');
});

test('squat side heel scoring weights bottom contact over a noisy ascent phase', () => {
  const squatModule = window.WorkoutExerciseRegistry.get('squat');
  const scoringEngine = {
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

  const repRecord = {
    repNumber: 1,
    selectedView: 'SIDE',
    score: 86,
    summary: {
      dominantView: 'SIDE',
      confidence: { score: 0.92, level: 'HIGH', factor: 1 },
      flags: { bottomReached: true, lockoutReached: true },
      metricStats: {
        kneeAngle: { min: 94, max: 170 },
        hipAngle: { min: 100 },
        spineAngle: { max: 12 },
        kneeSymmetry: { avg: 2 },
        kneeAlignment: { avg: 0.02 },
        trunkTibiaAngle: { max: 8 },
        heelContact: { avg: 0.68 },
        hipBelowKnee: { min: 1 },
        kneeValgus: { avg: 0.02 },
      },
      phases: {
        BOTTOM: { robust: { heelContactAvg: 1 } },
        ASCENT: { robust: { heelContactAvg: 0.55 } },
      },
    },
  };

  const scored = squatModule.scoreRep(scoringEngine, repRecord);
  const heelBreakdown = scored.breakdown.find((item) => item.key === 'heel_contact');

  assert.ok(heelBreakdown, 'heel_contact must be part of side-view scoring');
  assert.equal(heelBreakdown.rawValue, 0.865);
  assert.equal(heelBreakdown.normalizedScore, 89.5);
  assert.notEqual(scored.feedback, '뒤꿈치가 떨어지지 않도록 유지해주세요');
});

test('squat rep scoring does not cap to 55 when depth angle is sufficient but bottomReached flag is false', () => {
  const squatModule = window.WorkoutExerciseRegistry.get('squat');
  const scoringEngine = {
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

  const repRecord = {
    repNumber: 1,
    selectedView: 'SIDE',
    score: 84,
    summary: {
      dominantView: 'SIDE',
      confidence: { score: 0.92, level: 'HIGH', factor: 1 },
      flags: { bottomReached: false, lockoutReached: true },
      metricStats: {
        kneeAngle: { min: 104, max: 170 },
        hipAngle: { min: 108 },
        spineAngle: { max: 16 },
        kneeSymmetry: { avg: 3 },
        kneeAlignment: { avg: 0.02 },
        trunkTibiaAngle: { max: 12 },
        heelContact: { avg: 0.9 },
        hipBelowKnee: { min: 1 },
        kneeValgus: { avg: 0.02 },
      },
    },
  };

  const scored = squatModule.scoreRep(scoringEngine, repRecord);

  assert.ok(scored.score > 55, 'depth-adequate rep must not be capped to 55');
  assert.equal(scored.hardFails.includes('depth_not_reached'), false);
});

test('squat rep scoring still caps clearly shallow reps to 55', () => {
  const squatModule = window.WorkoutExerciseRegistry.get('squat');
  const scoringEngine = {
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

  const repRecord = {
    repNumber: 1,
    selectedView: 'SIDE',
    score: 84,
    summary: {
      dominantView: 'SIDE',
      confidence: { score: 0.92, level: 'HIGH', factor: 1 },
      flags: { bottomReached: false, lockoutReached: true },
      metricStats: {
        kneeAngle: { min: 142, max: 170 },
        hipAngle: { min: 130 },
        spineAngle: { max: 18 },
        kneeSymmetry: { avg: 3 },
        kneeAlignment: { avg: 0.02 },
        trunkTibiaAngle: { max: 14 },
        heelContact: { avg: 0.9 },
        hipBelowKnee: { min: 0 },
        kneeValgus: { avg: 0.02 },
      },
    },
  };

  const scored = squatModule.scoreRep(scoringEngine, repRecord);

  assert.equal(scored.hardFails.includes('depth_not_reached'), true);
  assert.ok(scored.score <= 55);
});

test('squat robust summary computes phase series statistics without serializing internal buffers', () => {
  const squatModule = window.WorkoutExerciseRegistry.get('squat');
  const repCounter = new window.RepCounter('squat');
  squatModule.startRepTracking(repCounter, 0);

  const frames = [
    { phase: window.REP_PHASES.DESCENT, knee: 124, spine: 14, tibia: 6, valgus: 0.02, heel: true, hipY: 0.62, kneeY: 0.70, torsoLength: 0.42 },
    { phase: window.REP_PHASES.BOTTOM, knee: 102, spine: 18, tibia: 8, valgus: 0.04, heel: true, hipY: 0.71, kneeY: 0.70, torsoLength: 0.42 },
    { phase: window.REP_PHASES.BOTTOM, knee: 96, spine: 28, tibia: 10, valgus: 0.12, heel: false, hipY: 0.735, kneeY: 0.70, torsoLength: 0.42 },
    { phase: window.REP_PHASES.ASCENT, knee: 118, spine: 22, tibia: 7, valgus: 0.13, heel: false, hipY: 0.66, kneeY: 0.70, torsoLength: 0.42 },
    { phase: window.REP_PHASES.ASCENT, knee: 154, spine: 16, tibia: 6, valgus: 0.03, heel: true, hipY: 0.56, kneeY: 0.70, torsoLength: 0.42 },
    { phase: window.REP_PHASES.LOCKOUT, knee: 168, spine: 8, tibia: 4, valgus: 0.02, heel: true, hipY: 0.50, kneeY: 0.70, torsoLength: 0.42 },
  ];

  frames.forEach((frame, index) => {
    repCounter.currentState = frame.phase === window.REP_PHASES.LOCKOUT
      ? window.REP_STATES.NEUTRAL
      : window.REP_STATES.ACTIVE;
    repCounter.bottomReached = repCounter.bottomReached || frame.phase === window.REP_PHASES.BOTTOM;
    repCounter.ascentStarted = repCounter.ascentStarted || frame.phase === window.REP_PHASES.ASCENT;
    squatModule.updateRepTracking(repCounter, {
      leftKnee: frame.knee,
      rightKnee: frame.knee + 2,
      leftHip: 110,
      rightHip: 112,
      spine: frame.spine,
      tibia: frame.tibia,
      kneeValgus: frame.valgus,
      heelContact: frame.heel,
      hipBelowKnee: frame.hipY > frame.kneeY,
      hipY: frame.hipY,
      kneeY: frame.kneeY,
      torsoLength: frame.torsoLength,
      view: 'SIDE',
      quality: { score: 0.9, level: 'HIGH' },
    }, index * 100, frame.knee, 90);
  });

  const finalized = squatModule.finalizeRepSummary(repCounter);
  const bottomRobust = finalized.phases.BOTTOM.robust;
  const overallRobust = finalized.overall.robust;

  assert.equal(Object.hasOwn(finalized.overall, '_series'), false);
  assert.equal(Object.hasOwn(finalized.phases.BOTTOM, '_series'), false);
  assert.equal(bottomRobust.bottomKneeMedian, 99);
  assert.equal(bottomRobust.bottomKneeLow10Avg, 96);
  assert.equal(bottomRobust.depthGoodRatio, 0);
  assert.equal(bottomRobust.depthPartialRatio, 1);
  assert.equal(bottomRobust.hipBelowKnee, 0);
  assert.equal(bottomRobust.hipNearKnee, 1);
  assert.equal(overallRobust.trunkLeanP90, 22);
  assert.equal(overallRobust.trunkTibiaAbsP90, 15);
  assert.equal(overallRobust.signedTrunkTibiaP90, 15);
  assert.equal(overallRobust.valgusP90, 0.12);
  assert.equal(overallRobust.valgusBadRatio, 0.333);
  assert.equal(overallRobust.heelContactAvg, 0.7);
  assert.equal(overallRobust.heelContactBreakFrames, 2);
  assert.equal(finalized.overall.robustConfidence.depth, 0.9);
  assert.equal(finalized.overall.robustConfidence.heel_contact, 0.9);
});

test('squat robust phase series is sample limited', () => {
  const squatModule = window.WorkoutExerciseRegistry.get('squat');
  const repCounter = new window.RepCounter('squat');
  squatModule.startRepTracking(repCounter, 0);

  for (let i = 0; i < 140; i += 1) {
    repCounter.currentState = window.REP_STATES.ACTIVE;
    repCounter.bottomReached = true;
    squatModule.updateRepTracking(repCounter, {
      leftKnee: 140 - i,
      rightKnee: 140 - i,
      leftHip: 110,
      rightHip: 110,
      spine: 12,
      tibia: 6,
      kneeValgus: 0.02,
      heelContact: true,
      hipBelowKnee: true,
      view: 'SIDE',
      quality: { score: 0.92, level: 'HIGH' },
    }, i * 16, 140 - i, 90);
  }

  assert.ok(repCounter.currentRepSummary.phases.BOTTOM._series.kneeAngle.length <= 90);
  const finalized = squatModule.finalizeRepSummary(repCounter);
  assert.equal(Object.hasOwn(finalized.phases.BOTTOM, '_series'), false);
  assert.ok(Number.isFinite(finalized.phases.BOTTOM.robust.bottomKneeMedian));
});

test('squat side live feedback keeps hip cue only at bottom phase', () => {
  const squatModule = window.WorkoutExerciseRegistry.get('squat');
  const scoreResult = {
    score: 58,
    breakdown: [
      { key: 'hip_angle', title: '힙 힌지', score: 0, maxScore: 20, feedback: '엉덩이를 뒤로 보내며 앉아주세요' },
      { key: 'trunk_tibia_angle', title: '상체-다리 평행도', score: 12, maxScore: 15, feedback: null },
    ],
  };

  const descent = squatModule.filterLiveFeedback(scoreResult, {
    repCounter: {
      currentPhase: window.REP_PHASES.DESCENT,
      currentState: window.REP_STATES.ACTIVE,
    },
    angles: { view: 'SIDE' },
  });
  const bottom = squatModule.filterLiveFeedback(scoreResult, {
    repCounter: {
      currentPhase: window.REP_PHASES.BOTTOM,
      currentState: window.REP_STATES.ACTIVE,
    },
    angles: { view: 'SIDE' },
  });

  assert.equal(descent.breakdown.some((item) => item.key === 'hip_angle'), false);
  assert.equal(bottom.breakdown.some((item) => item.key === 'hip_angle'), true);
});

test('squat live hip scoring uses final hip curve so deep bottom angles stay green', () => {
  const squatModule = window.WorkoutExerciseRegistry.get('squat');
  const hipMetric = squatModule.getDefaultProfileMetrics()
    .find((item) => item.metric.key === 'hip_angle');
  const scoringEngine = new ScoringEngine({ scoring_profile_metric: [hipMetric] }, {
    exerciseCode: 'squat',
    selectedView: 'SIDE',
  });

  const scoreResult = scoringEngine.calculate({
    view: 'SIDE',
    leftHip: 52,
    rightHip: null,
  });
  const hip = scoreResult.breakdown.find((item) => item.key === 'hip_angle');

  assert.ok(hip, 'hip_angle must be scored live');
  assert.equal(hip.normalizedScore, 100);
  assert.equal(hip.feedback, null);
});

test('squat side live hip scoring ignores occluded-side low hip angle when visible side is known', () => {
  const squatModule = window.WorkoutExerciseRegistry.get('squat');
  const hipMetric = squatModule.getDefaultProfileMetrics()
    .find((item) => item.metric.key === 'hip_angle');
  const scoringEngine = new ScoringEngine({ scoring_profile_metric: [hipMetric] }, {
    exerciseCode: 'squat',
    selectedView: 'SIDE',
  });

  const scoreResult = scoringEngine.calculate({
    view: 'SIDE',
    visibleSide: 'left',
    leftHip: 118,
    rightHip: 45,
  });
  const hip = scoreResult.breakdown.find((item) => item.key === 'hip_angle');

  assert.ok(hip, 'hip_angle must be scored live');
  assert.equal(hip.actualValue, 118);
  assert.ok(hip.normalizedScore >= 80);
});

test('RepCounter uses visible side hip angle for side-view squat phase decisions', () => {
  const repCounter = new window.RepCounter('squat');

  assert.equal(repCounter.getAngleValue({
    view: 'SIDE',
    visibleSide: 'left',
    leftHip: 112,
    rightHip: 45,
  }, 'hip_angle'), 112);
});

test('squat front-view rep scoring includes knee alignment in weighted breakdown', () => {
  const squatModule = window.WorkoutExerciseRegistry.get('squat');
  const scoringEngine = {
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

  const repRecord = {
    repNumber: 1,
    selectedView: 'FRONT',
    score: 86,
    summary: {
      dominantView: 'FRONT',
      confidence: { score: 0.95, level: 'HIGH', factor: 1 },
      flags: { bottomReached: true, lockoutReached: true },
      metricStats: {
        kneeAngle: { min: 102, max: 170 },
        hipAngle: { min: 110 },
        spineAngle: { max: 10 },
        kneeSymmetry: { avg: 4 },
        kneeAlignment: { avg: 0.09 },
        trunkTibiaAngle: { max: 12 },
        heelContact: { avg: 0.9 },
        hipBelowKnee: { min: 1 },
        kneeValgus: { avg: 0.02 },
      },
    },
  };

  const scored = squatModule.scoreRep(scoringEngine, repRecord);

  assert.equal(scored.view, 'FRONT');
  assert.equal(scored.breakdown.some((item) => item.key === 'knee_alignment'), true);
  assert.equal(scored.breakdown.some((item) => item.key === 'knee_valgus'), true);
});
