const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createRoutineSessionManager,
  resolveRoutineAdvanceAction,
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
