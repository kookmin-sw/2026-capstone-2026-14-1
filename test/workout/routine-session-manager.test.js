const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createRoutineSessionManager,
  resetRoutineSetState,
  resetRoutineStepState,
  resolveNextRoutineStepIndex,
  resolveRoutineAdvanceAction,
  resolveRoutineStepConfig,
} = require('../../public/js/workout/routine-session-manager.js');

test('resolveRoutineAdvanceAction returns NEXT_SET when server asks for next set', () => {
  const result = resolveRoutineAdvanceAction({
    action: 'NEXT_SET',
    restSec: 30,
    nextSessionId: 42,
  });

  assert.deepEqual(result, {
    action: 'NEXT_SET',
    restSec: 30,
    nextSessionId: 42,
  });
});

test('resolveRoutineAdvanceAction falls back to ROUTINE_COMPLETE for final step', () => {
  const result = resolveRoutineAdvanceAction({
    action: '',
    currentSet: 3,
    totalSets: 3,
    hasNextExerciseStep: false,
    fallbackRestSec: 0,
  });

  assert.deepEqual(result, {
    action: 'ROUTINE_COMPLETE',
    restSec: 0,
    nextSessionId: null,
  });
});

test('resetRoutineStepState resets step-scoped routine counters', () => {
  const state = {
    currentSet: 3,
    currentRep: 12,
    currentSetWorkSec: 18,
    currentSegmentSec: 6,
    bestHoldSec: 27,
    plankGoalReached: true,
    restAfterAction: 'NEXT_EXERCISE',
    repMetricBuffer: { tempo: 1 },
    lastRepMetricSummary: ['tempo'],
    repInProgressPrev: true,
  };

  resetRoutineStepState(state);

  assert.deepEqual(state, {
    currentSet: 1,
    currentRep: 0,
    currentSetWorkSec: 0,
    currentSegmentSec: 0,
    bestHoldSec: 0,
    plankGoalReached: false,
    restAfterAction: null,
    repMetricBuffer: {},
    lastRepMetricSummary: [],
    repInProgressPrev: false,
  });
});

test('resetRoutineSetState preserves set index while clearing set-local tracking', () => {
  const state = {
    currentSet: 2,
    currentRep: 7,
    currentSetWorkSec: 13,
    currentSegmentSec: 4,
    bestHoldSec: 19,
    plankGoalReached: true,
    repMetricBuffer: { depth: 1 },
    lastRepMetricSummary: ['depth'],
    repInProgressPrev: true,
  };

  resetRoutineSetState(state);

  assert.equal(state.currentSet, 2);
  assert.equal(state.currentRep, 0);
  assert.equal(state.currentSetWorkSec, 0);
  assert.equal(state.currentSegmentSec, 0);
  assert.equal(state.bestHoldSec, 0);
  assert.equal(state.plankGoalReached, false);
  assert.deepEqual(state.repMetricBuffer, {});
  assert.deepEqual(state.lastRepMetricSummary, []);
  assert.equal(state.repInProgressPrev, false);
});

test('resolveRoutineStepConfig derives exercise runtime inputs for TIME targets', () => {
  const result = resolveRoutineStepConfig({
    routineSetup: [
      {
        target_type: 'TIME',
        target_value: 45,
        scoring_profile: { id: 3 },
        exercise: { code: 'plank', name: '플랭크' },
      },
    ],
    stepIndex: 0,
    normalizeTargetType: (value) => String(value || '').toUpperCase(),
    resolveDefaultView: (exercise) => `${exercise.code}_VIEW`,
  });

  assert.deepEqual(result, {
    exercise: { code: 'plank', name: '플랭크' },
    scoringProfile: { id: 3 },
    selectedView: 'plank_VIEW',
    targetSec: 45,
  });
});

test('resolveNextRoutineStepIndex returns null when the routine is complete', () => {
  assert.equal(
    resolveNextRoutineStepIndex({
      currentStepIndex: 1,
      routineSetup: [{}, {}],
    }),
    null,
  );
});

test('checkRoutineProgress returns NONE before target is reached', async () => {
  let fetchCalls = 0;
  const manager = createRoutineSessionManager({
    state: { sessionId: 55 },
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error('fetch should not be called before reaching the target');
    },
    startRest() {
      throw new Error('startRest should not be called before reaching the target');
    },
    finishWorkout() {
      throw new Error(
        'finishWorkout should not be called before reaching the target',
      );
    },
  });

  const result = await manager.checkRoutineProgress({
    actualValue: 4,
    targetValue: 5,
    currentSet: 1,
    totalSets: 3,
    hasNextExerciseStep: true,
    payload: { rest_sec: 20 },
  });

  assert.deepEqual(result, {
    action: 'NONE',
    restSec: 0,
    nextSessionId: null,
  });
  assert.equal(fetchCalls, 0);
});

test('manager reset helpers mutate the injected session state', () => {
  const state = {
    currentSet: 4,
    currentRep: 9,
    currentSetWorkSec: 22,
    currentSegmentSec: 8,
    bestHoldSec: 30,
    plankGoalReached: true,
    restAfterAction: 'NEXT_SET',
    repMetricBuffer: { cadence: 1 },
    lastRepMetricSummary: ['cadence'],
    repInProgressPrev: true,
  };
  const manager = createRoutineSessionManager({ state });

  manager.resetSetState();
  assert.equal(state.currentSet, 4);
  assert.equal(state.currentRep, 0);

  manager.resetStepState();
  assert.equal(state.currentSet, 1);
  assert.equal(state.restAfterAction, null);
});

test('checkRoutineProgress starts rest for NEXT_SET responses', async () => {
  const calls = [];
  const manager = createRoutineSessionManager({
    state: { sessionId: 55 },
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        success: true,
        routine: {
          action: 'NEXT_SET',
          rest_sec: 25,
          next_session: { session_id: 91 },
        },
      }),
    }),
    startRest(restSec, reason) {
      calls.push({ restSec, reason });
    },
    finishWorkout() {
      throw new Error('finishWorkout should not run for NEXT_SET');
    },
  });

  const result = await manager.checkRoutineProgress({
    actualValue: 5,
    targetValue: 5,
    currentSet: 1,
    totalSets: 3,
    hasNextExerciseStep: true,
    payload: { rest_sec: 10 },
  });

  assert.deepEqual(result, {
    action: 'NEXT_SET',
    restSec: 25,
    nextSessionId: 91,
    routineState: {
      action: 'NEXT_SET',
      rest_sec: 25,
      next_session: { session_id: 91 },
    },
  });
  assert.deepEqual(calls, [{ restSec: 25, reason: 'NEXT_SET' }]);
});

test('checkRoutineProgress finishes the workout for ROUTINE_COMPLETE responses', async () => {
  let finishCalls = 0;
  const manager = createRoutineSessionManager({
    state: { sessionId: 55 },
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        success: true,
        routine: {
          action: 'ROUTINE_COMPLETE',
          rest_sec: 0,
        },
      }),
    }),
    async finishWorkout() {
      finishCalls += 1;
    },
  });

  const result = await manager.checkRoutineProgress({
    actualValue: 5,
    targetValue: 5,
    currentSet: 3,
    totalSets: 3,
    hasNextExerciseStep: false,
    payload: { rest_sec: 0 },
  });

  assert.equal(result.action, 'ROUTINE_COMPLETE');
  assert.equal(finishCalls, 1);
});

test('checkRoutineProgress still finishes the workout when ROUTINE_COMPLETE includes rest time', async () => {
  let finishCalls = 0;
  let startRestCalls = 0;
  const manager = createRoutineSessionManager({
    state: { sessionId: 55 },
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        success: true,
        routine: {
          action: 'ROUTINE_COMPLETE',
          rest_sec: 15,
        },
      }),
    }),
    startRest() {
      startRestCalls += 1;
    },
    async finishWorkout() {
      finishCalls += 1;
    },
  });

  const result = await manager.checkRoutineProgress({
    actualValue: 5,
    targetValue: 5,
    currentSet: 3,
    totalSets: 3,
    hasNextExerciseStep: false,
    payload: { rest_sec: 15 },
  });

  assert.equal(result.action, 'ROUTINE_COMPLETE');
  assert.equal(result.restSec, 15);
  assert.equal(startRestCalls, 0);
  assert.equal(finishCalls, 1);
});
