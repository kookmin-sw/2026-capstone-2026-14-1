# Runtime Evaluation Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add runtime-first quality gating, exercise-specific fail separation, and export-based validation so low-quality pose input is withheld instead of mis-scored.

**Architecture:** Keep the existing runtime pipeline, but standardize quality-gate inputs in `pose-engine.js`, evaluate pass/withhold in `scoring-engine.js`, surface guidance in `session-controller.js`, refine exercise-specific failure logic in the squat/push-up modules, and persist MVP verification data in `session-buffer.js`. Prefer pure helper functions with CommonJS export guards for Node testability rather than introducing new runtime layers or DB changes.

**Tech Stack:** Browser JavaScript, Node `--test`, CommonJS test exports, localStorage-backed session buffering

---

## File Map

### Runtime files to modify
- `public/js/workout/pose-engine.js`
  - Add a normalized gate-input summary builder for frame inclusion, key-joint visibility, estimated view, stability, and stable-frame streak.
- `public/js/workout/scoring-engine.js`
  - Add threshold constants, `evaluateQualityGate`, rep outcome state transitions, and CommonJS test exports.
- `public/js/workout/session-controller.js`
  - Add gate-aware UI messaging, withhold suppression, and resume-after-stability logic.
- `public/js/workout/exercises/squat-exercise.js`
  - Add view-aware metric priority rules and keep only movement-quality failures in exercise evaluation.
- `public/js/workout/exercises/push-up-exercise.js`
  - Remove confidence/view failures from exercise reasons and keep only movement-quality failures.
- `public/js/workout/session-buffer.js`
  - Add MVP export fields for withhold events and rep outcome summaries.

### Test files to create or modify
- Create: `test/workout/quality-gate.test.js`
- Create: `test/workout/scoring-state-machine.test.js`
- Create: `test/workout/session-controller-gate-ui.test.js`
- Create: `test/workout/exercise-rule-separation.test.js`
- Modify: `test/session-buffer.test.js`

### Validation docs to create
- Create: `docs/superpowers/validation/video-label-template.md`

---

### Task 1: Standardize quality-gate inputs and thresholds

**Files:**
- Modify: `public/js/workout/pose-engine.js`
- Modify: `public/js/workout/scoring-engine.js`
- Test: `test/workout/quality-gate.test.js`

- [ ] **Step 1: Write the failing quality-gate tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  QUALITY_GATE_THRESHOLDS,
  evaluateQualityGate,
} = require('../../public/js/workout/scoring-engine.js');

test('evaluateQualityGate returns withhold for low key-joint visibility', () => {
  const result = evaluateQualityGate({
    frameInclusionRatio: 0.92,
    keyJointVisibilityAverage: 0.51,
    minKeyJointVisibility: 0.48,
    estimatedView: 'SIDE',
    estimatedViewConfidence: 0.83,
    detectionConfidence: 0.91,
    trackingConfidence: 0.90,
    stableFrameCount: 12,
    unstableFrameRatio: 0.08,
    cameraDistanceOk: true,
  }, {
    allowedViews: ['SIDE'],
    selectedView: 'SIDE',
  });

  assert.equal(result.result, 'withhold');
  assert.equal(result.reason, 'key_joints_not_visible');
});

test('evaluateQualityGate returns pass when all seed thresholds are met', () => {
  const result = evaluateQualityGate({
    frameInclusionRatio: 0.95,
    keyJointVisibilityAverage: 0.80,
    minKeyJointVisibility: 0.71,
    estimatedView: 'SIDE',
    estimatedViewConfidence: 0.79,
    detectionConfidence: 0.92,
    trackingConfidence: 0.93,
    stableFrameCount: QUALITY_GATE_THRESHOLDS.stableFrameCount,
    unstableFrameRatio: 0.10,
    cameraDistanceOk: true,
  }, {
    allowedViews: ['SIDE'],
    selectedView: 'SIDE',
  });

  assert.equal(result.result, 'pass');
  assert.equal(result.reason, null);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/workout/quality-gate.test.js`
Expected: FAIL because `evaluateQualityGate` and `QUALITY_GATE_THRESHOLDS` are not exported yet.

- [ ] **Step 3: Add the threshold constants and quality-gate evaluator to `scoring-engine.js`**

```js
const QUALITY_GATE_THRESHOLDS = {
  detectionConfidence: 0.50,
  trackingConfidence: 0.50,
  estimatedViewConfidence: 0.60,
  keyJointVisibilityAverage: 0.65,
  minKeyJointVisibility: 0.40,
  stableFrameCount: 8,
  stabilityWindow: 12,
  unstableFrameRatio: 0.30,
  frameInclusionRatio: 0.85,
};

function evaluateQualityGate(inputs, context = {}) {
  if (!inputs.cameraDistanceOk) {
    return { result: 'withhold', reason: 'camera_too_close_or_far' };
  }
  if (inputs.detectionConfidence < QUALITY_GATE_THRESHOLDS.detectionConfidence) {
    return { result: 'withhold', reason: 'low_detection_confidence' };
  }
  if (inputs.trackingConfidence < QUALITY_GATE_THRESHOLDS.trackingConfidence) {
    return { result: 'withhold', reason: 'low_tracking_confidence' };
  }
  if (inputs.frameInclusionRatio < QUALITY_GATE_THRESHOLDS.frameInclusionRatio) {
    return { result: 'withhold', reason: 'body_not_fully_visible' };
  }
  if (inputs.minKeyJointVisibility < QUALITY_GATE_THRESHOLDS.minKeyJointVisibility ||
      inputs.keyJointVisibilityAverage < QUALITY_GATE_THRESHOLDS.keyJointVisibilityAverage) {
    return { result: 'withhold', reason: 'key_joints_not_visible' };
  }
  if ((context.allowedViews || []).length > 0) {
    const viewAllowed = context.allowedViews.includes(inputs.estimatedView);
    if (!viewAllowed || inputs.estimatedViewConfidence < QUALITY_GATE_THRESHOLDS.estimatedViewConfidence) {
      return { result: 'withhold', reason: 'view_mismatch' };
    }
  }
  if (inputs.unstableFrameRatio >= QUALITY_GATE_THRESHOLDS.unstableFrameRatio) {
    return { result: 'withhold', reason: 'unstable_tracking' };
  }
  if (inputs.stableFrameCount < QUALITY_GATE_THRESHOLDS.stableFrameCount) {
    return { result: 'withhold', reason: 'insufficient_stable_frames' };
  }
  return { result: 'pass', reason: null };
}

if (typeof module !== 'undefined') {
  module.exports = {
    ...(module.exports || {}),
    QUALITY_GATE_THRESHOLDS,
    evaluateQualityGate,
  };
}
```

- [ ] **Step 4: Add a normalized gate-input builder to `pose-engine.js`**

```js
function buildQualityGateInputs({
  frameInclusionRatio,
  keyJointVisibilityAverage,
  minKeyJointVisibility,
  estimatedView,
  estimatedViewConfidence,
  detectionConfidence,
  trackingConfidence,
  stableFrameCount,
  unstableFrameRatio,
  cameraDistanceOk,
}) {
  return {
    frameInclusionRatio,
    keyJointVisibilityAverage,
    minKeyJointVisibility,
    estimatedView,
    estimatedViewConfidence,
    detectionConfidence,
    trackingConfidence,
    stableFrameCount,
    unstableFrameRatio,
    cameraDistanceOk,
  };
}
```

- [ ] **Step 5: Run the quality-gate test again**

Run: `node --test test/workout/quality-gate.test.js`
Expected: PASS with 2 passing tests and 0 failures.

- [ ] **Step 6: Commit Task 1**

```bash
git add public/js/workout/pose-engine.js public/js/workout/scoring-engine.js test/workout/quality-gate.test.js
git commit -m "feat: add runtime quality gate thresholds"
```

---

### Task 2: Add gate-aware scoring state transitions and session-controller guidance

**Files:**
- Modify: `public/js/workout/scoring-engine.js`
- Modify: `public/js/workout/session-controller.js`
- Test: `test/workout/scoring-state-machine.test.js`
- Test: `test/workout/session-controller-gate-ui.test.js`

- [ ] **Step 1: Write the failing state-machine and UI-message tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  applyRepOutcome,
} = require('../../public/js/workout/scoring-engine.js');
const {
  mapWithholdReasonToMessage,
  shouldResumeScoring,
} = require('../../public/js/workout/session-controller.js');

test('applyRepOutcome discards an active rep when gate flips to withheld', () => {
  const result = applyRepOutcome({
    gateResult: 'withhold',
    repState: { active: true, repIndex: 3 },
    exerciseEvaluation: null,
  });

  assert.equal(result.repResult, 'withheld');
  assert.equal(result.incrementRepCount, false);
  assert.equal(result.discardActiveRep, true);
});

test('mapWithholdReasonToMessage returns a corrective guidance message', () => {
  assert.equal(
    mapWithholdReasonToMessage('view_mismatch'),
    '현재 운동은 옆면 시점이 필요합니다.'
  );
});

test('shouldResumeScoring requires the full stable-frame streak', () => {
  assert.equal(shouldResumeScoring({ stableFrameCount: 7, threshold: 8 }), false);
  assert.equal(shouldResumeScoring({ stableFrameCount: 8, threshold: 8 }), true);
});
```

- [ ] **Step 2: Run the two tests to verify they fail**

Run: `node --test test/workout/scoring-state-machine.test.js test/workout/session-controller-gate-ui.test.js`
Expected: FAIL because `applyRepOutcome`, `mapWithholdReasonToMessage`, and `shouldResumeScoring` are not exported yet.

- [ ] **Step 3: Implement rep outcome state transitions in `scoring-engine.js`**

```js
function applyRepOutcome({ gateResult, repState, exerciseEvaluation }) {
  if (gateResult === 'withhold') {
    return {
      repResult: 'withheld',
      incrementRepCount: false,
      discardActiveRep: Boolean(repState && repState.active),
      scoreCapApplied: null,
    };
  }
  if (exerciseEvaluation && exerciseEvaluation.hardFailReason) {
    return {
      repResult: 'hard_fail',
      incrementRepCount: false,
      discardActiveRep: true,
      scoreCapApplied: 0,
    };
  }
  if (exerciseEvaluation && exerciseEvaluation.softFailReasons && exerciseEvaluation.softFailReasons.length > 0) {
    return {
      repResult: 'soft_fail',
      incrementRepCount: true,
      discardActiveRep: false,
      scoreCapApplied: exerciseEvaluation.scoreCap,
    };
  }
  return {
    repResult: 'scored',
    incrementRepCount: true,
    discardActiveRep: false,
    scoreCapApplied: null,
  };
}
```

- [ ] **Step 4: Implement message mapping and resume gating in `session-controller.js`**

```js
function mapWithholdReasonToMessage(reason) {
  const messages = {
    body_not_fully_visible: '몸 전체가 화면에 보이도록 조금 더 뒤로 가 주세요.',
    key_joints_not_visible: '팔과 다리가 잘 보이도록 자세와 카메라를 조정해 주세요.',
    view_mismatch: '현재 운동은 옆면 시점이 필요합니다.',
    unstable_tracking: '카메라를 고정하고 잠시 자세를 유지해 주세요.',
    insufficient_stable_frames: '잠시 정지한 뒤 다시 시작해 주세요.',
    camera_too_close_or_far: '카메라와의 거리를 조금 조정해 주세요.',
    low_detection_confidence: '조명이 충분한지 확인해 주세요.',
    low_tracking_confidence: '몸이 잘 보이도록 위치를 다시 맞춰 주세요.',
  };
  return messages[reason] || '카메라와 자세를 다시 맞춰 주세요.';
}

function shouldResumeScoring({ stableFrameCount, threshold }) {
  return stableFrameCount >= threshold;
}

if (typeof module !== 'undefined') {
  module.exports = {
    ...(module.exports || {}),
    mapWithholdReasonToMessage,
    shouldResumeScoring,
  };
}
```

- [ ] **Step 5: Wire the controller so withhold suppresses scoring and repeated alerts are cooled down**

```js
if (gateEvaluation.result === 'withhold') {
  this.currentWithholdReason = gateEvaluation.reason;
  this.showStatusMessage(mapWithholdReasonToMessage(gateEvaluation.reason));
  this.pauseRepScoring = true;
  return;
}

if (this.pauseRepScoring && !shouldResumeScoring({
  stableFrameCount: gateInputs.stableFrameCount,
  threshold: QUALITY_GATE_THRESHOLDS.stableFrameCount,
})) {
  return;
}

this.pauseRepScoring = false;
this.currentWithholdReason = null;
```

- [ ] **Step 6: Run the state-machine and UI-message tests again**

Run: `node --test test/workout/scoring-state-machine.test.js test/workout/session-controller-gate-ui.test.js`
Expected: PASS with all tests green and no failures.

- [ ] **Step 7: Commit Task 2**

```bash
git add public/js/workout/scoring-engine.js public/js/workout/session-controller.js test/workout/scoring-state-machine.test.js test/workout/session-controller-gate-ui.test.js
git commit -m "feat: add gate-aware scoring state transitions"
```

---

### Task 3: Refine exercise modules so only movement-quality failures remain

**Files:**
- Modify: `public/js/workout/exercises/squat-exercise.js`
- Modify: `public/js/workout/exercises/push-up-exercise.js`
- Test: `test/workout/exercise-rule-separation.test.js`

- [ ] **Step 1: Write the failing exercise-rule tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getSquatMetricPriority,
} = require('../../public/js/workout/exercises/squat-exercise.js');
const {
  normalizePushUpEvaluation,
} = require('../../public/js/workout/exercises/push-up-exercise.js');

test('getSquatMetricPriority prefers knee alignment for FRONT view', () => {
  const priority = getSquatMetricPriority('FRONT');
  assert.deepEqual(priority.primary, ['knee_alignment']);
  assert.deepEqual(priority.secondary, ['depth']);
});

test('getSquatMetricPriority excludes knee alignment from DIAGONAL hard-fail evaluation', () => {
  const priority = getSquatMetricPriority('DIAGONAL');
  assert.equal(priority.disallowedHardFailMetrics.includes('knee_alignment'), true);
});

test('normalizePushUpEvaluation removes low_confidence from exercise failures', () => {
  const result = normalizePushUpEvaluation({
    hardFailReason: 'low_confidence',
    softFailReasons: [],
  });

  assert.equal(result.hardFailReason, null);
  assert.deepEqual(result.softFailReasons, []);
});
```

- [ ] **Step 2: Run the exercise-rule tests to verify they fail**

Run: `node --test test/workout/exercise-rule-separation.test.js`
Expected: FAIL because the helper functions do not exist yet.

- [ ] **Step 3: Add view-priority helpers to `squat-exercise.js`**

```js
function getSquatMetricPriority(view) {
  if (view === 'FRONT') {
    return {
      primary: ['knee_alignment'],
      secondary: ['depth'],
      disallowedHardFailMetrics: ['hip_hinge'],
    };
  }
  if (view === 'SIDE') {
    return {
      primary: ['depth', 'hip_hinge'],
      secondary: ['torso_stability'],
      disallowedHardFailMetrics: ['knee_alignment'],
    };
  }
  return {
    primary: ['depth'],
    secondary: ['torso_stability'],
    disallowedHardFailMetrics: ['knee_alignment'],
  };
}

if (typeof module !== 'undefined') {
  module.exports = {
    ...(module.exports || {}),
    getSquatMetricPriority,
  };
}
```

- [ ] **Step 4: Normalize push-up evaluation so confidence/view problems never leave the common gate**

```js
function normalizePushUpEvaluation(evaluation) {
  if (!evaluation) {
    return { hardFailReason: null, softFailReasons: [] };
  }

  if (evaluation.hardFailReason === 'low_confidence' || evaluation.hardFailReason === 'view_mismatch') {
    return {
      ...evaluation,
      hardFailReason: null,
      softFailReasons: (evaluation.softFailReasons || []).filter((reason) => {
        return reason !== 'low_confidence' && reason !== 'view_mismatch';
      }),
    };
  }

  return evaluation;
}

if (typeof module !== 'undefined') {
  module.exports = {
    ...(module.exports || {}),
    normalizePushUpEvaluation,
  };
}
```

- [ ] **Step 5: Run the exercise-rule tests again**

Run: `node --test test/workout/exercise-rule-separation.test.js`
Expected: PASS with all tests green.

- [ ] **Step 6: Commit Task 3**

```bash
git add public/js/workout/exercises/squat-exercise.js public/js/workout/exercises/push-up-exercise.js test/workout/exercise-rule-separation.test.js
git commit -m "feat: separate movement failures from input quality failures"
```

---

### Task 4: Persist MVP export data and add validation artifacts

**Files:**
- Modify: `public/js/workout/session-buffer.js`
- Modify: `test/session-buffer.test.js`
- Create: `docs/superpowers/validation/video-label-template.md`

- [ ] **Step 1: Extend the failing export test in `test/session-buffer.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const SessionBuffer = require('../public/js/workout/session-buffer.js');

test('export includes withhold counts and rep-level scoring states', () => {
  const buffer = new SessionBuffer('session-1');

  buffer.recordEvent({
    type: 'withhold',
    timestamp: 1000,
    gate_result: 'withhold',
    withhold_reason: 'view_mismatch',
    estimated_view: 'FRONT',
    estimated_view_confidence: 0.42,
    stable_frame_count: 3,
  });

  buffer.recordRepResult({
    rep_index: 1,
    rep_result: 'soft_fail',
    rep_score: 68,
    hard_fail_reason: null,
    soft_fail_reasons: ['depth_not_reached'],
    score_cap_applied: 70,
    quality_summary: { estimated_view: 'SIDE' },
  });

  const exported = buffer.export();

  assert.equal(exported.withhold_count, 1);
  assert.equal(exported.withhold_reason_counts.view_mismatch, 1);
  assert.equal(exported.rep_results[0].rep_result, 'soft_fail');
});
```

- [ ] **Step 2: Run the session-buffer test to verify it fails**

Run: `node --test test/session-buffer.test.js`
Expected: FAIL because the export payload does not include the new MVP fields yet.

- [ ] **Step 3: Add the MVP export fields to `session-buffer.js`**

```js
recordRepResult(repResult) {
  this.repResults = this.repResults || [];
  this.repResults.push(repResult);
}

export() {
  const withholdEvents = (this.events || []).filter((event) => event.type === 'withhold');
  const withholdReasonCounts = withholdEvents.reduce((acc, event) => {
    const reason = event.withhold_reason || 'unknown';
    acc[reason] = (acc[reason] || 0) + 1;
    return acc;
  }, {});

  const payload = {
    session_id: this.sessionId,
    exercise_type: this.exerciseType,
    selected_view: this.selectedView,
    allowed_views: this.allowedViews,
    default_view: this.defaultView,
    final_score: this.finalScore,
    metric_results: this.metricResults || [],
    interim_snapshots: this.interimSnapshots || [],
    events: this.events || [],
  };

  payload.withhold_count = withholdEvents.length;
  payload.withhold_reason_counts = withholdReasonCounts;
  payload.rep_results = this.repResults || [];

  return payload;
}
```

- [ ] **Step 4: Create the validation label template doc**

```md
# Validation Video Label

- video_id:
- file_name:
- exercise_type: squat | push-up
- expected_view:
- actual_view_note:
- expected_gate_result: pass | withhold
- expected_withhold_reason:
- expected_rep_result_summary:
- major_observed_issues:
- notes:
```

Save to: `docs/superpowers/validation/video-label-template.md`

- [ ] **Step 5: Run the session-buffer test again**

Run: `node --test test/session-buffer.test.js`
Expected: PASS with all session-buffer tests green.

- [ ] **Step 6: Run the focused regression suite for all new runtime checks**

Run: `node --test test/workout/quality-gate.test.js test/workout/scoring-state-machine.test.js test/workout/session-controller-gate-ui.test.js test/workout/exercise-rule-separation.test.js test/session-buffer.test.js`
Expected: PASS with all listed tests green and 0 failures.

- [ ] **Step 7: Commit Task 4**

```bash
git add public/js/workout/session-buffer.js test/session-buffer.test.js docs/superpowers/validation/video-label-template.md
git commit -m "feat: export runtime validation data for offline review"
```

---

## Final Verification

- [ ] Run: `npm test`
- [ ] Expected: the full Node test suite passes with no new failures.
- [ ] Manually verify in the browser:
  - low-quality frames show corrective withhold guidance instead of low scores
  - scoring resumes only after the stable-frame streak is restored
  - squat FRONT/SIDE/DIAGONAL views use the intended metric priority rules
  - push-up SIDE mismatch never becomes an exercise hard fail
  - exported session JSON contains `withhold_count`, `withhold_reason_counts`, and `rep_results`

---

## Spec Coverage Check

- Quality-gate threshold seeds: covered by Task 1
- Gate-vs-exercise responsibility split: covered by Tasks 1 and 3
- Scoring state transitions (`scored|withheld|hard_fail|soft_fail`): covered by Task 2
- Session-controller guidance and resume behavior: covered by Task 2
- Squat view-priority rules: covered by Task 3
- Push-up confidence/view cleanup: covered by Task 3
- Session-buffer MVP export and validation label template: covered by Task 4

## Placeholder Scan

- No `TODO`, `TBD`, or deferred implementation markers remain.
- All code-changing steps include concrete snippets or exact files to update.
- All test steps include exact commands.

## Type Consistency Check

- `evaluateQualityGate` always returns `{ result, reason }`
- `applyRepOutcome` always returns `{ repResult, incrementRepCount, discardActiveRep, scoreCapApplied }`
- `mapWithholdReasonToMessage` always returns a string
- `getSquatMetricPriority` always returns `{ primary, secondary, disallowedHardFailMetrics }`
- `normalizePushUpEvaluation` always returns an evaluation object with `hardFailReason` and `softFailReasons`

---
